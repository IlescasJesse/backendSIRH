const { connect, insertOne } = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const { querysql } = require("../../config/mysql");
const { filtroTalonesDe, talonesSonDe } = require("../../libs/talonesQuincena");

// Estados de un talón (TALONES[].STATUS), igual que en el front (perfil-talon):
//   1 = PENDIENTE de entregar (así lo crea libs/talonesQuincena)
//   2 = ENTREGADO / disponible para préstamo (firmado, con IMAGE)
//   3 = PRESTADO (pendiente de regresar)
// Transiciones permitidas:
//   PENDIENTE → ENTREGADO             (entregar-talon, con imagen firmada)
//   PENDIENTE o ENTREGADO → PRESTADO  (prestar-talon)
//   PRESTADO → ENTREGADO              (regresar-talon; el original vuelve firmado)
const TALON_STATUS = { PENDIENTE: 1, ENTREGADO: 2, PRESTADO: 3 };

// Logs de OCR solo cuando se activa a propósito (nunca en producción por defecto).
const TALONES_DEBUG = process.env.TALONES_DEBUG === "1";
const debugLog = (...args) => {
  if (TALONES_DEBUG) console.log(...args);
};

// Imagen recibida: máximo ~10 MB de archivo (base64 crece ~4/3).
const MAX_IMAGE_BASE64_LENGTH = Math.ceil((10 * 1024 * 1024 * 4) / 3);
// Imagen guardada: se reduce y comprime para no inflar el documento TALONES
// del empleado (MongoDB limita cada documento a 16 MB).
const STORED_IMAGE_MAX_WIDTH = 1600;
const STORED_IMAGE_QUALITY = 70;

// Campos del empleado que necesita la pantalla del perfil de talón.
const EMPLEADO_PERFIL_PROJECTION = {
  NOMBRES: 1,
  APE_PAT: 1,
  APE_MAT: 1,
  NUMEMP: 1,
  NUMPLA: 1,
  ADSCRIPCION: 1,
  NOMCATE: 1,
  PROYECTO: 1,
  TIPONOM: 1,
  SEXO: 1,
  VACACIONES: 1,
  ID_BITACORA: 1,
  ID_CTRL_ASIST: 1,
  FECHA_INGRESO: 1,
  SINDICATO: 1,
};

const EMPLEADO_LISTA_PROJECTION = {
  NUMEMP: 1,
  RFC: 1, // solo para ligar los talones a la persona; no se devuelve
  NOMBRES: 1,
  APE_PAT: 1,
  APE_MAT: 1,
  TIPONOM: 1,
  ADSCRIPCION: 1,
};

const find = async (collectionName, filter, projection) => {
  const database = await connect();
  return database.collection(collectionName).find(filter, { projection }).toArray();
};

const aggregate = async (collectionName, pipeline) => {
  const database = await connect();
  return database.collection(collectionName).aggregate(pipeline).toArray();
};

const nombreEmpleado = (empleado) =>
  `${empleado.APE_PAT || ""} ${empleado.APE_MAT || ""} ${empleado.NOMBRES || ""}`
    .trim()
    .replace(/\s+/g, " ");

const normalizeText = (text = "") =>
  text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // elimina acentos
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const containsPattern = (text, regex) => {
  if (!text) return false;
  return regex.test(text);
};

const talonContainsPagador = (text) =>
  containsPattern(text, /P\s*A\s*G\s*A\s*D\s*O\s*R/);

const talonContainsFirmaRecibido = (text) =>
  containsPattern(text, /F\s*I\s*R\s*M\s*A[\s\S]{0,30}R\s*E\s*C\s*I\s*B\s*I\s*D\s*O/) ||
  containsPattern(text, /R\s*E\s*C\s*I\s*B\s*I\s*D\s*O[\s\S]{0,30}F\s*I\s*R\s*M\s*A/);

const talonContainsEmpleado = (text) =>
  containsPattern(text, /E\s*M\s*P\s*L\s*E\s*A\s*D\s*O/);

const talonNormalize = (text) => normalizeText(text);

// Busca el talón por su _id y devuelve el documento (sin imágenes) y el talón.
const buscarTalon = async (talonObjectId) => {
  const [doc] = await aggregate("TALONES", [
    { $match: { "TALONES._id": talonObjectId } },
    { $limit: 1 },
    {
      $project: {
        _idEmployee: 1,
        talon: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$TALONES",
                as: "t",
                cond: { $eq: ["$$t._id", talonObjectId] },
              },
            },
            0,
          ],
        },
      },
    },
    { $addFields: { tieneImagen: { $ne: [{ $type: "$talon.IMAGE" }, "missing"] } } },
    { $project: { "talon.IMAGE": 0, "talon.IMAGE_REGRESO": 0 } },
  ]);
  return doc && doc.talon ? doc : null;
};

