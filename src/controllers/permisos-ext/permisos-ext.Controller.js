const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fontPath = path.join(__dirname, "../../assets/fonts/Consolas.ttf");
const fontPathArial = path.join(__dirname, "../../assets/fonts/arial.ttf");
const fontPathArialBlack = path.join(
  __dirname,
  "../../assets/fonts/ARIALBD 1.TTF",
);

const permisosExtController = {};

// Obtener perfil del empleado
permisosExtController.getProfile = async (req, res) => {
  const id = req.params.id;
  const user = req.user;
  const currentYear = moment().year();

  try {
    const hsy_proyectos = await query("HSY_PROYECTOS", {
      id_employee: new ObjectId(id),
    });
    const hsy_licencias = await query("HSY_LICENCIAS", {
      id_employee: new ObjectId(id),
    });
    const hsy_recategorizaciones = await query("HSY_RECATEGORIZACIONES", {
      id_employee: new ObjectId(id),
    });
    const hsy_status = await query("HSY_STATUS_EMPLEADO", {
      id_employee: new ObjectId(id),
    });

    historial = {
      hsy_licencias,
      hsy_proyectos,
      hsy_recategorizaciones,
      hsy_status,
    };

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

    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
      AÑO: currentYear,
    });
    const permisosExt = await query("PERMISOS_EXT", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const justificantes = await query("JUSTIFICACIONES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const incapacidades = await query("INCAPACIDADES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const comisiones = await query("COMISIONES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });


    emp.historial = historial;

    const ASIST_PROFILE = {
      employee: [emp],
      permisos: permits,
      justificantes: justificantes,
      incapacidades: incapacidades,
      permisosExt: permisosExt,
      comisiones: comisiones,
    };
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: user.username,
      module: "AEI-PI",
      action: `CONSULTÓ EL PERFIL DE INCIDENCIAS DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

permisosExtController.newExtPermit = async (req, res) => {
  const user = req.user;

  const {
    _id,
    TIPO,
    DESDE,
    HASTA,
    NUM_DIAS,
    OFICIO_SOLICITUD,
    OFICIO_AUTORIZACION,
    OBSERVACIONES,
    ID_CTRL_ASIST,
    NUMTARJETA,
  } = req.body;
  // Crear el nuevo registro de permiso extraordinario
  const extPermitData = {
    id_empoyee: _id,
    TIPO,
    DESDE,
    HASTA,
    NUM_DIAS,
    OFICIO_SOLICITUD,
    OFICIO_AUTORIZACION,
    OBSERVACIONES,
    ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
    AÑO: moment(DESDE).year(),
  };
  const userAction = {
    username: user.username,
    module: "AEI-PEXT",
    action: `CREÓ UN NUEVO PERMISO EXTRAORDINARIO DEL EMPLEADO CON TARJETA "${NUMTARJETA}"`,
    timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
  };
  try {
    await insertOne("PERMISOS_EXT", extPermitData);
    res
      .status(200)
      .send({ message: "External permit created", data: extPermitData });
  } catch (error) {
    console.error("Error creating external permit:", error);
    res
      .status(500)
      .send({ error: "An error occurred while creating the external permit" });
  }
};

permisosExtController.updateExtPermit = async (req, res) => {
  const { _id, ...updateData } = req.body;

  try {
    const result = await query("PERMISOS_EXT", {
      _id: new ObjectId(_id),
    });

    if (!result || result.length === 0) {
      return res.status(404).send({ error: "External permit not found" });
    }

    await updateOne(
      "PERMISOS_EXT",
      { _id: new ObjectId(_id) },
      { $set: updateData },
    );
    res
      .status(200)
      .send({ message: "External permit updated successfully", data: result });
  } catch (error) {
    console.error("Error updating external permit:", error);
    const employee = result[0];
    res.status(500).send({
      error: "An error occurred while updating the external permit",
      _id: employee.id_empoyee,
    });
  }
};

permisosExtController.deleteExtPermit = async (req, res) => {
  const { id } = req.params;

  try {
    const permitData = await query("PERMISOS_EXT", {
      _id: new ObjectId(id),
    });
    const result = await deleteOne("PERMISOS_EXT", { _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "External permit not found" });
    }
    res
      .status(200)
      .send({ message: "External permit deleted", data: permitData[0] });
  } catch (error) {
    console.error("Error deleting external permit:", error);
    res.status(500).send({
      error: "An error occurred while deleting the external permit",
      data,
    });
  }
};

// Generar reporte de permisos extraordinarios
permisosExtController.printReport = async (req, res) => {
  const { _id } = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const employeeIdObj = new ObjectId(_id);

  const permisosExt = await query("PERMISOS_EXT", {
    $or: [
      { id_empoyee: employeeIdObj },
      { id_employee: employeeIdObj },
      { id_empoyee: _id },
      { id_employee: _id },
    ],
  });

  const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
    query("PLANTILLA", { _id: new ObjectId(_id) }),
    query("PLANTILLA_FORANEA", { _id: new ObjectId(_id) }),
  ]);

  const employee = employeePlantilla.length
    ? employeePlantilla
    : employeeForanea.length
      ? employeeForanea
      : [];

  if (!employee || employee.length === 0) {
    res.status(404).send({ error: "Empleado no encontrado" });
    return;
  }

  const totalDaysLENP = permisosExt
    .filter((p) => p.TIPO === "LENP") // usa "LEND" si ese es el valor real
    .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

  const totalDaysCUFA = permisosExt
    .filter((p) => p.TIPO === "CUFA")
    .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

  const totalDaysCUMA = permisosExt
    .filter((p) => p.TIPO === "CUMA")
    .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

  const totalDaysPATE = permisosExt
    .filter((p) => p.TIPO === "PATE")
    .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

  const totalDaysFAFA = permisosExt
    .filter((p) => p.TIPO === "FAFA")
    .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

  const emp = employee[0];

  const tipoMapping = {
    LENP: "LICENCIA POR ENFERMEDAD NO PROFESIONAL",
    CUFA: "CUIDADOS DE UN FAMILIAR",
    CUMA: "CUIDADOS MATERNOS",
    PATE: "PATERNIDAD",
    FAFA: "FALLECIMIENTO DE UN FAMILIAR",
  };

  const tipoNomMapping = {
    M51: "BASE FORÁNEA",
    F51: "BASE CENTRAL",
    FCT: "CONTRATO CONFIANZA FORANEO",
    CCT: "CONTRATO CONFIANZA CENTRAL",
    FCO: "NOMBRAMIENTO CONFIANZA FORANEO",
    511: "NOMBRAMIENTO CONFIANZA CENTRAL",
    F53: "CONTRATO FORÁNEO",
    M53: "CONTRATO CENTRAL",
    MMS: "MANDOS MEDIOS FORÁNEOS",
    FMM: "MANDOS MEDIOS CENTRAL",
  };

  // Mapear datos de permisos para la tabla
  const permisosData = permisosExt.map((empRow, i) => ({
    I: i + 1,
    T: tipoMapping[empRow.TIPO] ?? empRow.TIPO,
    D: empRow.DESDE || "",
    H: empRow.HASTA || "",
    N: empRow.NUM_DIAS || "",
    O: empRow.OFICIO_SOLICITUD || "",
    A: empRow.OFICIO_AUTORIZACION || "",
    B: empRow.OBSERVACIONES || "",
  }));

  const templateData = {
    NOMBRE_COMPLETO:
      `${emp.APE_PAT || ""} ${emp.APE_MAT || ""} ${emp.NOMBRES || ""}`.trim(),
    CURP: emp.CURP || "",
    RFC: emp.RFC || "",
    SEX: emp.SEXO || "",
    PHONE: emp.TEL_PERSONAL || "",
    NUMPLA: emp.NUMPLA || "",
    TJT: emp.NUMTARJETA || "",
    TIPONOM: tipoNomMapping[emp.TIPONOM] || emp.TIPONOM || "",
    ADSCRIPCION: emp.ADSCRIPCION || "",
    H: permisosData, // Array de permisos para la tabla
    D_LE: totalDaysLENP, // total de días LENP del empleado
    D_CF: totalDaysCUFA,
    D_M: totalDaysCUMA,
    D_P: totalDaysPATE,
    D_FF: totalDaysFAFA,
    D_TOTAL:
      totalDaysLENP +
      totalDaysCUFA +
      totalDaysCUMA +
      totalDaysPATE +
      totalDaysFAFA,
  };

  console.log(templateData);

  const userAction = {
    username: user.username,
    module: "PSL-BE",
    action: `GENERO EL REPORTE DE PERMISOS EXTRAORDINARIOS DE: "${templateData.NOMBRE_COMPLETO}"`,
    timestamp: currentDateTime,
  };

  const content = fs.readFileSync(
    path.resolve(__dirname, "../../templates/permisosExtTemplate.docx"),
    "binary",
  );
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  try {
    doc.render(templateData);
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const outputDir = path.resolve(__dirname, "../../docs/permisosExt");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(
      outputDir,
      `PERMISOS_EXT_${templateData.CURP}.docx`,
    );
    fs.writeFileSync(outputPath, buf);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=PERMISOS_EXT_${templateData.CURP}.docx`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).sendFile(outputPath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el documento" });
  }
};
module.exports = permisosExtController;
