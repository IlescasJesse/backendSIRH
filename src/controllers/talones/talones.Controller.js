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

    console.log("Employee data:", emp.STATUS_EMPLEADO);

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
      module: "AEI-PI",
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
        module: "TAL-REG",
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
          if (talon.status === 3) {
            talonesRegresar.push({
              _id: talon._id,
              QUINCENA: talon.QUINCENA,
              status: talon.status,
              empleado: {
                _id: empleado._id,
                NOMBRE: `${empleado.APE_PAT || ""} ${empleado.APE_MAT || ""} ${
                  empleado.NOMBRES || ""
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
        module: "TAL-ENT",
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
          if (talon.status === 2) {
            talonesEntregar.push({
              _id: talon._id,
              QUINCENA: talon.QUINCENA,
              status: talon.status,
              empleado: {
                _id: empleado._id,
                NOMBRE: `${empleado.APE_PAT || ""} ${empleado.APE_MAT || ""} ${
                  empleado.NOMBRES || ""
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
/**
 * POST /talones/upload-image
 * Body: { _idTalon: string, image: string (base64) }
 *
 * - Busca el talón por _idTalon dentro de la colección TALONES.
 * - Valida que la imagen contenga "PAGADOR" en rojo en la parte inferior.
 * - Valida que la imagen contenga una firma azul en la esquina inferior derecha.
 * - Si pasa ambas validaciones, guarda la imagen en base64 en el talón (propiedad image).
 */
talonesController.uploadTalonImage = async (req, res) => {
  const { _idTalon, image } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  if (!_idTalon || !image) {
    return res
      .status(400)
      .send({ error: "Faltan parámetros requeridos (_idTalon, image)" });
  }

  try {
    // Convertir _idTalon a ObjectId
    const talonObjectId = new ObjectId(_idTalon);

    // Buscar el documento TALONES que contenga el talón con ese _id (como ObjectId)
    const talonesDocs = await query("TALONES", {
      "TALONES._id": talonObjectId,
    });
    if (!talonesDocs || talonesDocs.length === 0) {
      return res.status(404).send({ error: "No se encontró el talón" });
    }
    const talonesDoc = talonesDocs[0];
    // Buscar el índice del talón usando ObjectId.equals
    const talonIndex = talonesDoc.TALONES.findIndex(
      (t) => t._id && t._id.equals && t._id.equals(talonObjectId)
    );
    if (talonIndex === -1) {
      return res
        .status(404)
        .send({ error: "No se encontró el talón en el documento" });
    }

    // --- Validaciones de imagen desactivadas temporalmente ---
    // El reconocimiento OCR no es confiable, se comenta todo el código de validación

    /*
    // Convertir base64 a buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Procesar imagen con sharp para obtener dimensiones y extraer regiones
    const img = sharp(imageBuffer);
    const metadata = await img.metadata();
    const { width, height } = metadata;

    // Extraer región inferior (últimos 15% de la imagen) para buscar "PAGADOR"
    const bottomRegionHeight = Math.floor(height * 0.15);
    const bottomRegion = await img
      .extract({
        left: 0,
        top: height - bottomRegionHeight,
        width: width,
        height: bottomRegionHeight,
      })
      .toBuffer();

    // Realizar OCR en la región inferior completa con mejor configuración
    const {
      data: { text: bottomText },
    } = await Tesseract.recognize(bottomRegion, "spa", {
      logger: (m) => console.log(m),
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ abcdefghijklmnopqrstuvwxyzáéíóú0123456789",
    });

    console.log("Texto detectado en región inferior:", bottomText);

    // Normalizar el texto para mejor comparación
    const normalizedText = bottomText
      .toUpperCase()
      .replace(/[^A-ZÁÉÍÓÚ0-9\s]/g, "") // Eliminar caracteres especiales
      .replace(/\s+/g, " ") // Normalizar espacios
      .trim();

    console.log("Texto normalizado:", normalizedText);

    // Validar que contenga "PAGADOR" con múltiples variaciones de OCR
    const pagadorPatterns = [
      "PAGADOR",
      "PAG ADOR",
      "PAGAD0R",
      "PAGAD0R",
      "P AGADOR",
      "PAGAD OR",
      "PAGAD0 R",
      "7OBIERNO", // Si detecta 7OBIERNO significa que está cerca de GOBIERNO y PAGADOR
    ];

    const contienePagador = pagadorPatterns.some((pattern) =>
      normalizedText.includes(pattern)
    );

    // Validar que NO contenga "EMPLEADO" (debe ser PAGADOR, no EMPLEADO)
    const empleadoPatterns = ["EMPLEADO", "EMPLE ADO", "EMPLE AD0", "EMPLEAD0"];

    const contieneEmpleado = empleadoPatterns.some((pattern) =>
      normalizedText.includes(pattern)
    );

    if (contieneEmpleado) {
      return res.status(402).send({
        error: 'La imagen contiene "EMPLEADO" en vez de "PAGADOR".',
        textoDetectado: bottomText,
      });
    }

    if (!contienePagador) {
      return res.status(403).send({
        error: 'La imagen no contiene "PAGADOR" en la parte inferior.',
        textoDetectado: bottomText,
      });
    }

    // Validar que contenga "FIRMA DE RECIBIDO" o similar (con variaciones extensas de OCR)
    const firmaPatterns = [
      "FIRMA",
      "F IRMA",
      "FI RMA",
      "FlRMA",
      "FIRNA",
      "FJRMA",
      "FIHMA",
      "FlRNA",
      "F1RMA",
      "FIR MA",
      "FIFMA",
      "FIRVA",
      "ORE", // Variación de OCR muy común
      "FIRE",
      "FIMA",
      "FIRA",
    ];

    const recibidoPatterns = [
      "RECIBIDO",
      "RECIBID0",
      "RECI BIDO",
      "RECIIDO",
      "RECIBI DO",
      "RECIBID O",
      "RECI BID0",
      "RECIB1DO",
      "RECIB IDO",
      "REC1BIDO",
      "RECIEIDO",
      "RECIBLDO",
      "RECIBLD0",
      "RECIBI D0",
      "RECLBIDO",
      "RECIBICO",
      "RECIBUO",
      "RECIBIDD",
      "RECIBIPO",
      "RECIBLIDO",
      "DOUE", // Variaciones extremas detectadas por OCR
      "DDUE",
      "DDULE",
      "RECIB",
    ];

    const dePatterns = ["DE", "D E", "0E", "DE", "DF", "UE", "OE"];

    const contieneFirma = firmaPatterns.some((pattern) =>
      normalizedText.includes(pattern)
    );

    const contieneRecibido = recibidoPatterns.some((pattern) =>
      normalizedText.includes(pattern)
    );

    const contieneDe = dePatterns.some((pattern) =>
      normalizedText.includes(pattern)
    );

    // Validar con lógica más flexible
    const contieneFirmaRecibido =
      (contieneFirma || normalizedText.includes("FIRMA")) &&
      (contieneRecibido || normalizedText.includes("RECIB"));

    if (!contieneFirmaRecibido) {
      return res.status(404).send({
        error: 'La imagen no contiene el texto "FIRMA DE RECIBIDO".',
        textoDetectado: bottomText,
      });
    }

    // Extraer región derecha inferior (últimos 30% width y 20% height) para buscar firma azul
    const firmaWidth = Math.floor(width * 0.3);
    const firmaHeight = Math.floor(height * 0.2);
    const firmaRegion = await img
      .extract({
        left: width - firmaWidth,
        top: height - firmaHeight,
        width: firmaWidth,
        height: firmaHeight,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Analizar colores en la región de firma para detectar azul
    const { data: pixels, info } = firmaRegion;
    let bluePixelCount = 0;
    const totalPixels = info.width * info.height;

    // Recorrer píxeles y contar los que son azules (RGB donde B > R y B > G)
    for (let i = 0; i < pixels.length; i += info.channels) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Detectar azul: canal azul dominante (firma en azul)
      if (b > r + 20 && b > g + 20 && b > 80) {
        bluePixelCount++;
      }
    }

    const bluePercentage = (bluePixelCount / totalPixels) * 100;
    console.log(
      `Píxeles azules en región de firma: ${bluePercentage.toFixed(2)}%`
    );

    // Si menos del 0.5% de píxeles son azules, probablemente no hay firma azul
    const contieneFirmaAzul = bluePercentage > 0.5;

    if (!contieneFirmaAzul) {
      return res.status(405).send({
        error:
          "La imagen no contiene firma azul en la sección de FIRMA DE RECIBIDO.",
      });
    }
    */

    // Si pasa ambas validaciones, guardar la imagen en base64 en el talón y cambiar status a 1
    talonesDoc.TALONES[talonIndex].IMAGE = image;
    talonesDoc.TALONES[talonIndex].STATUS = 1;

    // Actualizar el documento en la base de datos
    await updateOne(
      "TALONES",
      { _id: talonesDoc._id },
      {
        $set: {
          [`TALONES.${talonIndex}.IMAGE`]: image,
          [`TALONES.${talonIndex}.STATUS`]: 1,
        },
      }
    );

    // Registrar acción de usuario
    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "TAL-IMG",
      action: `SUBIÓ IMAGEN AL TALÓN ${_idTalon}`,
      timestamp: currentDateTime,
    });

    res
      .status(200)
      .send({ message: "Imagen guardada correctamente en el talón." });
  } catch (error) {
    console.error("Error al subir imagen al talón:", error);
    res.status(500).send({ error: "Ocurrió un error al guardar la imagen." });
  }
};
module.exports = talonesController;