// Lista los talones con cierto STATUS de empleados activos, sin imágenes.
const listarTalonesPorStatus = async (status) => {
  const docs = await aggregate("TALONES", [
    { $match: { "TALONES.STATUS": status } },
    {
      $project: {
        _idEmployee: 1,
        NUMEMP: 1,
        RFC: 1,
        TALONES: {
          $map: {
            input: {
              $filter: {
                input: "$TALONES",
                as: "t",
                cond: { $eq: ["$$t.STATUS", status] },
              },
            },
            as: "t",
            in: {
              _id: "$$t._id",
              QUIN: "$$t.QUIN",
              YEAR: "$$t.YEAR",
              STATUS: "$$t.STATUS",
              PRESTAMO_ID: "$$t.PRESTAMO_ID",
              TIPO_RECEPTOR: "$$t.TIPO_RECEPTOR",
              NOMBRE_RECEPTOR: "$$t.NOMBRE_RECEPTOR",
              FECHA_PRESTAMO: "$$t.FECHA_PRESTAMO",
              FOLIO_RH: "$$t.FOLIO_RH",
            },
          },
        },
      },
    },
  ]);

  if (docs.length === 0) return [];

  const ids = docs.map((doc) => doc._idEmployee).filter(Boolean);
  const [plantilla, foranea] = await Promise.all([
    find("PLANTILLA", { _id: { $in: ids }, status: 1 }, EMPLEADO_LISTA_PROJECTION),
    find("PLANTILLA_FORANEA", { _id: { $in: ids }, status: 1 }, EMPLEADO_LISTA_PROJECTION),
  ]);
  const empleadosMap = new Map(
    [...plantilla, ...foranea].map((emp) => [emp._id.toString(), emp]),
  );

  const resultado = [];
  for (const doc of docs) {
    const empleado = doc._idEmployee ? empleadosMap.get(doc._idEmployee.toString()) : null;
    // Solo talones de quien ocupa hoy la plaza (no de ocupantes anteriores).
    if (!empleado || !talonesSonDe(doc, empleado)) continue;
    for (const talon of doc.TALONES) {
      resultado.push({
        _id: talon._id,
        QUINCENA: talon.QUIN,
        YEAR: talon.YEAR,
        status: talon.STATUS,
        PRESTAMO_ID: talon.PRESTAMO_ID,
        TIPO_RECEPTOR: talon.TIPO_RECEPTOR,
        NOMBRE_RECEPTOR: talon.NOMBRE_RECEPTOR,
        FECHA_PRESTAMO: talon.FECHA_PRESTAMO,
        FOLIO_RH: talon.FOLIO_RH,
        empleado: {
          _id: empleado._id,
          NOMBRE: nombreEmpleado(empleado),
          TIPONOM: empleado.TIPONOM,
          ADSCRIPCION: empleado.ADSCRIPCION,
        },
      });
    }
  }
  return resultado;
};

const textoOpcional = (valor, max) =>
  valor === undefined || valor === null || (typeof valor === "string" && valor.length <= max);

const textoObligatorio = (valor, max) =>
  typeof valor === "string" && valor.trim() !== "" && valor.length <= max;

