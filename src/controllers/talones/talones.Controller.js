const { connect, insertOne } = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const { querysql } = require("../../config/mysql");
const momentTz = require("moment-timezone");
const { filtroTalonesDe, talonesSonDe, getQuincenaInfo, TIMEZONE } = require("../../libs/talonesQuincena");
const { analizarHojaTalon, recortarContenido, compararNombre, palabrasLeidas } = require("../../libs/talonOcr");
const { guardarImagenTalon, borrarImagenesTalon, hidratarImagenes } = require("../../libs/talonesImagenes");

// Estados de un talón (TALONES[].STATUS), igual que en el front (perfil-talon):
//   1 = PENDIENTE de entregar (así lo crea libs/talonesQuincena)
//   2 = ENTREGADO / disponible para préstamo (firmado, con IMAGE_ID o IMAGE viejo)
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
// Imagen guardada: se reduce, se comprime y va a GridFS (libs/talonesImagenes);
// el talón solo guarda IMAGE_ID.
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
        NUMEMP: 1,
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
    {
      $addFields: {
        tieneImagen: {
          $or: [
            { $ne: [{ $type: "$talon.IMAGE" }, "missing"] },
            { $ne: [{ $type: "$talon.IMAGE_ID" }, "missing"] },
          ],
        },
      },
    },
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
// RECIBIDO", y tinta en el espacio de firma). Devuelve { storedBuffer } con la
// imagen reducida y comprimida (JPEG), o { status, body } con el error a responder.
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
  return { storedBuffer };
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
    // El front recibe IMAGE como antes; ahora se lee de GridFS.
    await hidratarImagenes(talonesDoc);
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

// ---------------------------------------------------------------------------
// Entrega con hojas escaneadas (escáner de hoja, p. ej. Brother DS-640).
// Un talón trae de 1 a 4 hojas: las intermedias con NETO .00 y la última con
// el NETO real y la firma. Ver libs/talonOcr.js.
// ---------------------------------------------------------------------------
const MAX_HOJAS_TALON = 4;
const EXIGIR_TINTA_AZUL = process.env.TALONES_EXIGIR_TINTA_AZUL === "1";
const fechaMx = (valor) => momentTz.tz(valor, TIMEZONE).format("YYYY-MM-DD");
const fallo = (status, body) => ({ error: { status, body } });

// `images` (lista de hojas) o `image` (una sola) del body.
const hojasDelBody = ({ images, image } = {}) => {
  const hojas = Array.isArray(images) ? images : image ? [image] : [];
  if (hojas.length === 0 || hojas.length > MAX_HOJAS_TALON) {
    return { error: `Envía de 1 a ${MAX_HOJAS_TALON} hojas del talón.` };
  }
  if (hojas.some((h) => typeof h !== "string" || h.length > MAX_IMAGE_BASE64_LENGTH)) {
    return { error: "Alguna hoja no es una imagen válida o supera los 10 MB." };
  }
  return { hojas };
};

// Une las hojas (ya recortadas al contenido) en una sola imagen JPEG.
const unirHojas = async (recortes) => {
  const partes = await Promise.all(
    recortes.map((r) => sharp(r).resize({ width: STORED_IMAGE_MAX_WIDTH }).jpeg().toBuffer({ resolveWithObject: true })),
  );
  const alto = partes.reduce((s, p) => s + p.info.height, 0);
  let y = 0;
  const capas = partes.map((p) => {
    const capa = { input: p.data, left: 0, top: y };
    y += p.info.height;
    return capa;
  });
  const unida = await sharp({ create: { width: STORED_IMAGE_MAX_WIDTH, height: alto, channels: 3, background: "#ffffff" } })
    .composite(capas)
    .png()
    .toBuffer();
  // A color pero más legible: la impresión de matriz de puntos sale muy clara.
  // Se oscurecen los tonos medios (el blanco se queda blanco) y se enfoca.
  return sharp(unida)
    .linear(1.45, -0.45 * 255)
    .sharpen({ sigma: 1 })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
};

