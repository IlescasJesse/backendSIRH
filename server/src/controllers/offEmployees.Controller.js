const offEmployeeController = {};

const { query, updateOne } = require("../config/mongo");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const { querysql } = require("../config/mysql");
const { insertOne } = require("../config/mongo");
offEmployeeController.getVacants = async (req, res) => {
  try {
    const vacants = await query("PLANTILLA_2025", { status: 2 });
    res.json(vacants);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error en la consulta");
  }
};

offEmployeeController.getDatatoOff = async (req, res) => {
  const { query: searchQuery } = req.params;
  console.log(searchQuery);
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

      empleados = await query("PLANTILLA_2025", { $or: regexQueries });
    } else {
      empleados = await query("PLANTILLA_2025", {});
    }
    const arrayUnires = await querysql("SELECT * FROM unidad_responsable");
    const arrayCategorias = await querysql("SELECT * FROM categorias_catalogo");

    const formattedEmployees = empleados.map((emp) => ({
      _id: emp._id,
      CURP: emp.CURP,
      RFC: emp.RFC,
      NOMBRE: `${emp.APE_PAT} ${emp.APE_MAT} ${emp.NOMBRES}`,
      NUMEMP: emp.NUMEMP,
      NUMPLA: emp.NUMPLA,
      DOMICILIO: emp.DOMICILIO,
      CP: emp.CP,
      CLAVECAT: emp.CLAVECAT,
      CATEGORIA_DESCRIPCION:
        arrayCategorias.find((cat) => cat.CLAVE_CATEGORIA === emp.CLAVECAT)
          ?.DESCRIPCION || "No encontrado",
      PROYECTO: emp.PROYECTO,
      UNIDAD_RESPONSABLE:
        arrayUnires.find((uni) => uni.PROYECTO === emp.PROYECTO)
          ?.UNIDAD_RESPONSABLE || "No encontrado",
      REL_LAB: emp.TIPONOM,
    }));

    res.json(formattedEmployees);
    console.log(formattedEmployees);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};

// DAR DE BAJA UN EMPLEADLO Y GENERAR DOCUMENTO DE BAJA

offEmployeeController.saveDataOff = async (req, res) => {
  const { data } = req.body;
  const currentYear = new Date().getFullYear();
  console.log(data);

  try {
    const { _id, ...dataWithoutId } = data;
    await insertOne(`BAJAS_${currentYear}`, dataWithoutId);
    const plaza = await query(`PLAZAS_${currentYear}`, { NUMPLA: data.NUMPLA });
    if (plaza.length > 0) {
      await updateOne(
        `PLAZAS_${currentYear}`,
        { NUMPLA: data.NUMPLA },
        {
          $push: {
            previousOcuppants: {
              NOMBRE: data.NOMBRE,
              FECHA: data.discharge_date,
              FECHA_BAJA: data.discharge_date,
              MOTIVO_BAJA: data.reason,
            },
          },
        }
      );
      await updateOne(
        `PLAZAS_${currentYear}`,
        { NUMPLA: data.NUMPLA },
        { $set: { status: 2 } }
      );
    } else {
      res.status(404).json({ message: "Plaza no encontrada" });
      return;
    }
    const { ObjectId } = require("mongodb");
    const employee = await query("PLANTILLA_2025", {
      _id: new ObjectId(data._id),
    });
    if (employee.length > 0) {
      await updateOne(
        "PLANTILLA_2025",
        { _id: new ObjectId(data._id) },
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
  let L_PRROR = false;
  let RR = false;
  let DEF = false;

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

  if (data.REL_LAB === "B") {
    relacionB = true;
  } else if (data.REL_LAB === "CN") {
    relacionCN = true;
  }
  if (data.REL_LAB === "CC") {
    relacionCC = true;
  }
  if (data.REL_LAB === "C") {
    relacionC = true;
  }
  if (data.REL_LAB === "MM") {
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
  } else if (data.reason === "L-PRROR") {
    L_PRROR = true;
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
    L_PRROR: L_PRROR,
    RR: RR,
    DEF: DEF,
  };

  const content = fs.readFileSync(
    path.resolve(__dirname, "../templates/bajaTemplate.docx"),
    "binary"
  );
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  try {
    doc.render(templateData);
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const outputPath = path.resolve(
      __dirname,
      `../docs/bajas/BAJA_${data.CURP}.docx`
    );
    fs.writeFileSync(outputPath, buf);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${data.CURP}.docx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
    const casualties = await query(`BAJAS_${currentYear}`, {});
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

module.exports = offEmployeeController;