// Valida la foto o escaneo de un talón firmado (OCR de "PAGADOR" y "FIRMA DE
// RECIBIDO", y tinta en el espacio de firma). Devuelve { storedImage } con la
// imagen reducida y comprimida, o { status, body } con el error a responder.
const procesarImagenTalon = async (image) => {
  const fallo = (status, body) => ({ status, body });

  if (typeof image !== "string" || image.length > MAX_IMAGE_BASE64_LENGTH) {
    return fallo(413, {
      codigo: "IMAGEN_INVALIDA",
      error: "La imagen del talón no es válida o supera los 10 MB."
    });
  }

  // Convertir base64 a buffer
  const base64Data = image.replace(/^data:image\/[\w+.-]+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, "base64");

  // Procesar imagen con sharp para obtener dimensiones y extraer regiones
  let metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch {
    return fallo(400, {
      codigo: "IMAGEN_INVALIDA",
      error: "El archivo enviado no es una imagen válida."
    });
  }
  const { width, height } = metadata;

  // Recortar las etiquetas de forma independiente para excluir el sello del escáner.
  const pagadorRegion = await sharp(imageBuffer)
    .extract({
      left: Math.floor(width * 0.13),
      top: Math.floor(height * 0.92),
      width: Math.floor(width * 0.09),
      height: Math.floor(height * 0.06),
    })
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: Math.floor(width * 0.27) })
    .toBuffer();

  const firmaTextRegion = await sharp(imageBuffer)
    .extract({
      left: Math.floor(width * 0.79),
      top: Math.floor(height * 0.92),
      width: Math.floor(width * 0.14),
      height: Math.floor(height * 0.06),
    })
    .grayscale()
    .normalize()
    .sharpen()
    .resize({ width: Math.floor(width * 0.42) })
    .toBuffer();

  const ocrOptions = {
    tessedit_pageseg_mode: "7",
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ ",
  };
  if (TALONES_DEBUG) ocrOptions.logger = (m) => console.log(m);

  const [pagadorResult, firmaResult] = await Promise.all([
    Tesseract.recognize(pagadorRegion, "spa", ocrOptions),
    Tesseract.recognize(firmaTextRegion, "spa", ocrOptions),
  ]);

  const normalizedPagadorText = talonNormalize(pagadorResult?.data?.text || "");
  const normalizedFirmaText = talonNormalize(firmaResult?.data?.text || "");

  debugLog("Texto detectado en región de pagador:", normalizedPagadorText);
  debugLog("Texto detectado en región de firma:", normalizedFirmaText);

  const contienePagador = talonContainsPagador(normalizedPagadorText);
  const contieneEmpleado = talonContainsEmpleado(normalizedPagadorText);
  const contieneFirmaRecibido = talonContainsFirmaRecibido(normalizedFirmaText);

  if (contieneEmpleado) {
    return fallo(422, {
      codigo: "TALON_CONTIENE_EMPLEADO",
      error: 'El talón contiene "EMPLEADO" en lugar de "PAGADOR".'
    });
  }

  if (!contienePagador) {
    return fallo(422, {
      codigo: "TALON_SIN_PAGADOR",
      error: 'No se identificó la sección "PAGADOR" en el talón.'
    });
  }

  if (!contieneFirmaRecibido) {
    return fallo(422, {
      codigo: "TALON_SIN_FIRMA_RECIBIDO",
      error: 'No se encontró la sección "FIRMA DE RECIBIDO" en el talón.'
    });
  }

  // Revisar el espacio sobre la leyenda impresa, donde se espera la firma manuscrita.
  const firmaWidth = Math.floor(width * 0.3);
  const firmaHeight = Math.floor(height * 0.12);
  const firmaRegion = await sharp(imageBuffer)
    .extract({
      left: width - firmaWidth,
      top: Math.floor(height * 0.8),
      width: firmaWidth,
      height: firmaHeight,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Contar tinta oscura o de color, sin exigir que la firma sea azul.
  const { data: pixels, info } = firmaRegion;
  let inkPixelCount = 0;
  const totalPixels = info.width * info.height;

  for (let i = 0; i < pixels.length; i += info.channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const darkestChannel = Math.min(r, g, b);
    const lightestChannel = Math.max(r, g, b);
    const isDarkInk = (r + g + b) / 3 < 180;
    const isColoredInk =
      lightestChannel - darkestChannel > 35 && lightestChannel < 245;

    if (isDarkInk || isColoredInk) {
      inkPixelCount++;
    }
  }

  const inkPercentage = (inkPixelCount / totalPixels) * 100;
  debugLog(`Píxeles con tinta en región de firma: ${inkPercentage.toFixed(2)}%`);

  if (inkPercentage <= 0.5) {
    return fallo(422, {
      codigo: "TALON_SIN_FIRMA",
      error: "No se detectó tinta en el espacio de firma del talón."
    });
  }

  // Guardar una versión reducida y comprimida de la imagen.
  const storedBuffer = await sharp(imageBuffer)
    .rotate()
    .resize({ width: STORED_IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: STORED_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer();
  const storedImage = `data:image/jpeg;base64,${storedBuffer.toString("base64")}`;
  return { storedImage };
};

const talonesController = {};

// Obtener perfil del empleado con sus talones
talonesController.getProfile = async (req, res) => {
  const id = req.params.id;
  const user = req.user;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Identificador de empleado inválido" });
  }

  try {
    const empleadoId = new ObjectId(id);
    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      find("PLANTILLA", { _id: empleadoId }, { ...EMPLEADO_PERFIL_PROJECTION, RFC: 1 }),
      find("PLANTILLA_FORANEA", { _id: empleadoId }, { ...EMPLEADO_PERFIL_PROJECTION, RFC: 1 }),
    ]);

    const emp = employeePlantilla[0] || employeeForanea[0];
    if (!emp) {
      return res.status(404).send({ error: "No data found" });
    }

    // De la bitácora la pantalla solo usa la sección de talón. Los talones son
    // solo los de quien ocupa hoy la plaza.
    // Incapacidades y permisos: la pantalla avisa si hay uno activo hoy.
    const ctrlAsist = emp.ID_CTRL_ASIST && ObjectId.isValid(String(emp.ID_CTRL_ASIST))
      ? new ObjectId(String(emp.ID_CTRL_ASIST))
      : null;
    const [bitacora, talonesDoc, incapacidades, permisosExt] = await Promise.all([
      find("BITACORA", { id_plantilla: emp._id }, { talon: 1 }),
      find("TALONES", filtroTalonesDe(emp)),
      ctrlAsist ? find("INCAPACIDADES", { ID_CTRL_ASIST: ctrlAsist }) : [],
      ctrlAsist ? find("PERMISOS_EXT", { ID_CTRL_ASIST: ctrlAsist }) : [],
    ]);
    delete emp.RFC; // solo se usó para ligar los talones a la persona
    emp.bitacora = bitacora;

    // El préstamo usa el nombre del delegado sindical como receptor.
    if (emp.SINDICATO?.DELEGACION) {
      const delegados = await querysql(
        "SELECT delegado FROM delegaciones WHERE delegacion = ?",
        [emp.SINDICATO.DELEGACION],
      );
      emp.SINDICATO.DELEGADO = delegados.length > 0 ? delegados[0].delegado : null;
    }

    const ASIST_PROFILE = {
      employee: [emp],
      incapacidades,
      permisosExt,
      talones: talonesDoc, // talón actual y anteriores
    };

    await insertOne("USER_ACTIONS", {
      timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
      username: user.username,
      module: "TP",
      action: `CONSULTÓ EL PERFIL DE TALÓN DEL EMPLEADO "${nombreEmpleado(emp)}"`,
    });

    res.status(200).send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error.message);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

// Obtener talones pendientes a regresar (prestados)
talonesController.getAllTalonesPendientesRegresar = async (req, res) => {
  const user = req.user;

  try {
    const talonesRegresar = await listarTalonesPorStatus(TALON_STATUS.PRESTADO);

    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: "CONSULTÓ TALONES PENDIENTES A REGRESAR",
      timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    return res.status(200).send(talonesRegresar);
  } catch (error) {
    console.error("Error fetching talones a regresar:", error.message);
    res.status(500).send({ error: "An error occurred while fetching talones" });
  }
};

// Obtener talones pendientes a entregar con información del empleado
talonesController.getAllTalonesPendintesEntregar = async (req, res) => {
  const user = req.user;

  try {
    const talonesEntregar = await listarTalonesPorStatus(TALON_STATUS.PENDIENTE);

    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: "CONSULTÓ TALONES PENDIENTES A ENTREGAR",
      timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
    });

    return res.status(200).send(talonesEntregar);
  } catch (error) {
    console.error("Error fetching talones a entregar:", error.message);
    res.status(500).send({ error: "An error occurred while fetching talones" });
  }
};

