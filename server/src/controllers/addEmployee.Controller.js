const { query, updateOne } = require("../config/mongo");
const { querysql } = require("../config/mysql");
const getAdscripciones = require("../libs/adscriptions");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

employeeController = {};

// Función para obtener posiciones vacantes y sus ocupantes anteriores
employeeController.getVacants = async (req, res) => {
  try {
    const vacants = await query("PLANTILLA_2025", { status: { $in: [2, 3] } });
    const previousOcupant = await query("PLAZAS_2025", {
      status: { $in: [2, 3] },
    });

    vacants.forEach((vacant) => {
      const matchingPreviousOcupant = previousOcupant.find(
        (po) => po.NUMPLA === vacant.NUMPLA
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
      "SELECT d_codigo, d_asenta, d_tipo_asenta, D_mnpio, d_estado, d_ciudad FROM CP_2025 WHERE d_codigo = ?",
      [zipCode]
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
    const unity_ejecutor = await querysql("SELECT * FROM unidad_responsable");
    const categorias = await querysql("SELECT * FROM categorias_catalogo");

    const level2 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM adsc_level2"
    );
    const level3 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM adsc_level3"
    );
    const level4 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM adsc_level4 "
    );
    const level5 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM adsc_level5"
    );

    const departamentos = level3
      .filter((item) => item.NIVEL === 5)
      .concat(level4.filter((item) => item.NIVEL === 5))
      .concat(level5.filter((item) => item.NIVEL === 5));

    const unidades = level4
      .filter((item) => item.NIVEL === 4)
      .concat(level3.filter((item) => item.NIVEL === 4));

    const direcciones = level3
      .filter((item) => item.NIVEL === 3)
      .concat(level2.filter((item) => item.NIVEL === 3));

    const subsecretarias = level2.filter((item) => item.NIVEL === 2);

    const adscripciones = [
      subsecretarias,
      direcciones,
      unidades,
      departamentos,
    ];

    const unidad_ejecutora = Object.values(
      unity_ejecutor.reduce((acc, item) => {
        const { UNIDAD_EJECUTORA, UNIDAD_RESPONSABLE, ...rest } = item;
        if (!acc[UNIDAD_EJECUTORA]) {
          acc[UNIDAD_EJECUTORA] = {
            UNIDAD_EJECUTORA,
            UNIDADES_RESPONSABLES: [],
          };
        }
        acc[UNIDAD_EJECUTORA].UNIDADES_RESPONSABLES.push({
          UNIDAD_RESPONSABLE,
          ...rest,
        });
        return acc;
      }, {})
    );
    const internalInformation = { unidad_ejecutora, categorias, adscripciones };

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
    const dataPlaza = await query("PLAZAS_2025", { NUMPLA, status: 2 });
    if (!dataPlaza || dataPlaza.length === 0) {
      return res.status(404).json({ message: "plaza vacante no encontrada" });
    }
    res.status(200).json(dataPlaza);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para guardar un empleado
employeeController.makeProposal = async (req, res) => {
  const { data } = req.body;
  const today = new Date();
  const options = {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  };
  const [dayToday, monthToday, yeartoday] = new Intl.DateTimeFormat(
    "es-MX",
    options
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
  const monthName = months[parseInt(monthToday, 10) - 1];
  const ID_PLAZA = data.ID_PLAZA ? data.ID_PLAZA : "";
  const monthNameCapitalized =
    monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
  const FECHA_HOY = `Oaxaca de Juárez, Oax. ${dayToday} de ${monthNameCapitalized} de ${yeartoday}`;
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
  const C_TRABAJO = data.PROYECTO.slice(-2);
  const OBRA_ACT = data.OBRA_ACT ? data.OBRA_ACT : "";
  const CLAVECAT = data.CLAVECAT ? data.CLAVECAT : "";
  const NOMCATE = data.NOMCATE ? data.NOMCATE : "";
  const FECHA_INGRESO = data.FECHA_INGRESO ? data.FECHA_INGRESO : "";
  const AFILIACI = data.AFILIACI ? data.AFILIACI : "";
  const CP = data.CP ? data.CP : "";
  const ESTADO = data.ESTADO ? data.ESTADO : "";
  const MUNICIPIO = data.MUNICIPIO ? data.MUNICIPIO : "";
  const COLONIA = data.COLONIA ? data.COLONIA : "";
  const DOMICILIO = data.DOMICILIO ? data.DOMICILIO : "";

  const [year, month, day] = FECHA_INGRESO.split("-");
  const FECHA_FORMATTED = `${day} DE ${
    months[parseInt(month, 10) - 1]
  } DE ${year}`;
  console.log(data);
  let templateData = {};
  let LEVEL1 = "";
  let LEVEL2 = "";
  let LEVEL3 = "";
  let LEVEL4 = "";
  let LEVEL5 = "";

  if (data.ADSCRIPCION) {
    try {
      const adscripciones = await getAdscripciones(data.ADSCRIPCION);

      LEVEL1 = adscripciones[0].level1;
      LEVEL2 = adscripciones[0].level2 || "";
      LEVEL3 = adscripciones[0].level3 || "";
      LEVEL4 = adscripciones[0].level4 || "";
      LEVEL5 = adscripciones[0].level5 || "";
    } catch (error) {
      console.error("Error obteniendo adscripciones:", error);
      return res
        .status(500)
        .json({ message: "Error obteniendo adscripciones", error });
    }
  } else {
    console.log("No hay departamento");
  }
  const LUGARNAC = data.LUGARNAC ? data.LUGARNAC : "";
  const fecha_nacimiento = new Date(data.FECHA_NAC);
  const NAC_DAY = fecha_nacimiento.getDate();
  const NAC_MONTH = fecha_nacimiento.getMonth() + 1; // Months are zero-based
  const NAC_YEAR = fecha_nacimiento.getFullYear();
  const DIRECCION_COMPLETA = data.DIRECCION_COMPLETA
    ? data.DIRECCION_COMPLETA
    : "";
  const NOMBRE_PAPA = data.NOMBRE_PAPA ? data.NOMBRE_PAPA : "";
  const APEPAT_PAPA = data.APEPAT_PAPA ? data.APEPAT_PAPA : "";
  const APEMAT_PAPA = data.APEMAT_PAPA ? data.APEMAT_PAPA : "";
  const NOMBRE_MAMA = data.NOMBRE_MAMA ? data.NOMBRE_MAMA : "";
  const APEPAT_MAMA = data.APEPAT_MAMA ? data.APEPAT_MAMA : "";
  const APEMAT_MAMA = data.APEMAT_MAMA ? data.APEMAT_MAMA : "";
  const UNI_RESPO = data.UNI_RESPO ? data.UNI_RESPO : "";
  const NUM_UNI_MED_FAM = data.NUM_UNI_MED_FAM ? data.NUM_UNI_MED_FAM : "";
  const FECHA_INGRESO_IMSS = data.FECHA_INGRESO_IMSS
    ? data.FECHA_INGRESO_IMSS
    : "";
  const [yearIMSS, monthIMSS, dayIMSS] = FECHA_INGRESO_IMSS.split("-");
  const FECHA_IMSS_FORMATTED = `${dayIMSS} DE ${
    months[parseInt(monthIMSS, 10) - 1]
  } DE ${yearIMSS}`;
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
  };

  const content = fs.readFileSync(
    path.resolve(__dirname, "../templates/altaTemplate.docx"),
    "binary"
  );
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  try {
    const updatePlantillaResult = await updateOne(
      "PLANTILLA_2025",
      { NUMPLA: data.NUMPLA },
      { $set: { status: 3, templateData } }
    );
    if (updatePlantillaResult.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "No matching document found in PLANTILLA_2025" });
    }

    const updatePlazasResult = await updateOne(
      "PLAZAS_2025",
      { NUMPLA: data.NUMPLA },
      { $set: { status: 3 } }
    );
    if (updatePlazasResult.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "No matching document found in PLAZAS_2025" });
    }
    doc.render(templateData);
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const outputPath = path.resolve(
      __dirname,
      `../docs/altas/ALTA_${data.CURP}.docx`
    );
    fs.writeFileSync(outputPath, buf);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=ALTA_${data.CURP}.docx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.status(200).sendFile(outputPath);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al generar el documento" });
  }

  res.status(200).json({ message: "Employee saved" });
};
employeeController.downloadAlta = async (req, res) => {
  const { curp } = req.params;

  const filePath = path.resolve(__dirname, `../docs/altas/ALTA_${curp}.docx`);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=ALTA_${curp}.docx`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.status(200).sendFile(filePath);
};
employeeController.getDataTemplate = async (req, res) => {
  const data = req.body;
  console.log(data.NUMPLA);
  const employee = await query("PLANTILLA_2025", { NUMPLA: data.NUMPLA });
  if (!employee || employee.length === 0) {
    return res.status(404).json({ message: "Employee not found" });
  }
  const templateData = employee[0].templateData;
  res.json(templateData);
};

employeeController.saveEmployee = async (req, res) => {
  const { data } = req.body;
  console.log(data);

  try {
    await updateOne(
      "PLANTILLA_2025",
      { NUMPLA: data.NUMPLA },
      { $set: { ...data, status: 1 } }
    );
    await updateOne(
      "PLANTILLA_2025",
      { NUMPLA: data.NUMPLA },
      { $unset: { templateData: "" } }
    );
    res
      .status(200)
      .json({ message: "Employee saved and templateData removed" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error saving employee", error });
  }
};
employeeController.updateEmployee = async (req, res) => {
  const { data } = req.body;
  console.log(data);

  try {
    await updateOne(
      "PLANTILLA_2025",
      { NUMPLA: data.NUMPLA },
      { $set: { ...data } }
    );
    await updateOne(
      "PLANTILLA_2025",
      { NUMPLA: data.NUMPLA },
      { $unset: { templateData: "" } }
    );
    res
      .status(200)
      .json({ message: "Employee saved and templateData removed" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error saving employee", error });
  }
};

module.exports = employeeController;