// Lee y valida las hojas. Regresa { legado: true } si es una sola imagen con
// otro formato (escáner de cama): se valida como antes con procesarImagenTalon.
const validarHojasTalon = async (hojas) => {
  const analisis = [];
  for (const hoja of hojas) {
    try {
      analisis.push(await analizarHojaTalon(hoja));
    } catch {
      return fallo(400, { codigo: "IMAGEN_INVALIDA", error: "Alguna hoja no es una imagen válida." });
    }
  }
  if (analisis.some((a) => !a.reconocido)) {
    if (hojas.length === 1) return { legado: true };
    const hoja = analisis.findIndex((a) => !a.reconocido) + 1;
    return fallo(422, { codigo: "HOJA_NO_RECONOCIDA", hoja, error: `No se reconoció el formato del talón en la hoja ${hoja}. Vuelve a escanearla.` });
  }

  const enHoja = (i) => (hojas.length > 1 ? ` (hoja ${i + 1})` : "");
  const iEmpleado = analisis.findIndex((a) => a.copia === "EMPLEADO");
  if (iEmpleado >= 0) {
    return fallo(422, { codigo: "TALON_CONTIENE_EMPLEADO", hoja: iEmpleado + 1, error: `Es la copia del EMPLEADO${enHoja(iEmpleado)}. Escanea la copia del PAGADOR.` });
  }
  if (!analisis.some((a) => a.copia === "PAGADOR")) {
    return fallo(422, { codigo: "TALON_SIN_PAGADOR", error: 'No se identificó la leyenda "PAGADOR" en el talón.' });
  }

  // La fecha de pago debe ser la misma en todas las hojas. El número de
  // empleado se vota entre todas las lecturas de todas las hojas.
  const distintas = (campo) => new Set(analisis.map((a) => a[campo]).filter(Boolean)).size > 1;
  if (distintas("fechaPago") || distintas("hasta")) {
    return fallo(422, { codigo: "HOJAS_DE_DISTINTOS_TALONES", error: "Las hojas no son del mismo talón (cambia el empleado o la fecha de pago)." });
  }

  const ultima = analisis[analisis.length - 1];
  const iConNeto = analisis.findIndex((a) => a.esUltimaHoja);
  if (iConNeto >= 0 && iConNeto < analisis.length - 1) {
    return fallo(422, { codigo: "HOJAS_DE_MAS", hoja: iConNeto + 1, error: `La hoja ${iConNeto + 1} ya trae el NETO; sobran las hojas siguientes.` });
  }
  if (!ultima.esUltimaHoja) {
    if (hojas.length >= MAX_HOJAS_TALON) {
      return fallo(422, { codigo: "NETO_NO_LEIDO", error: "No se pudo leer el NETO en la última hoja. Vuelve a escanearla." });
    }
    return fallo(422, {
      codigo: "FALTAN_HOJAS",
      hojasLeidas: hojas.length,
      error: `El talón continúa (NETO en .00). Escanea la hoja ${hojas.length + 1}.`,
    });
  }
  if (!ultima.firma.detectada) {
    return fallo(422, { codigo: "TALON_SIN_FIRMA", error: "No se detectó la firma del empleado en la última hoja." });
  }
  if (EXIGIR_TINTA_AZUL && ultima.firma.porcentajeAzul < 30) {
    return fallo(422, { codigo: "TALON_TINTA_NO_AZUL", error: "La firma no es de tinta azul: escanea el original firmado." });
  }

  const dato = (campo) => analisis.map((a) => a[campo]).find(Boolean) || null;
  const totalVotos = {};
  for (const a of analisis) {
    for (const [n, v] of Object.entries(a.numempVotos || {})) totalVotos[n] = (totalVotos[n] || 0) + v;
  }
  const candidatos = Object.entries(totalVotos).sort((x, y) => y[1] - x[1]).map(([n]) => n);
  const datos = {
    numemp: candidatos[0] || null,
    numempCandidatos: candidatos,
    numempVotos: totalVotos,
    texto: analisis.map((a) => a.texto).join(" "),
    fechaPago: dato("fechaPago"),
    desde: dato("desde"),
    hasta: dato("hasta"),
    neto: ultima.neto,
  };
  if (!datos.numemp && !/[A-Z]{4,}/.test(datos.texto || "")) {
    return fallo(422, { codigo: "DATOS_NO_LEIDOS", error: "No se pudo leer el número ni el nombre del empleado. Vuelve a escanear." });
  }
  const recortes = [];
  for (const hoja of hojas) {
    recortes.push((await recortarContenido(Buffer.from(hoja.replace(/^data:[^,]*,/, ""), "base64"))).recorte);
  }
  return { datos, hojas: analisis.length, storedBuffer: await unirHojas(recortes) };
};