// Realizar la entrega del talón de pago (PENDIENTE → ENTREGADO)
talonesController.uploadTalonImage = async (req, res) => {
  const { _idTalon, image } = req.body || {};
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  if (!_idTalon || !image) {
    return res.status(400).send({
      codigo: "DATOS_INCOMPLETOS",
      error: "Faltan datos para procesar el talón de pago."
    });
  }

  if (typeof _idTalon !== "string" || !ObjectId.isValid(_idTalon)) {
    return res.status(400).send({
      codigo: "TALON_ID_INVALIDO",
      error: "El identificador del talón de pago no es válido."
    });
  }

  try {
    const talonObjectId = new ObjectId(_idTalon);
    const encontrado = await buscarTalon(talonObjectId);

    if (!encontrado) {
      return res.status(404).send({
        codigo: "TALON_NO_ENCONTRADO",
        error: "No se encontró el talón de pago solicitado."
      });
    }

    const { talon } = encontrado;
    if (talon.STATUS !== TALON_STATUS.PENDIENTE) {
      return res.status(409).send({
        codigo: "TALON_NO_PENDIENTE",
        error: "El talón de pago ya fue entregado o está prestado."
      });
    }

    const procesada = await procesarImagenTalon(image);
    if (!procesada.storedImage) {
      return res.status(procesada.status).send(procesada.body);
    }
    const { storedImage } = procesada;

    // Solo actualiza si el talón sigue PENDIENTE (evita entregas dobles simultáneas).
    const result = await (await connect()).collection("TALONES").updateOne(
      {
        _id: encontrado._id,
        TALONES: { $elemMatch: { _id: talonObjectId, STATUS: TALON_STATUS.PENDIENTE } },
      },
      {
        $set: {
          "TALONES.$.IMAGE": storedImage,
          "TALONES.$.STATUS": TALON_STATUS.ENTREGADO,
          "TALONES.$.FECHA_ENTREGA": new Date(),
          "TALONES.$.ENTREGADO_POR": user.username,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(409).send({
        codigo: "TALON_NO_PENDIENTE",
        error: "El talón de pago ya fue entregado o está prestado."
      });
    }

    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: `HIZO LA ENTREGA DEL TALÓN DE PAGO DE LA QUINCENA ${talon.QUIN} DEL AÑO ${talon.YEAR} AL EMPLEADO`,
      timestamp: currentDateTime,
    });

    res.status(200).send({ message: "Imagen guardada correctamente en el talón.", _id: encontrado._idEmployee });
  } catch (error) {
    console.error("Error al subir imagen al talón:", error.message);
    const response = {
      codigo: "ERROR_INTERNO",
      error: "Ocurrió un error al procesar el talón de pago."
    };
    if (process.env.NODE_ENV !== "production") {
      response.details = error.message;
    }
    return res.status(500).send(response);
  }
};

const MAX_TALONES_LOTE = 48;
const NOMBRE_STATUS = { 1: "PENDIENTE", 2: "ENTREGADO", 3: "PRESTADO" };

