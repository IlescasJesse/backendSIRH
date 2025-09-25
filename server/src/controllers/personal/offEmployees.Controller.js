const offEmployeeController = {};

const { query, updateOne } = require("../../config/mongo");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { ObjectId } = require("mongodb");

const { querysql } = require("../../config/mysql");
const { insertOne } = require("../../config/mongo");
const { off } = require("process");
offEmployeeController.getVacants = async (req, res) => {
  try {
    const vacants = await query("PLANTILLA", { status: 2 });
    res.json(vacants);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error en la consulta");
  }
};

offEmployeeController.getDatatoOff = async (req, res) => {
  const { query: searchQuery } = req.params;
  if (!/^[A-Z0-9]{18}$/.test(searchQuery)) {
    return res.status(500).json({ message: "CURP inválida" });
  }

  try {
    let empleados;
    const queryDivided = searchQuery.split(" ");

    if (searchQuery) {
      const regexQueries = [
        { CURP: { $regex: searchQuery, $options: "i" } },
        { NOMBRES: { $regex: searchQuery, $options: "i" } },
        { APE_MAT: { $regex: searchQuery, $options: "i" } },
        { APE_PAT: { $regex: searchQuery, $options: "i" } },
      ];

      if (queryDivided.length > 1) {
        regexQueries.push({
          $or: [
            {
              $and: [
                { APE_MAT: { $regex: queryDivided[0], $options: "i" } },
                { APE_PAT: { $regex: queryDivided[1], $options: "i" } },
              ],
            },
            {
              $and: [
                { APE_MAT: { $regex: queryDivided[1], $options: "i" } },
                { APE_PAT: { $regex: queryDivided[0], $options: "i" } },
              ],
            },
            {
              $and: [
                { NOMBRES: { $regex: queryDivided[0], $options: "i" } },
                { APE_PAT: { $regex: queryDivided[1], $options: "i" } },
              ],
            },
          ],
        });
      }

      empleados = await query("PLANTILLA", { $or: regexQueries });
    } else {
      empleados = await query("PLANTILLA", {});
    }
    const arrayUnires = await querysql("SELECT * FROM unidad_responsable");
    const arrayCategorias = await querysql("SELECT * FROM categorias_catalogo");
    console.log(empleados[0]);

    const formattedEmployees = empleados.map((emp) => ({
      _id: emp._id,
      CURP: emp.CURP,
      RFC: emp.RFC,
      NOMBRE: `${emp.APE_PAT} ${emp.APE_MAT} ${emp.NOMBRES}`,
      NUMEMP: emp.NUMEMP,
      NUMPLA: emp.NUMPLA,
      DOMICILIO: emp.DOMICILIO
        ? emp.DOMICILIO
        : emp.DIRECCION?.DOMICILIO ||
          `${emp.DIRECCION?.NUM_EXT || ""} ${emp.DIRECCION?.COLONIA || ""}, ${
            emp.DIRECCION?.MUNICIPIO || ""
          }, ${emp.DIRECCION?.ESTADO || ""}`,

      CP: emp.CP,
      CLAVECAT: emp.CLAVECAT,
      CATEGORIA_DESCRIPCION:
        arrayCategorias.find((cat) => cat.CLAVE_CATEGORIA === emp.CLAVECAT)
          ?.DESCRIPCION || "No encontrado",
      PROYECTO: emp.PROYECTO,
      UNIDAD_RESPONSABLE:
        arrayUnires.find((uni) => uni.PROYECTO === emp.PROYECTO)
          ?.UNIDAD_RESPONSABLE || "No encontrado",
      TIPONOM: emp.TIPONOM,
      SEXO: emp.SEXO,
      FECHA_INGRESO: emp.FECHA_INGRESO,
      DIRECCION: emp.DIRECCION,
    }));

    res.json(formattedEmployees);
    console.log(empleados[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};

// DAR DE BAJA UN EMPLEADLO Y GENERAR DOCUMENTO DE BAJA

offEmployeeController.saveDataOff = async (req, res) => {
  const { data } = req.body;
  console.log(data);
  const user = req.user;
  const currentYear = new Date().getFullYear();
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  let relacionB = false;
  let relacionCN = false;
  let relacionCC = false;
  let relacionC = false;
  let relacionMM = false;
  let R_DEF = false;
  let R_OCA = false;
  let R_JUB = false;
  let R_PEN = false;
  let L_IBASE = false;
  let L_SS = false;
  let L_PRRO = false;
  let RR = false;
  let DEF = false;
  try {
    delete data._id;

    await insertOne(`BAJAS`, data);
    const plaza = await query(`PLAZAS`, { NUMPLA: data.NUMPLA });
    if (plaza.length > 0) {
      await updateOne(
        `PLAZAS`,
        { NUMPLA: data.NUMPLA },
        {
          $push: {
            previousOcuppants: {
              NOMBRE: data.NOMBRE,
              FECHA: data.discharge_date,
              FECHA_BAJA: data.discharge_date,
              MOTIVO_BAJA: data.reason,
              TIPONOM:
                data.TIPONOM === "511"
                  ? "CCT"
                  : data.TIPONOM === "FCO"
                  ? "FCT"
                  : null,
            },
          },
        }
      );
      await updateOne(
        `PLAZAS`,
        { NUMPLA: data.NUMPLA },
        { $set: { status: 2 } }
      );
    } else {
      res.status(404).json({ message: "Plaza no encontrada" });
      return;
    }
    const employee = await query("PLANTILLA", {
      _id: new ObjectId(data.id_employee),
    });
    let TIPONOM_NVO = null;
    if (data.TIPONOM === "511") {
      TIPONOM_NVO = "CCT";
    } else if (data.TIPONOM === "FCO") {
      TIPONOM_NVO = "FCT";
    }

    const employee_old = await query("PLANTILLA", {
      _id: new ObjectId(data.id_employee),
    });
    employee_old[0].TIPONOM = TIPONOM_NVO;
    const licenseData = {
      ...employee_old[0],
      time: data.time || null,
      discharge_date: data.discharge_date,
      reason: data.reason,
      TIPONOM: data.TIPONOM,
      id_employee: data.id_employee,
      id_licencia: data.id_licencia || null,
    };
    console.log(licenseData);
    delete licenseData._id;

    if (data.reason === "L-SS" || data.reason === "L-IBASE") {
      try {
        licenseData.status = 1;
        await insertOne("LICENCIAS", licenseData);
        await insertOne("HSY_LICENCIAS", {
          ...licenseData,
          currentDateTime,
          id_employee: new ObjectId(data.id_employee),
        });
      } catch (error) {
        console.error(
          "Error al procesar el motivo de baja por licencia",
          error
        );
        res
          .status(500)
          .json({ message: "Error al procesar el motivo de baja" });
        return;
      }
    } else if (data.reason === "L-PRRO") {
      await updateOne(
        "LICENCIAS",
        { _id: new ObjectId(data.id_licencia) },
        { $set: { time: data.time } }
      );
    }
    if (employee.length > 0 && data.reason !== "L-PRRO") {
      await updateOne(
        "PLANTILLA",
        { _id: new ObjectId(data.id_employee) },
        {
          $set: {
            CONSEC: null,
            CLAVE: null,
            CURP: null,
            RFC: null,
            AFILIACI: null,
            NUMEMP: null,
            SUELDO_GRV: 0,
            NUMQUIN: 0,
            GUARDE: 0,
            GASCOM: 0,
            FECHA_INGRESO: null,
            SANGRE: null,
            AVISAR: null,
            TEL_EMERGENCIA1: null,
            TEL_EMERGENCIA2: null,
            NUMTARJETA: null,
            TURNOMAT: null,
            TURNOVES: null,
            SABADO: null,
            SEXO: null,
            FECHA_NAC: null,
            LUGARNAC: null,
            CP: null,
            TEL_PERSONAL: null,
            ALERGIA: null,
            TIPOPAG: null,
            BANCO: null,
            CUENTA: null,
            NOMINA: null,
            EMAIL: null,
            DOMICILIO: null,
            PROFES: null,
            APE_PAT: null,
            APE_MAT: "VACANTE",
            NOMBRES: null,
            status: 2,
          },
        }
      );
      console.log("Empleado dado de baja");
    } else {
      console.log(`Empleado con ID ${data._id} no fue encontrado`);
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al guardar los datos" });
    return;
  }

  let DOMICILIO1, DOMICILIO2;
  const domicilioParts = data.DOMICILIO.split(",");
  if (domicilioParts[0].split(" ").length < 3) {
    DOMICILIO1 = domicilioParts.slice(0, 2).join(",");
    DOMICILIO2 = domicilioParts.slice(2).join(",");
  } else {
    DOMICILIO1 = domicilioParts[0];
    DOMICILIO2 = domicilioParts.slice(1).join(",");
  }

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
  const date = new Date(data.discharge_date);
  const formattedDate = `${date.getDate() + 1} DE ${
    months[date.getMonth()]
  } DE ${date.getFullYear()}`;

  if (data.TIPONOM === "F51" || data.TIPONOM === "M51") {
    relacionB = true;
  } else if (data.TIPONOM === "FCO" || data.TIPONOM === "511") {
    relacionCN = true;
  }
  if (data.TIPONOM === "FCT" || data.TIPONOM === "CCT") {
    relacionCC = true;
  }
  if (data.TIPONOM === "F53" || data.TIPONOM === "M53") {
    relacionC = true;
  }
  if (data.TIPONOM === "FMM" || data.TIPONOM === "MMS") {
    relacionMM = true;
  }
  if (data.reason === "R-DEF") {
    R_DEF = true;
  } else if (data.reason === "R-OCA") {
    R_OCA = true;
  } else if (data.reason === "R-JUB") {
    R_JUB = true;
  } else if (data.reason === "R-PEN") {
    R_PEN = true;
  } else if (data.reason === "L-IBASE") {
    L_IBASE = true;
  } else if (data.reason === "L-SS") {
    L_SS = true;
  } else if (data.reason === "L-PRRO") {
    L_PRRO = true;
  } else if (data.reason === "RR") {
    RR = true;
  } else if (data.reason === "DEF") {
    DEF = true;
  }

  const templateData = {
    CURP: data.CURP,
    RFC: data.RFC,
    NOMBRE: data.NOMBRE,
    NUMEMP: data.NUMEMP,
    NUMPLA: data.NUMPLA,
    CLAVECAT: data.CLAVECAT,
    NOMCATE: data.NOMCATE,
    DOMICILIO1: DOMICILIO1,
    DOMICILIO2: DOMICILIO2,
    CP: data.CP,
    FECHA: formattedDate,
    UNIRES: data.UNIDAD_RESPONSABLE,
    NOMCATE: data.CATEGORIA_DESCRIPCION,
    PROYECTO: data.PROYECTO,
    REL_B: relacionB,
    REL_CN: relacionCN,
    REL_CC: relacionCC,
    REL_C: relacionC,
    REL_MM: relacionMM,
    R_DEF: R_DEF,
    R_OCA: R_OCA,
    R_JUB: R_JUB,
    R_PEN: R_PEN,
    L_IBASE: L_IBASE,
    L_SS: L_SS,
    L_PRRO: L_PRRO,
    RR: RR,
    DEF: DEF,
  };
  const userAction = {
    username: user.username,
    module: "PSL-BE",
    action: `REALIZÓ LA BAJA DE : "${data.NOMBRE}"`,
    timestamp: currentDateTime,
  };

  const content = fs.readFileSync(
    path.resolve(__dirname, "../../templates/bajaTemplate.docx"),
    "binary"
  );
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  try {
    doc.render(templateData);
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const outputDir = path.resolve(__dirname, "../docs/bajas");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, `BAJA_${data.CURP}.docx`);
    fs.writeFileSync(outputPath, buf);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${data.CURP}.docx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    await insertOne("USER_ACTIONS", userAction);
    await updateOne(
      "BITACORA",
      { id_plantilla: data._id },
      {
        $set: {
          personal: [],
          incidencias: [],
          nomina: [],
          archivo: [],
          tramites: [],
          capacitaciones: [],
        },
      }
    );
    res.status(200).sendFile(outputPath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el documento" });
    return;
  }
};
//Funcino para obtener las bajas recientes
offEmployeeController.getRecentCasualties = async (req, res) => {
  const currentYear = new Date().getFullYear();
  try {
    const casualties = await query(`BAJAS`, {});
    res.json(casualties);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar las bajas" });
  }
};
//Funcion para descargar el documento de baja
offEmployeeController.downloadBaja = async (req, res) => {
  const { curp } = req.params;
  const filePath = path.resolve(__dirname, `../docs/bajas/BAJA_${curp}.docx`);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=BAJA_${curp}.docx`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.status(200).sendFile(filePath);
};

offEmployeeController.getDataLicenses = async (req, res) => {
  const NUMPLA = parseInt(req.params.numpla, 10);
  if (!NUMPLA || isNaN(NUMPLA)) {
    return res.status(400).json({ message: "Número de plaza inválido" });
  }

  console.log(`Buscando licencias para la plaza: ${NUMPLA}`);
  try {
    const licenses = await query("LICENCIAS", { NUMPLA: NUMPLA });

    if (licenses.length > 0) {
      res.status(200).json(licenses);
    } else {
      res.status(201).json({
        message: "No se encontraron licencias con este número de plaza",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar las licencias" });
  }
};
offEmployeeController.getLicenses = async (req, res) => {
  try {
    const licenses = await query("LICENCIAS", { status: 1 });
    if (licenses.length > 0) {
      res.status(200).json(licenses);
    } else {
      res.status(201).json({ message: "No se encontraron licencias" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar las licencias" });
  }
};
// offEmployeeController.updateLicense = async (req, res) => {
//   const { id } = req.params;
//   const { data } = req.body;

//   if (!id || !data) {
//     return res.status(400).json({ message: "ID o datos inválidos" });
//   }

//   try {
//     const result = await updateOne(
//       "LICENCIAS",
//       { _id: new ObjectId(id) },
//       data
//     );
//     if (result.modifiedCount > 0) {
//       res.status(200).json({ message: "Licencia actualizada correctamente" });
//     } else {
//       res.status(404).json({ message: "Licencia no encontrada" });
//     }
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error al actualizar la licencia" });
//   }
// };
module.exports = offEmployeeController;