// La quincena del talón sale del periodo impreso (HASTA, o DESDE); la fecha de
// pago solo se usa si no se leyó el periodo. Ojo: la fecha de pago no siempre
// es igual al HASTA (p. ej. diciembre: pago 13-12, periodo 01-12 a 11-12).
// Regresa null si no se leyó ninguna fecha.
const quincenaDeHojas = (datos) => {
  const base = datos.hasta || datos.desde || datos.fechaPago;
  if (!base) return null;
  const info = getQuincenaInfo(momentTz.tz(base, TIMEZONE).toDate());
  const fin = info.quincenaDelMes === 1 && !(info.mes === 5 || info.mes === 12)
    ? info.fechaMx.clone().date(15)
    : info.fechaMx.clone().endOf("month");
  return { QUIN: info.quincenaDelAnio, YEAR: info.anio, inicio: fechaMx(info.inicioPeriodo), fin: fechaMx(fin.toDate()) };
};

// Distancia de edición entre dos números leídos (9 por 7, un dígito de más o de menos).
const distanciaDigitos = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
};

// Números a un dígito de distancia (para buscar al empleado aunque el OCR falle un dígito).
const vecinosNumero = (n) => {
  const salida = new Set([n]);
  for (let i = 0; i <= n.length; i++) {
    for (const c of "0123456789") {
      salida.add(n.slice(0, i) + c + n.slice(i));
      if (i < n.length) salida.add(n.slice(0, i) + c + n.slice(i + 1));
    }
    if (i < n.length) salida.add(n.slice(0, i) + n.slice(i + 1));
  }
  return [...salida].filter((x) => x.length >= 4);
};

// ¿Las hojas son de este empleado? Se exige el nombre impreso y, si el número
// leído no coincide (el OCR confunde 9 y 7), el nombre completo.
// - Número leído igual al del empleado: basta con la mitad del nombre.
// - Número a un dígito de distancia: tres cuartas partes del nombre.
// - Número leído con seguridad (2+ lecturas iguales) y es de otro: no es suyo
//   (protege contra hermanos con los mismos apellidos).
// - Sin número o lectura dudosa: dos palabras y la mitad del nombre.
const esDelEmpleado = (datos, emp) => {
  if (!emp) return true;
  const { encontradas, total } = compararNombre(datos.texto, emp);
  const nombre = total ? encontradas / total : 0;
  const suyo = emp.NUMEMP != null ? String(emp.NUMEMP).trim() : "";
  const cands = datos.numempCandidatos || [];
  if (suyo && cands.includes(suyo)) return nombre >= 0.5;
  if (suyo && cands.some((c) => distanciaDigitos(c, suyo) <= 1)) return nombre >= 0.75;
  const votosNum = datos.numempVotos || {};
  if (cands.some((c) => (votosNum[c] || 0) >= 2)) return false;
  return encontradas >= 2 && nombre >= 0.5;
};