// Lee del body los talones a procesar: `_ids` (lote) o `_id` (uno).
const leerIdsTalones = ({ _id, _ids } = {}) => {
  if (_ids !== undefined) {
    if (!Array.isArray(_ids) || _ids.length === 0 || _ids.length > MAX_TALONES_LOTE) {
      return { error: `_ids debe ser una lista de 1 a ${MAX_TALONES_LOTE} talones.` };
    }
    if (!_ids.every((id) => typeof id === "string" && ObjectId.isValid(id))) {
      return { error: "_ids contiene identificadores de talón inválidos." };
    }
    return { ids: [...new Set(_ids)].map((id) => new ObjectId(id)), esLote: true };
  }
  if (typeof _id === "string" && ObjectId.isValid(_id)) {
    return { ids: [new ObjectId(_id)], esLote: false };
  }
  return { error: "Se requiere un identificador válido para el talón de pago (_id o _ids)." };
};

// Busca varios talones (sin imágenes; TIENE_IMAGEN indica si ya tienen IMAGE)
// y revisa que todos sean del mismo empleado y estén en un estado permitido.
const revisarTalones = async (ids, estadosPermitidos) => {
  const docs = await aggregate("TALONES", [
    { $match: { "TALONES._id": { $in: ids } } },
    {
      $project: {
        _idEmployee: 1,
        TALONES: {
          $map: {
            input: {
              $filter: { input: "$TALONES", as: "t", cond: { $in: ["$$t._id", ids] } },
            },
            as: "t",
            in: {
              $mergeObjects: [
                "$$t",
                { TIENE_IMAGEN: { $ne: [{ $type: "$$t.IMAGE" }, "missing"] } },
              ],
            },
          },
        },
      },
    },
    { $project: { "TALONES.IMAGE": 0, "TALONES.IMAGE_REGRESO": 0 } },
  ]);

  if (docs.length > 1) {
    return {
      error: {
        status: 400,
        body: {
          codigo: "TALONES_DE_DISTINTOS_EMPLEADOS",
          error: "Todos los talones del lote deben ser del mismo empleado.",
        },
      },
    };
  }

  const doc = docs[0];
  const porId = new Map((doc?.TALONES || []).map((t) => [String(t._id), t]));
  const fallidos = [];
  for (const id of ids) {
    const talon = porId.get(String(id));
    if (!talon) {
      fallidos.push({ _id: id, motivo: "NO_ENCONTRADO" });
    } else if (!estadosPermitidos.includes(talon.STATUS)) {
      fallidos.push({ _id: id, QUIN: talon.QUIN, YEAR: talon.YEAR, motivo: NOMBRE_STATUS[talon.STATUS] || `STATUS_${talon.STATUS}` });
    }
  }
  return { doc, talones: ids.map((id) => porId.get(String(id))), fallidos };
};

// Filtro que exige que TODOS los talones sigan en un estado permitido
// (todo o nada, también si dos usuarios actúan al mismo tiempo).
const filtroTodosEnEstado = (docId, ids, estados) => ({
  _id: docId,
  TALONES: {
    $all: ids.map((id) => ({ $elemMatch: { _id: id, STATUS: { $in: estados } } })),
  },
});

const describirQuincenas = (talones) =>
  talones.map((t) => `${t.QUIN}/${t.YEAR}`).join(", ");

