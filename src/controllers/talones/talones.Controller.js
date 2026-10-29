const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const { querysql } = require("../../config/mysql");

const normalizeText = (text = "") =>
  text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina acentos
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

const talonesController = {};

// Obtener perfil del empleado y calcular días restantes
talonesController.getProfile = async (req, res) => {
  const id = req.params.id;
  const user = req.user;

  try {
    // Buscar empleado en PLANTILLA y PLANTILLA_FORANEA
    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(id) }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(id) }),
    ]);

    const employee = employeePlantilla.length
      ? employeePlantilla
      : employeeForanea.length
        ? employeeForanea
        : [];

    if (!employee || employee.length === 0) {
      res.status(404).send({ error: "No data found" });
      return;
    }

    const emp = employee[0];

    // Obtener la bitácora del empleado
    const bitacora = await query("BITACORA", {
      id_plantilla: emp._id,
    });
    emp.bitacora = bitacora;

    const incapacidades = await query("INCAPACIDADES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const permisosExt = await query("PERMISOS_EXT", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });

    // Buscar documento de talones del empleado
    const talonesDoc = await query("TALONES", {
      _idEmployee: new ObjectId(emp._id),
    });

    if (emp.SINDICATO && emp.SINDICATO.DELEGACION) {
      const delegados = await querysql(`
      SELECT * FROM delegaciones
      WHERE delegacion = ?`,
        [emp.SINDICATO.DELEGACION],
      );
      emp.SINDICATO.DELEGADO = delegados.length > 0 ? delegados[0].delegado : null;
    }


    const ASIST_PROFILE = {
      employee: [emp],
      incapacidades: incapacidades,
      permisosExt: permisosExt,
      talones: talonesDoc, // <-- aquí están el talón actual y los anteriores
    };

    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: user.username,
      module: "TP",
      action: `CONSULTÓ EL PERFIL DE TALÓN DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
    };
    await insertOne("USER_ACTIONS", userAction);
    console.log("Profile data:", ASIST_PROFILE);

    res.status(200).send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

// Obtener talones pendientes a regresar
talonesController.getAllTalonesPendientesRegresar = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    const talonesDocumentos = await query("TALONES", {});

    // Si no hay documentos de talones, devolver array vacío
    if (!talonesDocumentos || talonesDocumentos.length === 0) {
      const userAction = {
        username: user.username,
        module: "TP",
        action: `CONSULTÓ TALONES PENDIENTES A REGRESAR (NO HAY TALONES)`,
        timestamp: currentDateTime,
      };
      await insertOne("USER_ACTIONS", userAction);
      return res.status(200).send([]);
    }

    const [empleadosPlantilla = [], empleadosForanea = []] = await Promise.all([
      query("PLANTILLA", { status: 1 }),
      query("PLANTILLA_FORANEA", { status: 1 }),
    ]);
    const todosEmpleados = [...empleadosPlantilla, ...empleadosForanea];

    const empleadosMap = {};
    todosEmpleados.forEach((emp) => {
      empleadosMap[emp._id.toString()] = emp;
    });

    const talonesRegresar = [];

    talonesDocumentos.forEach((doc) => {
      const empId =
        doc._idEmployee && doc._idEmployee.toString
          ? doc._idEmployee.toString()
          : null;
      const empleado = empId ? empleadosMap[empId] : null;

      if (empleado && Array.isArray(doc.TALONES)) {
        doc.TALONES.forEach((talon) => {
          if (talon.STATUS === 3) {
            talonesRegresar.push({
              _id: talon._id,
              QUINCENA: talon.QUIN,
              status: talon.STATUS,
              empleado: {
                _id: empleado._id,
                NOMBRE: `${empleado.APE_PAT || ""} ${empleado.APE_MAT || ""} ${empleado.NOMBRES || ""
                  }`.trim(),
                TIPONOM: empleado.TIPONOM,
                ADSCRIPCION: empleado.ADSCRIPCION,
              },
            });
          }
        });
      }
    });

    const userAction = {
      username: user.username,
      module: "TAL-REG",
      action: `CONSULTÓ TALONES PENDIENTES A REGRESAR (STATUS 2)`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    return res.status(200).send(talonesRegresar);
  } catch (error) {
    console.error("Error fetching talones a regresar:", error);
    res.status(500).send({ error: "An error occurred while fetching talones" });
  }
};

// Obtener talones pendientes a entregar (status === 2) con información del empleado
talonesController.getAllTalonesPendintesEntregar = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    const talonesDocumentos = await query("TALONES", {});

    // Si no hay documentos de talones, devolver array vacío
    if (!talonesDocumentos || talonesDocumentos.length === 0) {
      const userAction = {
        username: user.username,
        module: "TP",
        action: `CONSULTÓ TALONES PENDIENTES A ENTREGAR (NO HAY TALONES)`,
        timestamp: currentDateTime,
      };
      await insertOne("USER_ACTIONS", userAction);
      return res.status(200).send([]);
    }

    const [empleadosPlantilla = [], empleadosForanea = []] = await Promise.all([
      query("PLANTILLA", { status: 1 }),
      query("PLANTILLA_FORANEA", { status: 1 }),
    ]);
    const todosEmpleados = [...empleadosPlantilla, ...empleadosForanea];

    const empleadosMap = {};
    todosEmpleados.forEach((emp) => {
      empleadosMap[emp._id.toString()] = emp;
    });

    const talonesEntregar = [];

    talonesDocumentos.forEach((doc) => {
      const empId =
        doc._idEmployee && doc._idEmployee.toString
          ? doc._idEmployee.toString()
          : null;
      const empleado = empId ? empleadosMap[empId] : null;

      if (empleado && Array.isArray(doc.TALONES)) {
        doc.TALONES.forEach((talon) => {
          if (talon.STATUS === 2) {
            talonesEntregar.push({
              _id: talon._id,
              QUINCENA: talon.QUIN,
              status: talon.STATUS,
              empleado: {
                _id: empleado._id,
                NOMBRE: `${empleado.APE_PAT || ""} ${empleado.APE_MAT || ""} ${empleado.NOMBRES || ""
                  }`.trim(),
                TIPONOM: empleado.TIPONOM,
                ADSCRIPCION: empleado.ADSCRIPCION,
              },
            });
          }
        });
      }
    });

    const userAction = {
      username: user.username,
      module: "TAL-ENT",
      action: `CONSULTÓ TALONES PENDIENTES A ENTREGAR (STATUS 2)`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    return res.status(200).send(talonesEntregar);
  } catch (error) {
    console.error("Error fetching talones a entregar:", error);
    res.status(500).send({ error: "An error occurred while fetching talones" });
  }
};

// Realizar la entrega del talón de pago
talonesController.uploadTalonImage = async (req, res) => {
  const { _idTalon, image } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  if (!_idTalon || !image) {
    return res.status(400).send({
      codigo: "DATOS_INCOMPLETOS",
      error: "Faltan datos para procesar el talón de pago."
    });
  }

  try {
    // Convertir _idTalon a ObjectId
    const talonObjectId = new ObjectId(_idTalon);

    // Buscar el documento TALONES que contenga el talón con ese _id (como ObjectId)
    const talonesDocs = await query("TALONES", {
      "TALONES._id": talonObjectId,
    });

    if (!talonesDocs || talonesDocs.length === 0) {
      return res.status(404).send({
        codigo: "TALON_NO_ENCONTRADO",
        error: "No se encontró el talón de pago solicitado."
      });
    }

    const talonesDoc = talonesDocs[0];
    const talonIndex = talonesDoc.TALONES.findIndex(
      (t) => t._id && t._id.equals && t._id.equals(talonObjectId)
    );
    if (talonIndex === -1) {
      return res.status(404).send({
        codigo: "TALON_NO_ENVIADO",
        error: "No se envió el talón de pago en el documento."
      });
    }
    // Convertir base64 a buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Procesar imagen con sharp para obtener dimensiones y extraer regiones
    const metadata = await sharp(imageBuffer).metadata();
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
      logger: (m) => console.log(m),
      tessedit_pageseg_mode: "7",
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ ",
    };

    const [pagadorResult, firmaResult] = await Promise.all([
      Tesseract.recognize(pagadorRegion, "spa", ocrOptions),
      Tesseract.recognize(firmaTextRegion, "spa", ocrOptions),
    ]);

    const pagadorText = pagadorResult?.data?.text || "";
    const firmaText = firmaResult?.data?.text || "";
    const normalizedPagadorText = talonNormalize(pagadorText);
    const normalizedFirmaText = talonNormalize(firmaText);

    console.log("Texto detectado en región de pagador:", normalizedPagadorText);
    console.log("Texto detectado en región de firma:", normalizedFirmaText);

    const contienePagador = talonContainsPagador(normalizedPagadorText);
    const contieneEmpleado = talonContainsEmpleado(normalizedPagadorText);
    const contieneFirmaRecibido = talonContainsFirmaRecibido(normalizedFirmaText);

    if (contieneEmpleado) {
      return res.status(422).send({
        codigo: "TALON_CONTIENE_EMPLEADO",
        error: 'El talón contiene "EMPLEADO" en lugar de "PAGADOR".'
      });
    }

    if (!contienePagador) {
      return res.status(422).send({
        codigo: "TALON_SIN_PAGADOR",
        error: 'No se identificó la sección "PAGADOR" en el talón.'
      });
    }

    if (!contieneFirmaRecibido) {
      return res.status(422).send({
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
    console.log(
      `Píxeles con tinta en región de firma: ${inkPercentage.toFixed(2)}%`
    );

    const contieneTintaEnFirma = inkPercentage > 0.5;

    if (!contieneTintaEnFirma) {
      return res.status(422).send({
        codigo: "TALON_SIN_FIRMA",
        error: "No se detectó tinta en el espacio de firma del talón."
      });
    }

    // Si pasa ambas validaciones, guardar la imagen en base64 en el talón y cambiar status a 1
    talonesDoc.TALONES[talonIndex].IMAGE = image;
    talonesDoc.TALONES[talonIndex].STATUS = 2;

    // Actualizar el documento en la base de datos
    await updateOne(
      "TALONES",
      { _id: talonesDoc._id },
      {
        $set: {
          [`TALONES.${talonIndex}.IMAGE`]: image,
          [`TALONES.${talonIndex}.STATUS`]: 2,
        },
      }
    );

    // Registrar acción de usuario
    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: `HIZO LA ENTREGA DEL TALÓN DE PAGO DE LA QUINCENA ${talonesDoc.TALONES[talonIndex].QUIN} DEL AÑO ${talonesDoc.TALONES[talonIndex].YEAR} AL EMPLEADO`,
      timestamp: currentDateTime,
    });

    res.status(200).send({ message: "Imagen guardada correctamente en el talón.", _id: talonesDoc._idEmployee });
  } catch (error) {
    console.error("Error al subir imagen al talón:", error);
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

// Realizar el prestamo del talón de pago
talonesController.prestarTalon = async (req, res) => {
  const {
    _id,
    TIPO_RECEPTOR,
    NOMBRE_RECEPTOR,
    FECHA_PRESTAMO,
    FOLIO_RH,
    OBSERVACIONES = "",
  } = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  if (!_id || !ObjectId.isValid(_id)) {
    return res.status(400).send({
      error: "Se requiere un identificador válido para el talón de pago."
    });
  }

  try {
    const talonObjectId = new ObjectId(_id);

    // Buscar el documento TALONES que contenga el talón con ese _id (como ObjectId)
    const talonesDocs = await query("TALONES", {
      "TALONES._id": talonObjectId,
    });

    if (!talonesDocs || talonesDocs.length === 0) {
      return res.status(404).send({
        error: "No se encontró el talón de pago solicitado."
      });
    }

    const talonesDoc = talonesDocs[0];
    const talonIndex = talonesDoc.TALONES.findIndex(
      (t) => t._id && t._id.equals && t._id.equals(talonObjectId)
    );

    if (talonIndex === -1) {
      return res.status(404).send({
        error: "No se encontró el talón de pago solicitado."
      });
    }

    // Actualizar el documento en la base de datos
    await updateOne(
      "TALONES",
      { _id: talonesDoc._id },
      {
        $set: {
          [`TALONES.${talonIndex}.STATUS`]: 3,
          [`TALONES.${talonIndex}.TIPO_RECEPTOR`]: TIPO_RECEPTOR,
          [`TALONES.${talonIndex}.NOMBRE_RECEPTOR`]: NOMBRE_RECEPTOR || "",
          [`TALONES.${talonIndex}.FECHA_PRESTAMO`]: FECHA_PRESTAMO,
          [`TALONES.${talonIndex}.FOLIO_RH`]: FOLIO_RH,
          [`TALONES.${talonIndex}.OBSERVACIONES`]: OBSERVACIONES,
        },
      }
    );

    // Registrar acción de usuario
    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TP",
      action: `HIZO EL PRESTAMÓ DEL TALÓN DE PAGO DE LA QUINCENA ${talonesDoc.TALONES[talonIndex].QUIN} DEL AÑO ${talonesDoc.TALONES[talonIndex].YEAR}`,
      timestamp: currentDateTime,
    });

    res.send({
      message: "Talón de pago prestado correctamente",
      _id: talonesDoc._idEmployee
    });
  } catch (error) {
    console.error("Error al prestar el talón de pago:", error);
    res.status(500).send({ error: "Ha ocurrido un error al realizar el prestamo del talón de pago" });
  }
}
module.exports = talonesController;