// Compara lo leído con el talón y su dueño.
const verificarHojasContraTalon = (datos, talon, dueno) => {
  if (!esDelEmpleado(datos, dueno)) {
    return fallo(422, { codigo: "TALON_DE_OTRO_EMPLEADO", error: `El talón escaneado es de otro empleado (No. ${datos.numemp || "?"}).` });
  }
  const q = quincenaDeHojas(datos);
  if (!q) {
    // No se alcanzó a leer ninguna fecha (impresión muy tenue): se entrega con aviso.
    return { aviso: "QUINCENA_NO_VERIFICADA" };
  }
  if (Number(talon.YEAR) !== q.YEAR || Number(talon.QUIN) !== q.QUIN) {
    return fallo(422, {
      codigo: "QUINCENA_NO_COINCIDE",
      error: `El talón escaneado es de la quincena ${q.QUIN}/${q.YEAR} (periodo ${datos.desde || "?"} a ${datos.hasta || "?"}), no de la ${talon.QUIN}/${talon.YEAR}.`,
      leida: { QUIN: q.QUIN, YEAR: q.YEAR, fechaPago: datos.fechaPago, desde: datos.desde, hasta: datos.hasta },
    });
  }
  // El periodo impreso debe quedar dentro de la quincena.
  const fuera = (f) => f && (f < q.inicio || f > q.fin);
  if (fuera(datos.desde) || fuera(datos.hasta) || (datos.desde && datos.hasta && datos.desde > datos.hasta)) {
    return fallo(422, {
      codigo: "PERIODO_NO_COINCIDE",
      error: `El periodo del talón (${datos.desde || "?"} a ${datos.hasta || "?"}) no corresponde a la quincena ${q.QUIN}/${q.YEAR}.`,
      leida: { desde: datos.desde, hasta: datos.hasta },
      esperada: { desde: q.inicio, hasta: q.fin },
    });
  }
  return {};
};

// Empleado activo de las hojas: por los números leídos y confirmando el nombre.
// Con activos: false busca entre los que ya no están activos (baja), para
// avisar por qué no se entrega.
// Si no se leyó el número o no coincide con nadie, se busca por el nombre
// impreso: por apellidos leídos, con al menos dos palabras del nombre y la
// mitad del nombre completo, y solo si queda una sola persona.
const empleadoDeHojas = async (datos, { activos = true } = {}) => {
  const status = activos ? 1 : { $ne: 1 };
  const cands = (datos.numempCandidatos || []).slice(0, 6);
  if (cands.length > 0) {
    const numeros = [...new Set(cands.flatMap(vecinosNumero))].flatMap((n) => [n, Number(n)]);
    const emps = (await buscarEmpleado({ NUMEMP: { $in: numeros }, status })).filter((e) => esDelEmpleado(datos, e));
    if (emps.length > 0) return emps;
  }
  const palabras = palabrasLeidas(datos.texto || "");
  if (palabras.length === 0) return [];
  const porApellido = await buscarEmpleado({ $or: [{ APE_PAT: { $in: palabras } }, { APE_MAT: { $in: palabras } }], status });
  const porNombre = porApellido.filter((e) => {
    const { encontradas, total } = compararNombre(datos.texto, e);
    return encontradas >= 2 && encontradas / total >= 0.5;
  });
  if (porNombre.length !== 1) return porNombre.length > 1 ? [] : porNombre;
  porNombre[0].identificadoPorNombre = true;
  return porNombre;
};

const buscarEmpleado = async (filtro) => {
  const [p = [], f = []] = await Promise.all([
    find("PLANTILLA", filtro, { NOMBRES: 1, APE_PAT: 1, APE_MAT: 1, NUMEMP: 1, RFC: 1, status: 1 }),
    find("PLANTILLA_FORANEA", filtro, { NOMBRES: 1, APE_PAT: 1, APE_MAT: 1, NUMEMP: 1, RFC: 1, status: 1 }),
  ]);
  return [...p, ...f];
};