// Realizar el préstamo del talón de pago.
// - Uno (`_id`): PENDIENTE o ENTREGADO → PRESTADO.
// - Lote (`_ids`, mismo empleado): PENDIENTES o ENTREGADOS → PRESTADO. Todo o nada.
// Todos los talones del préstamo comparten un PRESTAMO_ID para regresarlos juntos.
talonesController.prestarTalon = async (req, res) => {
  const body = req.body || {};
  const { TIPO_RECEPTOR, NOMBRE_RECEPTOR, FECHA_PRESTAMO, FOLIO_RH, OBSERVACIONES } = body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  const { ids, esLote, error } = leerIdsTalones(body);
  if (error) {
    return res.status(400).send({ codigo: "TALON_ID_INVALIDO", error });
  }

  if (!textoObligatorio(TIPO_RECEPTOR, 100)) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "TIPO_RECEPTOR es obligatorio (texto de hasta 100 caracteres)." });
  }
  if (!textoObligatorio(FOLIO_RH, 100)) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "FOLIO_RH es obligatorio (texto de hasta 100 caracteres)." });
  }
  const fechaPrestamo = typeof FECHA_PRESTAMO === "string" ? moment(FECHA_PRESTAMO, moment.ISO_8601, true) : null;
  if (!fechaPrestamo || !fechaPrestamo.isValid()) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "FECHA_PRESTAMO es obligatoria y debe ser una fecha válida (ISO 8601)." });
  }
  if (!textoOpcional(NOMBRE_RECEPTOR, 200)) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "NOMBRE_RECEPTOR debe ser texto de hasta 200 caracteres." });
  }
  if (!textoOpcional(OBSERVACIONES, 1000)) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "OBSERVACIONES debe ser texto de hasta 1000 caracteres." });
  }

  // Uno o lote: pendientes (el delegado los lleva a firmar) o entregados
  // (préstamo del original ya firmado). Nunca uno que ya está prestado.
  const estados = [TALON_STATUS.PENDIENTE, TALON_STATUS.ENTREGADO];

  try {
    const revision = await revisarTalones(ids, estados);
    if (revision.error) {
      return res.status(revision.error.status).send(revision.error.body);
    }
    const { doc, talones, fallidos } = revision;

    if (!doc) {
      return res.status(404).send({
        codigo: "TALON_NO_ENCONTRADO",
        error: "No se encontró el talón de pago solicitado."
      });
    }
    if (fallidos.length > 0) {
      return res.status(409).send(
        esLote
          ? {
            codigo: "TALONES_NO_DISPONIBLES",
            error: "Hay talones que ya están prestados. No se prestó ninguno.",
            fallidos,
          }
          : {
            codigo: fallidos[0].motivo === "NO_ENCONTRADO" ? "TALON_NO_ENCONTRADO" : "TALON_YA_PRESTADO",
            error: "El talón de pago ya está prestado.",
            fallidos,
          }
      );
    }

    const PRESTAMO_ID = new ObjectId();
    const result = await (await connect()).collection("TALONES").updateOne(
      filtroTodosEnEstado(doc._id, ids, estados),
      {
        $set: {
          "TALONES.$[t].STATUS": TALON_STATUS.PRESTADO,
          "TALONES.$[t].PRESTAMO_ID": PRESTAMO_ID,
          "TALONES.$[t].TIPO_RECEPTOR": TIPO_RECEPTOR.trim(),
          "TALONES.$[t].NOMBRE_RECEPTOR": (NOMBRE_RECEPTOR || "").trim(),
          "TALONES.$[t].FECHA_PRESTAMO": fechaPrestamo.toDate(),
          "TALONES.$[t].FOLIO_RH": FOLIO_RH.trim(),
          "TALONES.$[t].OBSERVACIONES": (OBSERVACIONES || "").trim(),
          "TALONES.$[t].PRESTADO_POR": user.username,
        },
      },
      { arrayFilters: [{ "t._id": { $in: ids } }] }
    );

    if (result.matchedCount === 0) {
      return res.status(409).send({
        codigo: "TALONES_CAMBIARON",
        error: "Otro usuario modificó estos talones. Vuelve a cargar el perfil."
      });
    }

    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: `HIZO EL PRÉSTAMO DE ${talones.length} TALÓN(ES) DE PAGO (QUINCENAS ${describirQuincenas(talones)}) A ${TIPO_RECEPTOR.trim()}`,
      timestamp: currentDateTime,
    });

    res.send({
      message: talones.length > 1 ? "Talones de pago prestados correctamente" : "Talón de pago prestado correctamente",
      _id: doc._idEmployee,
      PRESTAMO_ID,
      talones: ids,
    });
  } catch (error) {
    console.error("Error al prestar el talón de pago:", error.message);
    res.status(500).send({ codigo: "ERROR_INTERNO", error: "Ha ocurrido un error al realizar el prestamo del talón de pago" });
  }
};

