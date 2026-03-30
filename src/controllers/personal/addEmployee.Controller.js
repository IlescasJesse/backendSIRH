const { query, updateOne, insertOne } = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const { querysql } = require("../../config/mysql");
const { getAdscripciones } = require("../../libs/adscriptions");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { createNotification } = require("../../services/notification.service");
const { permission } = require("process");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

employeeController = {};

// Función para obtener posiciones vacantes y sus ocupantes anteriores
employeeController.getVacants = async (_, res) => {
  console.log("Fetching vacants..."); // Verificar si la función se llama
  try {
    const vacants = await query("PLANTILLA", { status: { $in: [2, 3] } });

    const previousOcupant = await query("PLAZAS", {
      status: { $in: [2, 3] },
    });

    vacants.forEach((vacant) => {
      const matchingPreviousOcupant = previousOcupant.find(
        (po) => po.NUMPLA === vacant.NUMPLA,
      );
      if (matchingPreviousOcupant) {
        vacant.status_plaza = matchingPreviousOcupant;
      }
    });

    res.status(200).json(vacants);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para obtener información del municipio basada en el código postal
employeeController.getMpio = async (req, res) => {
  const { zipCode } = req.body;
  if (!zipCode) {
    return res.status(400).json({ message: "zipCode is required" });
  }
  try {
    const mpios = await querysql(
      "SELECT d_codigo, d_asenta, d_tipo_asenta, D_mnpio, d_estado, d_ciudad FROM cp_2025 WHERE d_codigo = ?",
      [zipCode],
    );
    const formattedMpios = mpios.map((mpio) => ({
      municipio: mpio.D_mnpio.toUpperCase(),

      estado: mpio.d_estado.toUpperCase(),

      asentamiento: `${mpio.d_tipo_asenta.toUpperCase()} ${mpio.d_asenta.toUpperCase()}`,

      ciudad: mpio.d_ciudad.toUpperCase(),

      complete: `${mpio.d_tipo_asenta.toUpperCase()} ${mpio.d_asenta.toUpperCase()}, ${mpio.D_mnpio.toUpperCase()}, ${mpio.d_estado.toUpperCase()}`,

      ciudad: mpio.d_ciudad,
      complete: `${mpio.d_tipo_asenta} ${mpio.d_asenta}, ${mpio.D_mnpio}, ${mpio.d_estado}`,
    }));
    res.status(200).json(formattedMpios);
  } catch (error) {
    console.error("Error ejecutando la consulta SQL:", error);
    res.status(500).json({ message: "Error executing SQL query", error });
  }
};

// Función para obtener información interna incluyendo unidad ejecutora, categorías y adscripciones
employeeController.internalInformation = async (req, res) => {
  try {
    const categorias = await querysql("SELECT * FROM categorias_catalogo");

    const base = categorias.filter(
      (categoria) =>
        categoria.T_NOMINA === "M51" || categoria.T_NOMINA === "F51",
    );

    const contrato = categorias.filter(
      (categoria) =>
        categoria.T_NOMINA === "F53" ||
        categoria.T_NOMINA === "CCT" ||
        categoria.T_NOMINA === "CCO" ||
        categoria.T_NOMINA === "FCO" ||
        categoria.T_NOMINA === "511" ||
        categoria.T_NOMINA === "M53",
    );

    const mandosMedios = categorias.filter(
      (categoria) =>
        categoria.T_NOMINA === "MMS" || categoria.T_NOMINA === "FMM",
    );

    const categorizedCategorias = { base, contrato, mandosMedios };

    const proyectos = await querysql(`
    SELECT 
      a.nombre AS adscripcion, 
      t.jerarquia, 
      a.nivel, 
      a.clave, 
      f.nombre AS origen, 
      p.proyecto, 
      p.unidad_responsable, 
      p.unidad_ejecutora, 
      p.obra_actividad 
    FROM adscripciones a
    LEFT JOIN adscripcion_proyecto ap ON ap.id_adscripcion = a.id_adscripcion
    LEFT JOIN proyectos p ON ap.id_proyecto = p.id_proyecto
    JOIN aux_catalogo_adsc t ON a.tipo = t.id
    LEFT JOIN adscripciones f ON a.parent_id = f.id_adscripcion
    ORDER BY a.nivel ASC
    `);

    const groupedProyectos = {};
    proyectos.forEach(row => {
      const adscripcion = row.adscripcion;
      const clave = row.clave;

      // Si no hay proyecto, solo añade la adscripción sin proyectos
      if (!row.proyecto) {
        if (!groupedProyectos[adscripcion]) {
          groupedProyectos[adscripcion] = {
            nombre: adscripcion,
            proyectos: {},
            nivel: row.nivel,
            clave: clave
          };
        }
        return; // Salta al siguiente
      }

      // Si hay proyecto, procesa normalmente
      const proyecto = row.proyecto;
      const obra = {
        obra_actividad: row.obra_actividad,
        unidad_responsable: row.unidad_responsable,
        unidad_ejecutora: row.unidad_ejecutora,
      };

      if (!groupedProyectos[adscripcion]) {
        groupedProyectos[adscripcion] = {
          nombre: adscripcion,
          proyectos: {},
          nivel: row.nivel,
          clave: clave
        };
      }

      if (!groupedProyectos[adscripcion].proyectos[proyecto]) {
        groupedProyectos[adscripcion].proyectos[proyecto] = {
          no_proyecto: proyecto,
          obras_actividades: []
        };
      }

      groupedProyectos[adscripcion].proyectos[proyecto].obras_actividades.push(obra);
    });

    // Convertir el objeto agrupado a un arreglo
    const groupedProyectosArray = Object.values(groupedProyectos).map(group => ({
      nombre: group.nombre,
      proyectos: Object.values(group.proyectos).sort((a, b) => a.no_proyecto.localeCompare(b.no_proyecto)),  // Ordenar proyectos por no_proyecto
      nivel: group.nivel,
      clave: group.clave
    }));

    const adscripciones = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    };

    groupedProyectosArray.forEach(item => {
      if (adscripciones[item.nivel]) {
        adscripciones[item.nivel].push(item);
      }
    });

    const internalInformation = {
      categorizedCategorias,
      adscripciones,
    };

    res.status(200).json(internalInformation);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para obtener información de una plaza basada en su número
employeeController.dataPlaza = async (req, res) => {
  const { NUMPLA } = req.body;
  if (!NUMPLA) {
    return res.status(400).json({ message: "NUMPLA is required" });
  }
  try {
    const dataPlaza = await query("PLAZAS", { NUMPLA, status: 2 });
    const plantillaData = await query("PLANTILLA", { NUMPLA, status: 2 });
    if (
      !dataPlaza ||
      dataPlaza.length === 0 ||
      !plantillaData ||
      plantillaData.length === 0
    ) {
      return res.status(404).json({ message: "plaza vacante no encontrada" });
    }

    delete dataPlaza[0].TIPONOM;
    dataPlaza[0].ADSCRIPCION = plantillaData[0].ADSCRIPCION || "";
    dataPlaza[0].PROYECTO = plantillaData[0].PROYECTO || "";
    dataPlaza[0].CLAVE = plantillaData[0].CLAVE || "";
    dataPlaza[0].TIPONOM = plantillaData[0].TIPONOM || "";
    res.status(200).json(dataPlaza);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para guardar un empleado
employeeController.makeProposal = async (req, res) => {
  const user = req.user;
  const { data } = req.body;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  const userAction = {
    username: user.username,
    module: "PSL-PRO",
    action: `REALIZO LA PROPUESTA DE  "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
    timestamp: currentDateTime,
  };

  const today = new Date();
  const options = {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  };
  const [dayToday, monthToday, yeartoday] = new Intl.DateTimeFormat(
    "es-MX",
    options,
  )
    .formatToParts(today)
    .filter((part) => part.type !== "literal")
    .map((part) => part.value);
  const months = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];

  // Calcula FECHA_HOY como FECHA_INGRESO menos 10 días (si FECHA_INGRESO es válida)
  // Si FECHA_INGRESO no existe o no es válida, se usa la fecha actual.
  function formatFechaEsp(date) {
    const meses = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];
    const day = String(date.getDate()).padStart(2, "0");
    const monthNameCapitalized =
      meses[date.getMonth()].charAt(0).toUpperCase() +
      meses[date.getMonth()].slice(1).toLowerCase();
    const year = date.getFullYear();
    return `Oaxaca de Juárez, Oax.${day} de ${monthNameCapitalized} de ${year}`;
  }

  let fechaHoyDate = new Date(); // fallback si FECHA_INGRESO inválida
  if (
    data.FECHA_INGRESO &&
    /^\d{4}-\d{1,2}-\d{1,2}$/.test(data.FECHA_INGRESO)
  ) {
    const [iy, im, id] = data.FECHA_INGRESO.split("-").map(Number);
    const fechaIngreso = new Date(iy, im - 1, id);
    if (!isNaN(fechaIngreso)) {
      fechaHoyDate = new Date(fechaIngreso);
      fechaHoyDate.setDate(fechaHoyDate.getDate() - 9); // FECHA_INGRESO - 10 días
    }
  }
  const FECHA_HOY = formatFechaEsp(fechaHoyDate);

  const monthName = months[parseInt(monthToday, 10) - 1];
  const ID_PLAZA = data.ID_PLAZA ? data.ID_PLAZA : "";
  const monthNameCapitalized =
    monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
  // const FECHA_HOY = `Oaxaca de Juárez, Oax.${ dayToday } de ${ monthNameCapitalized } de ${ yeartoday }`;
  const RFC = data.RFC ? data.RFC : "";
  const NUMPLA = data.NUMPLA ? data.NUMPLA : "";
  const CURP = data.CURP ? data.CURP : "";
  const APE_PAT = data.APE_PAT ? data.APE_PAT : "";
  const APE_MAT = data.APE_MAT ? data.APE_MAT : "";
  const NOMBRES = data.NOMBRES ? data.NOMBRES : "";
  const APE_PAT_OCUPANT = data.SUSTITUYE_A.split(" ")[0];
  const APE_MAT_OCUPANT = data.SUSTITUYE_A.split(" ")[1];
  const NOM_OCUPANT = data.SUSTITUYE_A.split(" ").slice(2).join(" ");
  const UNI_EJECU = data.UNI_EJECU ? data.UNI_EJECU : "";
  const PROYECTO = data.PROYECTO ? data.PROYECTO : "";
  const CLAVE_PRESUPUESTAL = data.PROYECTO.slice(0, -2);
  const C_TRABAJO = data.PROYECTO.slice(-2);
  const OBRA_ACT = data.OBRA_ACT ? data.OBRA_ACT : "";
  const CLAVECAT = data.CLAVECAT ? data.CLAVECAT : "";
  const NOMCATE = data.NOMCATE ? data.NOMCATE : "";
  const FECHA_INGRESO = data.FECHA_INGRESO ? new Date(data.FECHA_INGRESO) : null;
  const AFILIACI = data.AFILIACI ? data.AFILIACI : "";
  const CP = data?.DIRECCION.CP || "";
  const DIRECCION_COMPLETA = `${data?.DIRECCION.DOMICILIO || ""} ${data?.DIRECCION.NUM_EXT || ""} ${data?.DIRECCION.COLONIA || ""
    } ${data?.DIRECCION.MUNICIPIO || ""} ${data?.DIRECCION.ESTADO || ""}`;
  const DIRECCION = data?.DIRECCION || {};
  const COLONIA = data?.DIRECCION.COLONIA || "";
  const DOMICILIO = data?.DIRECCION.DOMICILIO || "";
  const MUNICIPIO = data?.DIRECCION.MUNICIPIO || "";
  const ESTADO = data?.DIRECCION.ESTADO || "";
  const NUM_EXT = data?.NUM_EXT ? data?.NUM_EXT : "";
  const [year, month, day] = data?.FECHA_INGRESO.split("-");
  const FECHA_FORMATTED = `${day} DE ${months[parseInt(month, 10) - 1]
    } DE ${year}`;

  let templateData = {};
  let LEVEL1 = "";
  let LEVEL2 = "";
  let LEVEL3 = "";
  let LEVEL4 = "";
  let LEVEL5 = "";

  if (data.ADSCRIPCION) {
    try {
      const adscripciones = await getAdscripciones(data.ADSCRIPCION);

      if (adscripciones.length === 0) {
        console.error("Adscripciones is empty");
        return res.status(500).json({ message: "Adscripciones is empty" });
      }

      adscripciones.forEach((adscription) => {
        switch (adscription.nivel) {
          case 1:
            LEVEL1 = adscription.nombre;
            break;
          case 2:
            LEVEL2 = adscription.nombre;
            break;
          case 3:
            LEVEL3 = adscription.nombre;
            break;
          case 4:
            LEVEL4 = adscription.nombre;
            break;
          case 5:
            LEVEL5 = adscription.nombre;
            break;
          default:
            console.error("Nivel desconocido:", adscription.nivel);
        }
      });
    } catch (error) {
      console.error("Error obteniendo adscripciones:", error);
      return res
        .status(500)
        .json({ message: "Error obteniendo adscripciones", error });
    }
  } else {
    console.log("No hay departamento");
  }

  const ESTADONAC = data.ESTADONAC ? data.ESTADONAC : "";
  const LUGARNAC = data.LUGARNAC ? data.LUGARNAC : "";
  let NAC_DAY, NAC_MONTH, NAC_YEAR;

  if (data.FECHA_NAC) {
    const fecha_nacimiento = new Date(data.FECHA_NAC);
    if (!isNaN(fecha_nacimiento)) {
      NAC_DAY = fecha_nacimiento.getDate();
      NAC_MONTH = fecha_nacimiento.getMonth() + 1; // Months are zero-based
      NAC_YEAR = fecha_nacimiento.getFullYear();
    } else {
      console.error("Invalid date format for FECHA_NAC:", data.FECHA_NAC);
    }
  } else {
    console.error("FECHA_NAC is not provided");
  }
  const FECHA_NAC = data.FECHA_NAC ? data.FECHA_NAC : "";

  const NOMBRE_PAPA = data.NOMBRE_PAPA ? data.NOMBRE_PAPA : "";
  const APEPAT_PAPA = data.APEPAT_PAPA ? data.APEPAT_PAPA : "";
  const APEMAT_PAPA = data.APEMAT_PAPA ? data.APEMAT_PAPA : "";
  const NOMBRE_MAMA = data.NOMBRE_MAMA ? data.NOMBRE_MAMA : "";
  const APEPAT_MAMA = data.APEPAT_MAMA ? data.APEPAT_MAMA : "";
  const APEMAT_MAMA = data.APEMAT_MAMA ? data.APEMAT_MAMA : "";
  const UNI_RESPO = data.UNI_RESPO ? data.UNI_RESPO : "";
  const REFERENCIA = data.REFERENCIA ? data.REFERENCIA : "";
  const TIPONOM = data.TIPONOM ? data.TIPONOM : "";
  const NIVEL = data.NIVEL ? data.NIVEL : "";

  const NUM_UNI_MED_FAM = data.NUM_UNI_MED_FAM ?? "DESCONOCIDO";

  let dayIMSS, monthIMSS, yearIMSS;
  let FECHA_IMSS_FORMATTED;
  const FECHA_INGRESO_IMSS = data.FECHA_INGRESO_IMSS
    ? data.FECHA_INGRESO_IMSS
    : null;
  if (FECHA_INGRESO_IMSS === null) {
    FECHA_IMSS_FORMATTED = "DESCONOCIDO";
  } else {
    [yearIMSS, monthIMSS, dayIMSS] = FECHA_INGRESO_IMSS.split("-");
    FECHA_IMSS_FORMATTED = `${parseInt(dayIMSS, 10)} DE ${months[parseInt(monthIMSS, 10) - 1]
      } DE ${parseInt(yearIMSS, 10)}`;
  }

  const SEXO = data.SEXO ? data.SEXO : "";
  templateData = {
    FECHA_HOY,
    RFC,
    SEXO,
    AFILIACI,
    NUMPLA,
    CURP,
    NUMPLA,
    APE_PAT,
    APE_MAT,
    NOMBRES,
    APE_PAT_OCUPANT,
    APE_MAT_OCUPANT,
    NOM_OCUPANT,
    PROYECTO,
    CLAVE_PRESUPUESTAL,
    C_TRABAJO,
    UNI_EJECU,
    UNI_RESPO,
    OBRA_ACT,
    CLAVECAT,
    NOMCATE,
    FECHA_INGRESO,
    FECHA_FORMATTED,
    LEVEL1,
    LEVEL2,
    LEVEL3,
    LEVEL4,
    LEVEL5,
    LUGARNAC,
    NAC_DAY,
    NAC_MONTH,
    NAC_YEAR,
    CP,
    ESTADO,
    MUNICIPIO,
    COLONIA,
    DOMICILIO,
    NUM_EXT,
    DIRECCION_COMPLETA,
    NOMBRE_PAPA,
    APEPAT_PAPA,
    APEMAT_PAPA,
    NOMBRE_MAMA,
    APEPAT_MAMA,
    APEMAT_MAMA,
    NUM_UNI_MED_FAM,
    ID_PLAZA,
    FECHA_IMSS_FORMATTED,
    ESTADONAC,
    REFERENCIA,
    TIPONOM,
    NIVEL,
    FECHA_NAC,
    DIRECCION,
  };

  // --- Generación del documento: usar template PDF ---
  const pdfTemplatePath = path.resolve(
    __dirname,
    "../../templates/templateAlta.pdf",
  );
  if (!fs.existsSync(pdfTemplatePath)) {
    return res
      .status(404)
      .json({ message: "Template PDF no encontrado", path: pdfTemplatePath });
  }

  try {
    const updatePlantillaResult = await updateOne(
      "PLANTILLA",
      { NUMPLA: data.NUMPLA },
      { $set: { status: 3, templateData } },
    );
    if (updatePlantillaResult.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "No matching document found in PLANTILLA" });
    }

    const updatePlazasResult = await updateOne(
      "PLAZAS",
      { NUMPLA: data.NUMPLA },
      { $set: { status: 3 } },
    );
    if (updatePlazasResult.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "No matching document found in PLAZAS" });
    }
    // Cargar PDF
    const pdfBytes = fs.readFileSync(pdfTemplatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // Obtener campos del formulario y mapear nombres reales
    const form = pdfDoc.getForm();
    const fieldsByName = Object.fromEntries(
      form.getFields().map((f) => [f.getName(), f]),
    );

    const fieldMapping = {
      FECHA_HOY: FECHA_HOY,
      RFC: RFC,
      CURP: CURP,
      NUMPLA: NUMPLA,
      APE_PAT: APE_PAT,
      APE_MAT: APE_MAT,
      NOMBRES: NOMBRES,
      APE_PAT_OCUPANT: APE_PAT_OCUPANT,
      APE_MAT_OCUPANT: APE_MAT_OCUPANT,
      NOM_OCUPANT: NOM_OCUPANT,
      UNI_EJECU: UNI_EJECU,
      CLAVE_PRESUPUESTAL: CLAVE_PRESUPUESTAL,
      C_TRABAJO: C_TRABAJO,
      OBRA_ACT: OBRA_ACT,
      CLAVECAT: CLAVECAT,
      NOMCATE: NOMCATE,
      FECHA_FORMATTED: FECHA_FORMATTED,
      LEVEL2: LEVEL2,
      LEVEL3: LEVEL3,
      LEVEL4: LEVEL4,
      LEVEL5: LEVEL5,
      AFILIACI: AFILIACI,
      APE_PAT: APE_PAT,
      APE_MAT: APE_MAT,
      NOMBRES: NOMBRES,
      SEXO: SEXO,
      LUGARNAC: LUGARNAC,
      NAC_DAY: NAC_DAY,
      NAC_MONTH: NAC_MONTH,
      NAC_YEAR: NAC_YEAR,
      DIRECCION_COMPLETA: DIRECCION_COMPLETA,
      CP: CP,
      APEPAT_PAPA: APEPAT_PAPA,
      APEMAT_PAPA: APEMAT_PAPA,
      NOMBRE_PAPA: NOMBRE_PAPA,
      APEPAT_MAMA: APEPAT_MAMA,
      APEMAT_MAMA: APEMAT_MAMA,
      NOMBRE_MAMA: NOMBRE_MAMA,
      NUM_UNI_MED_FAM: NUM_UNI_MED_FAM,
      FECHA_IMSS_FORMATTED: FECHA_IMSS_FORMATTED,
    };

    const missing = [];
    for (const [pdfFieldName, value] of Object.entries(fieldMapping)) {
      const fld = fieldsByName[pdfFieldName];
      if (fld) {
        try {
          fld.setText(String(value || ""));
        } catch (err) {
          console.warn(
            `No se pudo rellenar el campo "${pdfFieldName}": `,
            err.message || err,
          );
        }
      } else {
        missing.push(pdfFieldName);
      }
    }
    if (missing.length)
      console.info(
        "Campos no encontrados en el PDF (ajustar mapping):",
        missing,
      );

    // Regenerar appearance streams usando una fuente embebida
    try {
      const helvFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      try {
        form.updateFieldAppearances(helvFont);
        console.log("updateFieldAppearances: OK");
      } catch (uErr) {
        console.warn("No se pudo actualizar apariencias de campos:", uErr);
      }
    } catch (embedErr) {
      console.warn("No se pudo embeber la fuente para apariencias:", embedErr);
    }

    // No aplanamos por defecto (evita corrupción). Use ?flatten=1 para aplanar si quieres.
    if (req.query && req.query.flatten === "1") {
      form.flatten();
    }

    // Guardar PDF en docs/altas
    const outputDir = path.resolve(__dirname, "../../docs/altas");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `ALTA_${data.CURP}.pdf`);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    const pdfBytesOutput = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytesOutput);

    // Registrar acción del usuario
    await insertOne("USER_ACTIONS", userAction);

    // Enviar el archivo al cliente
    res.setHeader(
      "Content-Disposition",
      `attachment; filename = ALTA_${data.CURP}.pdf`,
    );
    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).sendFile(outputPath);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al generar el documento PDF", error });
  }
};
//Funcion para descargar el formato de alta
employeeController.downloadAlta = async (req, res) => {
  const { curp } = req.params;

  const filePath = path.resolve(__dirname, `../../docs/altas/ALTA_${curp}.pdf`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Archivo no encontrado" });
  }

  res.setHeader("Content-Disposition", `attachment; filename = ALTA_${curp}.pdf`);
  res.setHeader("Content-Type", "application/pdf");
  res.status(200).sendFile(filePath);
};
//funcion para obtener la plantilla de un empleado pre guardada de una propuesta
employeeController.getDataTemplate = async (req, res) => {
  const data = req.body;

  const employee = await query("PLANTILLA", { NUMPLA: data.NUMPLA });
  if (!employee || employee.length === 0) {
    return res.status(404).json({ message: "Employee not found" });
  }
  const templateData = employee[0].templateData;
  if (!templateData) {
    return res.status(404).json({ message: "Template data not found" });
  }
  templateData.id_employee = employee[0]._id;
  const levels = ["LEVEL5", "LEVEL4", "LEVEL3", "LEVEL2", "LEVEL1"];
  for (const level of levels) {
    if (templateData[level]) {
      templateData.ADSCRIPCION = templateData[level];
      break;
    }
  }
  res.json(templateData);
};
//funcion para guardar un empleado en la plantilla
employeeController.saveEmployee = async (req, res) => {
  const { data } = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  const userAction = {
    username: user.username,
    module: "PSL-PRO",
    action: `SE GUARDO NUEVO EMPLEADO: "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
    timestamp: currentDateTime,
  };

  // Convertir FECHA_INGRESO a formato Date si existe
  data.FECHA_INGRESO = data.FECHA_INGRESO ? new Date(data.FECHA_INGRESO) : null;

  try {
    await updateOne(
      "PLANTILLA",
      { NUMPLA: data.NUMPLA },
      { $set: { ...data, status: 1 } },
    );
    await updateOne(
      "PLANTILLA",
      { NUMPLA: data.NUMPLA },
      { $unset: { templateData: "" } },
    );
    await updateOne(
      "HSY_LICENCIAS",
      { id_employee: new ObjectId(data.id_employee), STATUS_LICENCIA: 1 },
      {
        $set: {
          OCUPANTE: {
            APE_PAT: `${data.APE_PAT || ""} `,
            APE_MAT: `${data.APE_MAT || ""} `,
            NOMBRES: `${data.NOMBRES || ""} `,
          },
        },
      },
    );
    await insertOne("USER_ACTIONS", userAction);
    res
      .status(200)
      .json({ message: "Employee saved and templateData removed" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error saving employee", error });
  }
};
//funcion para actualizar un empleado en la plantilla
employeeController.updateEmployee = async (req, res) => {
  const io = req.app.get("io");
  const { data } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  try {
    await updateOne(
      "PLANTILLA",
      { NUMPLA: data.NUMPLA },
      { $set: { ...data } },
    );
    await updateOne(
      "PLANTILLA",
      { NUMPLA: data.NUMPLA },
      { $unset: { templateData: "" } },
    );

    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { NUMPLA: data.NUMPLA }),
      query("PLANTILLA_FORANEA", { NUMPLA: data.NUMPLA }),
    ]);

    const updatedEmployee = employeePlantilla.length
      ? employeePlantilla[0]
      : employeeForanea.length
        ? employeeForanea[0]
        : null;

    if (!updatedEmployee) {
      return res
        .status(404)
        .json({ message: "Employee not found after update" });
    }
    const userAction = {
      username: user.username,
      module: "PSL-UPDATE",
      action: `MODIFICÓ INFORMACION DEL EMPLEADO "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    await createNotification(io, {
      title: "Empleado actualizado",
      username: user.username,
      message: `MÓDIFICO LA INFORMACIÓN DEL EMPLEADO "${data.APE_PAT} ${data.APE_MAT} ${data.NOMBRES}"`,
      module: "PSL",
      rol: ["ADMINISTRADOR", "USUARIO"],
      permissions: ["PSL-EI", "*"],
    });

    res.status(200).json({
      message: "Employee updated and templateData removed",
      _id: updatedEmployee._id,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error updating employee", error });
  }
};
//funcion para crear una nueva plaza en la plantilla
employeeController.newPlaza = async (req, res) => {
  const { data } = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  const userAction = {
    username: user.username,
    module: "PSL-PRO",
    action: `PLAZA CREADA "${data.NUMPLA}"`,
    timestamp: currentDateTime,
  };

  data.NUMPLA = Number(data.NUMPLA);

  if (!data || !data.NUMPLA) {
    return res.status(400).json({ message: "NUMPLA is required" });
  }
  const existingPlaza = await query("PLAZAS", { NUMPLA: data.NUMPLA });
  if (existingPlaza.length > 0) {
    return res.status(409).json({ message: "Plaza ya existente" });
  }

  try {
    await insertOne("PLAZAS", {
      ...data,
      status: 2,
      previousOcuppants: [
        {
          NOMBRE: "PLAZA DE NUEVA CREACION",
          FECHA: null,
          FECHA_BAJA: null,
          MOTIVO_BAJA: null,
        },
      ],
    });

    const plantillaResult = await insertOne("PLANTILLA", {
      NUMPLA: data.NUMPLA,
      NOMBRES: "PLAZA DE NUEVA CREACION",
      PROYECTO: data.PROYECTO,
      ADSCRIPCION: data.ADSCRIPCION,
      TIPONOM: data.TIPONOM,
      status: 2,
    });
    const bitacoraResult = await insertOne("BITACORA", {
      plantilla_id: plantillaResult.insertedId,
      created_at: new Date(),
      personal: [
        {
          autor: "Sistema",
          comentario: "Creación de plaza",
          fecha: new Date().toLocaleString("es-MX", {
            timeZone: "America/Mexico_City",
          }),
        },
      ],
      incidencias: [],
      nomina: [],
      archivo: [],
      tramites: [],
      capacitaciones: [],
    });

    await updateOne(
      "PLANTILLA",
      { _id: plantillaResult.insertedId },
      {
        $set: {
          bitacora_id: bitacoraResult.insertedId,
          ID_CTRL_ASSIST: new ObjectId(),
          ID_CTRL_TALON: new ObjectId(),
          ID_CTRL_NOM: new ObjectId(),
          ID_CTRL_CAP: new ObjectId(),
        },
      },
    );

    await insertOne("USER_ACTIONS", userAction);
    res.status(200).json({ message: "Plaza saved" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error saving plaza", error });
  }
};
//funcion para añadira un comentario a la bitacora del empleado en la plantilla
employeeController.addCommit = async (req, res) => {
  const { data } = req.body;
  console.log(data); // Imprimir la data del request en la consola
  const updateFields = {};
  const newEntry = {
    _id: new ObjectId(),
    autor: data.AUTOR,
    comentario: data.COMENTARIO,
    fecha: new Date().toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
    }),
    id_user: data.ID_USER,
  };

  if (data.FILE) {
    try {
      const outputPath = path.join(
        __dirname,
        "../docs/commits",
        `${Date.now()}.pdf`,
      );

      // Decodificar el archivo base64
      const pdfBytes = Buffer.from(data.FILE, "base64");

      // Guardar el PDF sin comprimir
      fs.writeFileSync(outputPath, pdfBytes);

      newEntry.filePath = outputPath;
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: "Error al guardar el PDF", error });
    }
  }

  switch (data.MODULO) {
    case "PSL":
      updateFields["personal"] = newEntry;
      break;
    case "AEI":
      updateFields["incidencias"] = newEntry;
      break;
    case "SDO":
      updateFields["nomina"] = newEntry;
      break;
    case "ARD":
      updateFields["archivo"] = newEntry;
      break;
    case "TRM":
      updateFields["tramites"] = newEntry;
      break;
    case "CAP":
      updateFields["capacitaciones"] = newEntry;
      break;
    case "VA":
      updateFields["vacaciones"] = newEntry;
      break;
    case "TP":
      updateFields["talon"] = newEntry;
      break;
    default:
      return res.status(400).json({ message: "Invalid MODULO" });
  }

  try {
    await updateOne(
      "BITACORA",
      { _id: new ObjectId(data.ID_BITACORA) },
      { $push: updateFields },
    );
    res.status(200).json({ message: "Commit added successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error adding commit", error });
  }
};
employeeController.updateCommit = async (req, res) => {
  const data = req.body.data || req.body;
  const { ID_BITACORA, ID_COMENTARIO, MODULO, AUTOR, COMENTARIO, ID_USER } =
    data;
  const commitId = ID_COMENTARIO;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  let arrayField;
  switch (MODULO) {
    case "PSL":
      arrayField = "personal";
      break;
    case "AEI":
      arrayField = "incidencias";
      break;
    case "SDO":
      arrayField = "nomina";
      break;
    case "ARD":
      arrayField = "archivo";
      break;
    case "TRM":
      arrayField = "tramites";
      break;
    case "CAP":
      arrayField = "capacitaciones";
      break;
    case "VA":
      arrayField = "vacaciones";
      break;
    case "TP":
      arrayField = "talon";
      break;
    default:
      return res.status(400).json({ message: "Invalid MODULO" });
  }

  if (!commitId) {
    return res.status(400).json({ message: "id_commit is required" });
  }

  try {
    const result = await query("BITACORA", {
      _id: new ObjectId(ID_BITACORA),
      [`${arrayField}._id`]: new ObjectId(commitId),
    });

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Comentario no encontrado" });
    }

    await updateOne(
      "BITACORA",
      {
        _id: new ObjectId(ID_BITACORA),
        [`${arrayField}._id`]: new ObjectId(commitId),
      },
      {
        $set: {
          [`${arrayField}.$.autor`]: AUTOR,
          [`${arrayField}.$.comentario`]: COMENTARIO,
          [`${arrayField}.$.fecha`]: currentDateTime,
          [`${arrayField}.$.id_user`]: ID_USER,
        },
      },
    );

    res.status(200).json({ message: "Commit updated successfully" });
  } catch (error) {
    console.error("Error updating commit:", error);
    res.status(500).json({ message: "Error updating commit", error });
  }
};
employeeController.deleteCommit = async (req, res) => {
  const data = req.body.data || req.body;
  const { ID_BITACORA, ID_COMENTARIO, MODULO } = data;

  let arrayField;
  switch (MODULO) {
    case "PSL":
      arrayField = "personal";
      break;
    case "AEI":
      arrayField = "incidencias";
      break;
    case "SDO":
      arrayField = "nomina";
      break;
    case "ARD":
      arrayField = "archivo";
      break;
    case "TRM":
      arrayField = "tramites";
      break;
    case "CAP":
      arrayField = "capacitaciones";
      break;
    case "VA":
      arrayField = "vacaciones";
      break;
    case "TP":
      arrayField = "talon";
      break;
    default:
      return res.status(400).json({ message: "Invalid MODULO" });
  }

  try {
    const result = await updateOne(
      "BITACORA",
      { _id: new ObjectId(ID_BITACORA) },
      { $pull: { [arrayField]: { _id: new ObjectId(ID_COMENTARIO) } } },
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Comentario no encontrado o ya eliminado" });
    }

    res.status(200).json({ message: "Comentario eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando comentario:", error);
    res.status(500).json({ message: "Error eliminando comentario", error });
  }
};
employeeController.reinstallEmployee = async (req, res) => {
  const { data } = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  let relacionC = false;
  let relacionF = false;

  const userAction = {
    username: user.username,
    module: "PSL-REIN",
    action: `REINGRESO DE EMPLEADO: "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
    timestamp: currentDateTime,
  };
  data.status = 1;

  try {
    const fechaReinc = data.FECHA_REINCORPORACION;
    let REINC_DIA = "";
    let REINC_MES = "";
    let REINC_ANIO = "";

    if (data.TIPONOM === "M51") {
      relacionC = true;
    } else if (data.TIPONOM === "F51") {
      relacionF = true;
    }

    data.relacionC = relacionC;
    data.relacionF = relacionF;

    if (fechaReinc && /^\d{4}-\d{1,2}-\d{1,2}$/.test(fechaReinc)) {
      const [anio, mes, dia] = fechaReinc.split("-");
      const meses = [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
      ];
      REINC_DIA = dia.padStart(2, "0");
      REINC_MES = meses[Number(mes) - 1];
      REINC_ANIO = anio;
    }

    data.REINC_DIA = REINC_DIA;
    data.REINC_MES = REINC_MES;
    data.REINC_ANIO = REINC_ANIO;

    const { FECHA_REINCORPORACION, ...dataSinFechaReinc } = data;
    const dataToSave = { ...dataSinFechaReinc };
    delete dataToSave.relacionC;
    delete dataToSave.relacionF;
    delete dataToSave.REINC_DIA;
    delete dataToSave.REINC_MES;
    delete dataToSave.REINC_ANIO;
    if (dataToSave._id) delete dataToSave._id;
    if (dataToSave.id_employee) delete dataToSave.id_employee;

    const employee_old = await query("HSY_LICENCIAS", {
      id_licencia: new ObjectId(data.id_licencia),
    });
    if (!employee_old || employee_old.length === 0) {
      data.ApePatLastOcupant = "";
      data.ApeMatLastOcupant = "";
      data.NomLastOcupant = "";
    } else {
      data.ApePatLastOcupant = employee_old?.[0]?.OCUPANTE?.APE_PAT || "";
      data.ApeMatLastOcupant = employee_old?.[0]?.OCUPANTE?.APE_MAT || "";
      data.NomLastOcupant = employee_old?.[0]?.OCUPANTE?.NOMBRES || "";
    }

    const employeeLevel_old = await query("PLANTILLA", { NUMPLA: data.NUMPLA });
    if (!employeeLevel_old || employeeLevel_old.length === 0) {
      data.ClaveCatLastOcupant = "";
      data.NomCateLastOcupant = "";
    } else {
      data.ClaveCatLastOcupant = employeeLevel_old?.[0]?.CLAVECAT || "";
      data.NomCateLastOcupant = employeeLevel_old?.[0]?.NOMCATE || "";
    }

    const templatePath = path.resolve(
      __dirname,
      "../../templates/reanudacionTemplate.docx",
    );
    try {
      const content = fs.readFileSync(templatePath, "binary");
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      try {
        doc.render(data);
      } catch (renderErr) {
        return res.status(500).json({
          message: "Error al renderizar el documento",
          error: renderErr && renderErr.message ? renderErr.message : renderErr,
        });
      }

      const buf = doc.getZip().generate({ type: "nodebuffer" });
      const outputDir = path.resolve(__dirname, "../../docs/reanudaciones");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outputPath = path.join(outputDir, `BAJA_${data.CURP}.docx`);

      try {
        fs.writeFileSync(outputPath, buf);
      } catch (writeErr) {
        return res.status(500).json({
          message: "Error al escribir el documento",
          error: writeErr && writeErr.message ? writeErr.message : writeErr,
        });
      }

      res.setHeader(
        "Content-Disposition",
        `attachment; filename = ${data.CURP}.docx`,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      await updateOne(
        "PLANTILLA",
        { NUMPLA: data.NUMPLA },
        { $set: { ...dataToSave } },
      );
      await updateOne(
        "LICENCIAS",
        { _id: new ObjectId(data.id_licencia) },
        {
          $set: {
            status: 2,
            FECHA_REINCORPORACION: data.FECHA_REINCORPORACION,
          },
        },
      );
      await updateOne(
        "HSY_LICENCIAS",
        { id_licencia: new ObjectId(data.id_licencia) },
        {
          $set: {
            FECHA_REINCORPORACION: data.FECHA_REINCORPORACION,
            STATUS_LICENCIA: 2,
          },
        },
      );
      await insertOne("USER_ACTIONS", userAction);
      res.status(200).sendFile(outputPath);
    } catch (err) {
      return res.status(500).json({
        message: "Error al generar el documento",
        error: readErr && readErr.message ? readErr.message : readErr,
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error reincoorporar al empleado", error: error.message });
  }
};
module.exports = employeeController;