// Guarda la imagen y pasa el talón de PENDIENTE a ENTREGADO (solo si sigue pendiente).
const registrarEntrega = async ({ docId, empleadoId, talon, storedBuffer, user, hojas }) => {
  const imageId = await guardarImagenTalon(storedBuffer, {
    talonId: talon._id,
    empleadoId,
    tipo: "ENTREGA",
    hojas,
    subidoPor: user.username,
    fecha: new Date(),
  });
  const result = await (await connect()).collection("TALONES").updateOne(
    { _id: docId, TALONES: { $elemMatch: { _id: talon._id, STATUS: TALON_STATUS.PENDIENTE } } },
    {
      $set: {
        "TALONES.$.IMAGE_ID": imageId,
        "TALONES.$.STATUS": TALON_STATUS.ENTREGADO,
        "TALONES.$.FECHA_ENTREGA": new Date(),
        "TALONES.$.ENTREGADO_POR": user.username,
        ...(hojas ? { "TALONES.$.HOJAS": hojas } : {}),
      },
    },
  );
  if (result.matchedCount === 0) {
    await borrarImagenesTalon([imageId]);
    return false;
  }
  await insertOne("USER_ACTIONS", {
    username: user.username,
    module: "TP",
    action: `HIZO LA ENTREGA DEL TALÓN DE PAGO DE LA QUINCENA ${talon.QUIN} DEL AÑO ${talon.YEAR} AL EMPLEADO`,
    timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
  });
  return true;
};

const errorInterno = (res, error, texto) => {
  console.error(texto, error.message);
  const response = { codigo: "ERROR_INTERNO", error: "Ocurrió un error al procesar el talón de pago." };
  if (process.env.NODE_ENV !== "production") response.details = error.message;
  return res.status(500).send(response);
};

const NO_PENDIENTE = { codigo: "TALON_NO_PENDIENTE", error: "El talón de pago ya fue entregado o está prestado." };

// Realizar la entrega del talón de pago (PENDIENTE → ENTREGADO).
// Body: { _idTalon, image } o { _idTalon, images: [hoja1, ..., hoja4] }.
talonesController.uploadTalonImage = async (req, res) => {
  const { _idTalon } = req.body || {};
  const user = req.user;
  const entrada = hojasDelBody(req.body);

  if (!_idTalon || entrada.error) {
    return res.status(400).send({ codigo: "DATOS_INCOMPLETOS", error: entrada.error || "Faltan datos para procesar el talón de pago." });
  }
  if (typeof _idTalon !== "string" || !ObjectId.isValid(_idTalon)) {
    return res.status(400).send({ codigo: "TALON_ID_INVALIDO", error: "El identificador del talón de pago no es válido." });
  }

  try {
    const talonObjectId = new ObjectId(_idTalon);
    const encontrado = await buscarTalon(talonObjectId);
    if (!encontrado) {
      return res.status(404).send({ codigo: "TALON_NO_ENCONTRADO", error: "No se encontró el talón de pago solicitado." });
    }
    const { talon } = encontrado;
    if (talon.STATUS !== TALON_STATUS.PENDIENTE) return res.status(409).send(NO_PENDIENTE);

    const v = await validarHojasTalon(entrada.hojas);
    if (v.error) return res.status(v.error.status).send(v.error.body);

    let storedBuffer = v.storedBuffer;
    let aviso;
    if (v.legado) {
      const procesada = await procesarImagenTalon(entrada.hojas[0]);
      if (!procesada.storedBuffer) return res.status(procesada.status).send(procesada.body);
      storedBuffer = procesada.storedBuffer;
    } else {
      const [dueno] = await buscarEmpleado({ _id: encontrado._idEmployee });
      const chequeo = verificarHojasContraTalon(v.datos, talon, dueno);
      if (chequeo.error) return res.status(chequeo.error.status).send(chequeo.error.body);
      aviso = chequeo.aviso;
    }

    const ok = await registrarEntrega({
      docId: encontrado._id,
      empleadoId: encontrado._idEmployee,
      talon: { ...talon, _id: talonObjectId },
      storedBuffer,
      user,
      hojas: v.legado ? null : v.hojas,
    });
    if (!ok) return res.status(409).send(NO_PENDIENTE);

    res.status(200).send({
      message: aviso
        ? "Talón entregado. No se pudo leer la quincena impresa para verificarla."
        : "Imagen guardada correctamente en el talón.",
      _id: encontrado._idEmployee,
      ...(aviso ? { aviso } : {}),
    });
  } catch (error) {
    return errorInterno(res, error, "Error al subir imagen al talón:");
  }
};