// Regresar talones prestados (PRESTADO → ENTREGADO). El delegado devuelve el
// original firmado; la copia se queda con el empleado.
// Qué regresar: `PRESTAMO_ID` (todo lo que siga prestado de ese préstamo),
// `_ids` (lote, mismo empleado) o `_id` (uno). Todo o nada.
// Imágenes: `imagenes: [{ _id, image }]`, o `image` cuando es un solo talón.
// - Un talón prestado sin haberse entregado (sin IMAGE) necesita la imagen del
//   original firmado; se valida igual que en entregar-talon y queda como IMAGE.
// - Si ya tenía IMAGE, la imagen es opcional y se guarda como IMAGE_REGRESO.
// Los datos del préstamo y del regreso se agregan a HISTORIAL_PRESTAMOS.
talonesController.regresarTalon = async (req, res) => {
  const body = req.body || {};
  const { PRESTAMO_ID, FECHA_REGRESO, NOMBRE_ENTREGA, OBSERVACIONES, image, imagenes } = body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  const fechaRegreso = typeof FECHA_REGRESO === "string" ? moment(FECHA_REGRESO, moment.ISO_8601, true) : null;
  if (!fechaRegreso || !fechaRegreso.isValid()) {
    return res.status(400).send({
      codigo: "DATOS_INVALIDOS",
      error: "FECHA_REGRESO es obligatoria y debe ser una fecha válida (ISO 8601)."
    });
  }
  if (!textoOpcional(NOMBRE_ENTREGA, 100)) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "NOMBRE_ENTREGA debe ser texto de hasta 100 caracteres." });
  }
  if (!textoOpcional(OBSERVACIONES, 1000)) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "OBSERVACIONES debe ser texto de hasta 1000 caracteres." });
  }
  if (imagenes !== undefined && (!Array.isArray(imagenes) || imagenes.length > MAX_TALONES_LOTE ||
    !imagenes.every((i) => i && typeof i._id === "string" && ObjectId.isValid(i._id) && typeof i.image === "string"))) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: "imagenes debe ser una lista de { _id, image }." });
  }

  try {
    // 1) Qué talones se regresan.
    let ids;
    if (PRESTAMO_ID !== undefined) {
      if (typeof PRESTAMO_ID !== "string" || !ObjectId.isValid(PRESTAMO_ID)) {
        return res.status(400).send({ codigo: "TALON_ID_INVALIDO", error: "PRESTAMO_ID no es válido." });
      }
      const prestamoId = new ObjectId(PRESTAMO_ID);
      const [doc] = await aggregate("TALONES", [
        { $match: { "TALONES.PRESTAMO_ID": prestamoId } },
        { $limit: 1 },
        {
          $project: {
            ids: {
              $map: {
                input: {
                  $filter: {
                    input: "$TALONES",
                    as: "t",
                    cond: {
                      $and: [
                        { $eq: ["$$t.PRESTAMO_ID", prestamoId] },
                        { $eq: ["$$t.STATUS", TALON_STATUS.PRESTADO] },
                      ],
                    },
                  },
                },
                as: "t",
                in: "$$t._id",
              },
            },
          },
        },
      ]);
      if (!doc) {
        return res.status(404).send({ codigo: "PRESTAMO_NO_ENCONTRADO", error: "No se encontró el préstamo." });
      }
      if (doc.ids.length === 0) {
        return res.status(409).send({ codigo: "TALON_NO_PRESTADO", error: "Los talones de este préstamo ya fueron regresados." });
      }
      ids = doc.ids;
    } else {
      const leidos = leerIdsTalones(body);
      if (leidos.error) {
        return res.status(400).send({ codigo: "TALON_ID_INVALIDO", error: leidos.error });
      }
      ids = leidos.ids;
    }

    const imagenPorId = new Map((imagenes || []).map((i) => [String(i._id), i.image]));
    if (image && ids.length === 1 && !imagenPorId.has(String(ids[0]))) {
      imagenPorId.set(String(ids[0]), image);
    }

    // 2) Que todos sigan prestados y sean del mismo empleado.
    const revision = await revisarTalones(ids, [TALON_STATUS.PRESTADO]);
    if (revision.error) {
      return res.status(revision.error.status).send(revision.error.body);
    }
    const { doc, talones, fallidos } = revision;
    if (!doc) {
      return res.status(404).send({ codigo: "TALON_NO_ENCONTRADO", error: "No se encontró el talón de pago solicitado." });
    }
    if (fallidos.length > 0) {
      return res.status(409).send({
        codigo: "TALON_NO_PRESTADO",
        error: "Hay talones que no están prestados. No se regresó ninguno.",
        fallidos,
      });
    }

    // 3) Imágenes obligatorias para los que nunca se entregaron.
    const faltantes = talones.filter((t) => !t.TIENE_IMAGEN && !imagenPorId.has(String(t._id)));
    if (faltantes.length > 0) {
      return res.status(400).send({
        codigo: "IMAGEN_REQUERIDA",
        error: "Hay talones que se prestaron sin entregarse: escanea el original firmado de cada uno.",
        faltantes: faltantes.map((t) => ({ _id: t._id, QUIN: t.QUIN, YEAR: t.YEAR })),
      });
    }

    const guardadas = new Map();
    for (const talon of talones) {
      const img = imagenPorId.get(String(talon._id));
      if (!img) continue;
      const procesada = await procesarImagenTalon(img);
      if (!procesada.storedImage) {
        return res.status(procesada.status).send({ ...procesada.body, _id: talon._id, QUIN: talon.QUIN, YEAR: talon.YEAR });
      }
      guardadas.set(String(talon._id), procesada.storedImage);
    }

    // 4) Una sola actualización para todos (todo o nada).
    const ahora = new Date();
    const datosRegreso = {
      FECHA_REGRESO: fechaRegreso.toDate(),
      NOMBRE_ENTREGA: (NOMBRE_ENTREGA || "").trim(),
      OBSERVACIONES_REGRESO: (OBSERVACIONES || "").trim(),
      REGRESADO_POR: user.username,
    };
    const $set = {};
    const $push = {};
    const arrayFilters = [];
    talones.forEach((talon, i) => {
      const ruta = `TALONES.$[t${i}]`;
      arrayFilters.push({ [`t${i}._id`]: talon._id });
      $set[`${ruta}.STATUS`] = TALON_STATUS.ENTREGADO;
      for (const [campo, valor] of Object.entries(datosRegreso)) {
        $set[`${ruta}.${campo}`] = valor;
      }
      const img = guardadas.get(String(talon._id));
      if (img && !talon.TIENE_IMAGEN) {
        $set[`${ruta}.IMAGE`] = img;
        $set[`${ruta}.FECHA_ENTREGA`] = ahora;
        $set[`${ruta}.ENTREGADO_POR`] = user.username;
      } else if (img) {
        $set[`${ruta}.IMAGE_REGRESO`] = img;
      }
      $push[`${ruta}.HISTORIAL_PRESTAMOS`] = {
        PRESTAMO_ID: talon.PRESTAMO_ID ?? null,
        TIPO_RECEPTOR: talon.TIPO_RECEPTOR ?? null,
        NOMBRE_RECEPTOR: talon.NOMBRE_RECEPTOR ?? null,
        FECHA_PRESTAMO: talon.FECHA_PRESTAMO ?? null,
        FOLIO_RH: talon.FOLIO_RH ?? null,
        OBSERVACIONES: talon.OBSERVACIONES ?? null,
        PRESTADO_POR: talon.PRESTADO_POR ?? null,
        ...datosRegreso,
        REGISTRADO: ahora,
      };
    });

    const result = await (await connect()).collection("TALONES").updateOne(
      filtroTodosEnEstado(doc._id, ids, [TALON_STATUS.PRESTADO]),
      { $set, $push },
      { arrayFilters }
    );

    if (result.matchedCount === 0) {
      return res.status(409).send({
        codigo: "TALONES_CAMBIARON",
        error: "Otro usuario modificó estos talones. Vuelve a cargar el perfil."
      });
    }

    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: `REGISTRÓ EL REGRESO DE ${talones.length} TALÓN(ES) DE PAGO (QUINCENAS ${describirQuincenas(talones)})`,
      timestamp: currentDateTime,
    });

    res.status(200).send({
      message: talones.length > 1 ? "Talones de pago regresados correctamente" : "Talón de pago regresado correctamente",
      _id: doc._idEmployee,
      talones: ids,
    });
  } catch (error) {
    console.error("Error al regresar el talón de pago:", error.message);
    res.status(500).send({
      codigo: "ERROR_INTERNO",
      error: "Ocurrió un error al registrar el regreso del talón de pago."
    });
  }
};