// Lee una hoja escaneada sin guardar nada. El front la usa después de cada
// hoja para saber si el talón continúa (FALTAN hojas) y de quién es.
// Body: { image }.
talonesController.analizarHoja = async (req, res) => {
  const entrada = hojasDelBody({ image: req.body?.image });
  if (entrada.error) return res.status(400).send({ codigo: "DATOS_INCOMPLETOS", error: entrada.error });
  try {
    const a = await analizarHojaTalon(entrada.hojas[0]);
    if (!a.reconocido) return res.status(200).send({ reconocido: false, motivo: a.motivo });
    const respuesta = {
      reconocido: true,
      copia: a.copia,
      numemp: a.numemp,
      fechaPago: a.fechaPago,
      desde: a.desde,
      hasta: a.hasta,
      neto: a.neto,
      esUltimaHoja: a.esUltimaHoja,
      firmaDetectada: a.firma.detectada,
      tintaAzul: a.firma.porcentajeAzul >= 30,
    };
    const q = quincenaDeHojas(a);
    if (q) respuesta.quincena = { QUIN: q.QUIN, YEAR: q.YEAR };
    if (a.numemp) {
      const candidatos = Object.entries(a.numempVotos || {}).sort((x, y) => y[1] - x[1]).map(([n]) => n);
      const emps = await empleadoDeHojas({ numempCandidatos: candidatos, texto: a.texto });
      if (emps.length === 1) respuesta.empleado = { _id: emps[0]._id, NOMBRE: nombreEmpleado(emps[0]), NUMEMP: emps[0].NUMEMP };
    }
    return res.status(200).send(respuesta);
  } catch (error) {
    return errorInterno(res, error, "Error al analizar hoja del talón:");
  }
};

// Entrega automática: con solo escanear las hojas se identifica al empleado
// (No. único) y la quincena (fecha de pago), y el talón pasa a ENTREGADO.
// Body: { images: [hoja1, ..., hoja4] } (o { image }).
talonesController.entregarEscaneo = async (req, res) => {
  const user = req.user;
  const entrada = hojasDelBody(req.body);
  if (entrada.error) return res.status(400).send({ codigo: "DATOS_INCOMPLETOS", error: entrada.error });

  try {
    const v = await validarHojasTalon(entrada.hojas);
    if (v.error) return res.status(v.error.status).send(v.error.body);
    if (v.legado) {
      return res.status(422).send({ codigo: "HOJA_NO_RECONOCIDA", error: "No se reconoció el formato del talón. Entrégalo desde el perfil del empleado." });
    }

    const emps = await empleadoDeHojas(v.datos);
    if (emps.length === 0) {
      const deBaja = await empleadoDeHojas(v.datos, { activos: false });
      if (deBaja.length > 0) {
        const e = deBaja[0];
        return res.status(409).send({
          codigo: "EMPLEADO_DE_BAJA",
          empleado: { _id: e._id, NOMBRE: nombreEmpleado(e), NUMEMP: e.NUMEMP },
          error: `${nombreEmpleado(e)} (No. ${e.NUMEMP}) está dado de baja; el talón no se entregó.`,
        });
      }
      return res.status(404).send({ codigo: "EMPLEADO_NO_ENCONTRADO", numemp: v.datos.numemp, error: v.datos.numemp
        ? `No se encontró un empleado activo con el número ${v.datos.numemp} y el nombre del talón. Entrégalo desde su perfil.`
        : "No se pudo leer el número de empleado y el nombre impreso no coincide con una sola persona. Entrégalo desde su perfil." });
    }
    if (emps.length > 1) {
      return res.status(409).send({ codigo: "EMPLEADO_DUPLICADO", numemp: v.datos.numemp, error: `Hay más de un empleado activo con el número ${v.datos.numemp}. Entrégalo desde su perfil.` });
    }
    const emp = emps[0];
    const empleado = { _id: emp._id, NOMBRE: nombreEmpleado(emp), NUMEMP: emp.NUMEMP };
    const q = quincenaDeHojas(v.datos);
    const docs = await find("TALONES", filtroTalonesDe(emp), { "TALONES.IMAGE": 0, "TALONES.IMAGE_REGRESO": 0 });
    if (!q) {
      // Impresión demasiado tenue para leer la quincena: el usuario elige el
      // talón y el front lo entrega con entregar-talon (mismas hojas).
      const pendientes = docs.flatMap((d) => (d.TALONES || [])
        .filter((x) => x.STATUS === TALON_STATUS.PENDIENTE)
        .map((x) => ({ _id: x._id, QUIN: x.QUIN, YEAR: x.YEAR })));
      return res.status(422).send({
        codigo: "QUINCENA_NO_LEIDA",
        empleado,
        pendientes,
        error: `No se pudo leer la quincena del talón de ${empleado.NOMBRE}. Elige cuál talón es.`,
      });
    }
    let doc = null;
    let talon = null;
    for (const d of docs) {
      const t = (d.TALONES || []).find((x) => Number(x.YEAR) === q.YEAR && Number(x.QUIN) === q.QUIN);
      if (t) { doc = d; talon = t; break; }
    }
    if (!talon) {
      return res.status(404).send({ codigo: "TALON_NO_ENCONTRADO", empleado, quincena: { QUIN: q.QUIN, YEAR: q.YEAR }, error: `${empleado.NOMBRE} no tiene registrado el talón de la quincena ${q.QUIN}/${q.YEAR}.` });
    }
    const datosTalon = { _id: talon._id, QUIN: talon.QUIN, YEAR: talon.YEAR, STATUS: talon.STATUS };
    if (talon.STATUS !== TALON_STATUS.PENDIENTE) {
      return res.status(409).send({ ...NO_PENDIENTE, empleado, talon: datosTalon });
    }
    const chequeo = verificarHojasContraTalon(v.datos, talon, emp);
    if (chequeo.error) return res.status(chequeo.error.status).send({ ...chequeo.error.body, empleado });

    const ok = await registrarEntrega({ docId: doc._id, empleadoId: emp._id, talon, storedBuffer: v.storedBuffer, user, hojas: v.hojas });
    if (!ok) return res.status(409).send({ ...NO_PENDIENTE, empleado, talon: datosTalon });

    res.status(200).send({
      message: `Talón de la quincena ${talon.QUIN}/${talon.YEAR} entregado a ${empleado.NOMBRE}.`,
      empleado,
      talon: { ...datosTalon, STATUS: TALON_STATUS.ENTREGADO },
      hojas: v.hojas,
      neto: v.datos.neto,
    });
  } catch (error) {
    return errorInterno(res, error, "Error en la entrega por escaneo:");
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
        NUMEMP: 1,
        TALONES: {
          $map: {
            input: {
              $filter: { input: "$TALONES", as: "t", cond: { $in: ["$$t._id", ids] } },
            },
            as: "t",
            in: {
              $mergeObjects: [
                "$$t",
                {
                  TIENE_IMAGEN: {
                    $or: [
                      { $ne: [{ $type: "$$t.IMAGE" }, "missing"] },
                      { $ne: [{ $type: "$$t.IMAGE_ID" }, "missing"] },
                    ],
                  },
                },
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
// Imágenes: `imagenes: [{ _id, image }]` o `[{ _id, images: [hoja1..hoja4] }]`,
// o `image` / `images` cuando es un solo talón.
// - Un talón prestado sin haberse entregado (sin IMAGE) necesita la imagen del
//   original firmado; se valida igual que en entregar-talon y queda como IMAGE_ID.
// - Si ya tenía imagen, la nueva es opcional y se guarda como IMAGE_REGRESO_ID.
// Los datos del préstamo y del regreso se agregan a HISTORIAL_PRESTAMOS.
talonesController.regresarTalon = async (req, res) => {
  const body = req.body || {};
  const { PRESTAMO_ID, FECHA_REGRESO, NOMBRE_ENTREGA, OBSERVACIONES, image, images, imagenes } = body;
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
  const hojasValidas = (i) => !hojasDelBody(i).error;
  if (imagenes !== undefined && (!Array.isArray(imagenes) || imagenes.length > MAX_TALONES_LOTE ||
    !imagenes.every((i) => i && typeof i._id === "string" && ObjectId.isValid(i._id) && hojasValidas(i)))) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: `imagenes debe ser una lista de { _id, image } o { _id, images } (1 a ${MAX_HOJAS_TALON} hojas).` });
  }
  if ((image !== undefined || images !== undefined) && !hojasValidas({ image, images })) {
    return res.status(400).send({ codigo: "DATOS_INVALIDOS", error: hojasDelBody({ image, images }).error });
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

    // Hojas escaneadas por talón (una o varias).
    const imagenPorId = new Map((imagenes || []).map((i) => [String(i._id), hojasDelBody(i).hojas]));
    if ((image || images) && ids.length === 1 && !imagenPorId.has(String(ids[0]))) {
      imagenPorId.set(String(ids[0]), hojasDelBody({ image, images }).hojas);
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
    let duenoRegreso;
    for (const talon of talones) {
      const hojas = imagenPorId.get(String(talon._id));
      if (!hojas) continue;
      const deTalon = { _id: talon._id, QUIN: talon.QUIN, YEAR: talon.YEAR };
      const v = await validarHojasTalon(hojas);
      if (v.error) return res.status(v.error.status).send({ ...v.error.body, ...deTalon });
      if (v.legado) {
        const procesada = await procesarImagenTalon(hojas[0]);
        if (!procesada.storedBuffer) {
          return res.status(procesada.status).send({ ...procesada.body, ...deTalon });
        }
        guardadas.set(String(talon._id), procesada.storedBuffer);
        continue;
      }
      if (duenoRegreso === undefined) {
        [duenoRegreso = null] = await buscarEmpleado({ _id: doc._idEmployee });
      }
      const chequeo = verificarHojasContraTalon(v.datos, talon, duenoRegreso);
      if (chequeo.error) return res.status(chequeo.error.status).send({ ...chequeo.error.body, ...deTalon });
      guardadas.set(String(talon._id), v.storedBuffer);
    }

    // Las imágenes ya validadas se suben a GridFS; si algo falla después se borran.
    const imagenIds = new Map();
    for (const talon of talones) {
      const buf = guardadas.get(String(talon._id));
      if (!buf) continue;
      imagenIds.set(String(talon._id), await guardarImagenTalon(buf, {
        talonId: talon._id,
        empleadoId: doc._idEmployee,
        tipo: talon.TIENE_IMAGEN ? "REGRESO" : "ENTREGA",
        subidoPor: user.username,
        fecha: new Date(),
      }));
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
      const img = imagenIds.get(String(talon._id));
      if (img && !talon.TIENE_IMAGEN) {
        $set[`${ruta}.IMAGE_ID`] = img;
        $set[`${ruta}.FECHA_ENTREGA`] = ahora;
        $set[`${ruta}.ENTREGADO_POR`] = user.username;
      } else if (img) {
        $set[`${ruta}.IMAGE_REGRESO_ID`] = img;
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
      await borrarImagenesTalon([...imagenIds.values()]);
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