// Obtener los años y las quincenas disponibles en los talones
talonesController.getYearsAndPeriods = async (req, res) => {
  try {
    const documentos = await find("TALONES", {}, { "TALONES.YEAR": 1, "TALONES.QUIN": 1 });
    const quincenasPorAnio = {};

    for (const documento of documentos || []) {
      for (const talon of documento.TALONES || []) {
        const anio = Number(talon.YEAR);
        const quincena = Number(talon.QUIN);

        if (!Number.isInteger(anio) || !Number.isInteger(quincena)) {
          continue;
        }

        quincenasPorAnio[anio] ??= new Set();
        quincenasPorAnio[anio].add(quincena);
      }
    }

    const periodsByYear = Object.fromEntries(
      Object.entries(quincenasPorAnio).map(([anio, quincenas]) => [
        anio,
        [...quincenas].sort((a, b) => a - b),
      ]),
    );

    return res.status(200).json({ periodsByYear });
  } catch (error) {
    console.error("Error obteniendo años y quincenas de talones:", error.message);
    return res.status(500).json({
      error: "Ocurrió un error al obtener los años y quincenas.",
    });
  }
};

// Obtener los agremiados activos de una delegación
talonesController.getEmployeesByDelegation = async (req, res) => {
  const { delegacion } = req.params;

  if (!delegacion) {
    return res.status(400).json({
      error: "Se requiere la delegación.",
    });
  }

  try {
    const empleados = await find(
      "PLANTILLA",
      {
        status: 1,
        TIPONOM: { $in: ["F51", "M51"] },
        "SINDICATO.AFILIADO": true,
        "SINDICATO.DELEGACION": delegacion,
      },
      { ...EMPLEADO_PERFIL_PROJECTION, RFC: 1, SINDICATO: 1 },
    );

    if (empleados.length === 0) {
      return res.status(200).json([]);
    }

    // Sin imágenes: solo los datos de cada talón.
    const documentosTalones = await find(
      "TALONES",
      { _idEmployee: { $in: empleados.map((empleado) => empleado._id) } },
      { "TALONES.IMAGE": 0, "TALONES.IMAGE_REGRESO": 0 },
    );

    // Solo los talones de quien ocupa hoy cada plaza.
    const resultado = empleados.map(({ RFC, ...empleado }) => {
      const propios = documentosTalones.filter((documento) =>
        talonesSonDe(documento, { ...empleado, RFC }),
      );
      return {
        ...empleado,
        NOMBRE: nombreEmpleado(empleado),
        TALONES: propios.flatMap((documento) => documento.TALONES || []),
      };
    });

    return res.status(200).json(resultado);
  } catch (error) {
    console.error("Error obteniendo empleados y talones por delegación:", error.message);
    return res.status(500).json({
      error: "Ocurrió un error al obtener los empleados y sus talones.",
    });
  }
};

module.exports = talonesController;
