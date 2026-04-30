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
const { last } = require("pdf-lib");
const moment = require('moment');
require('moment/locale/es');
moment.locale('es');

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
  const { _id } = req.params;

  try {
    const [empleadosPlantilla = [], empleadosForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(_id), status: 1 }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(_id), status: 1 }),
    ]);

    const empleados = [...empleadosPlantilla, ...empleadosForanea];

    const emp = empleados[0];

    if (emp.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    const categoria = await querysql(`SELECT * FROM categorias_catalogo WHERE CLAVE_CATEGORIA = '${emp.CLAVECAT}'`);
    const proyecto = await querysql(`SELECT * FROM proyectos WHERE proyecto = '${emp.PROYECTO}'`);

    if (categoria.length === 0 || proyecto.length === 0) {
      return res.status(422).json({
        message: "El empleado existe pero tiene información incompleta"
      });
    }

    const licenses = await query("LICENCIAS", {
      id_employee: _id,
      status: 1,
    });

    let CUBRIENDO_LICENCIA = false;

    if (licenses.length > 0) {
      CUBRIENDO_LICENCIA = true;
    } else {
      CUBRIENDO_LICENCIA = false;
    }

    const data = {
      _id: emp._id,
      CURP: emp.CURP,
      RFC: emp.RFC,
      APE_PAT: emp.APE_PAT,
      APE_MAT: emp.APE_MAT,
      NOMBRES: emp.NOMBRES,
      NUMEMP: emp.NUMEMP,
      NUMPLA: emp.NUMPLA,
      DIRECCION_COMPLETA: emp.DIRECCION ? [
        `${emp.DIRECCION.DOMICILIO} ${emp.DIRECCION.NUM_EXT}`,
        emp.DIRECCION.COLONIA,
        emp.DIRECCION.LOCALIDAD,
        emp.DIRECCION.MUNICIPIO,
        emp.DIRECCION.ESTADO,
      ].filter(Boolean).join(', ') + '.' : emp.DOMICILIO,

      CP: emp.CP,
      CLAVECAT: emp.CLAVECAT,
      CATEGORIA_DESCRIPCION: categoria[0]?.DESCRIPCION || "No encontrado",
      NIVEL: emp.NIVEL,
      PROYECTO: emp.PROYECTO,
      FECHA_NAC: emp.FECHA_NAC,
      FECHA_INGRESO: emp.FECHA_INGRESO,
      FECHA_NOMBRAMIENTO: emp.FECHA_NOMBRAMIENTO,
      UNIDAD_RESPONSABLE: proyecto ? proyecto[0].unidad_responsable : "No encontrado",
      TIPONOM: emp.TIPONOM,
      SEXO: emp.SEXO,
      FECHA_INGRESO: emp.FECHA_INGRESO,
      DIRECCION: emp.DIRECCION,
      CUBRIENDO_LICENCIA,
    }
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};

// DAR DE BAJA UN EMPLEADLO Y GENERAR DOCUMENTO DE BAJA

offEmployeeController.saveDataOff = async (req, res) => {
  const { data } = req.body;
  const user = req.user;

  const currentYear = new Date().getFullYear();
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  const lastTipoNom = data.TIPONOM;
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

    const plantilla = await query("PLANTILLA", {
      _id: new ObjectId(data.id_employee),
    });

    if (plantilla.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    let emp = plantilla[0];

    delete data._id;

    if (data.reason !== "L-PRRO") {
      const { _id, ...empData } = emp;
      Object.assign(data, empData);
    }

    if (
      data.PROCESADO === undefined ||
      data.PROCESADO === null ||
      data.PROCESADO === ""
    ) {
      data.PROCESADO = false;
    } else if (typeof data.PROCESADO === "string") {
      const valor = data.PROCESADO.trim().toLowerCase();
      data.PROCESADO = valor === "true";
    } else {
      data.PROCESADO = Boolean(data.PROCESADO);
    }

    if (!data.PROCESADO) {
      data.fechaProceso = null;
    }

    // CAMBIAR TIPONOM SEGUN LA LOGICA
    if (data.TIPONOM === "FCO") {
      // NOMBRAMIENTO CONFIANZA FORANEO cambia a CONTRATO CONFIANZA FORANEO
      data.TIPONOM = "FCT";
    } else if (data.TIPONOM === "511") {
      // NOMBRAMIENTO CONFIANZA CENTRAL cambia a CONTRATO CONFIANZA CENTRAL
      data.TIPONOM = "CCT";
    } else {
      data.TIPONOM = data.TIPONOM;
    }

    if (data.reason !== "L-PRRO") {
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
                FECHA_TERMINO: data.end_date || null,
                TIPONOM: data.TIPONOM,
                OWNER: data.OWNER ?? null,
              },
            },
          },
        );
      } else {
        res.status(404).json({ message: "Plaza no encontrada" });
        return;
      }
    }

    const employee = await query("PLANTILLA", {
      _id: new ObjectId(data.id_employee),
    });

    const employee_old = await query("PLANTILLA", {
      _id: new ObjectId(data.id_employee),
    });
    employee_old[0].TIPONOM = data.TIPONOM;
    const licenseData = {
      ...employee_old[0],
      discharge_date: data.discharge_date,
      reason: data.reason,
      end_date: data.end_date || null,
      TIPONOM: data.TIPONOM,
      id_employee: data.id_employee,
      id_licencia: data.id_licencia || null,
    };
    delete licenseData._id;

    if (data.reason === "L-SS" || data.reason === "L-IBASE") {
      try {
        licenseData.status = 1;
        const insertResult = await insertOne("LICENCIAS", licenseData);
        // adaptarse a la forma en que insertOne retorna el id
        const newLicenseId =
          insertResult.insertedId ||
          insertResult._id ||
          insertResult?.ops?.[0]?._id ||
          null;

        await insertOne("HSY_LICENCIAS", {
          discharge_date: data.discharge_date,
          reason: data.reason,
          end_date: data.end_date || null,
          TIPONOM: data.TIPONOM,
          id_employee: new ObjectId(data.id_employee),
          id_licencia: newLicenseId ? new ObjectId(newLicenseId) : null,
          NUMPLA: data.NUMPLA,
          currentDateTime,
          STATUS_LICENCIA: 1,
        });
      } catch (error) {
        console.error(
          "Error al procesar el motivo de baja por licencia",
          error,
        );
        res
          .status(500)
          .json({ message: "Error al procesar el motivo de baja" });
        return;
      }
    } else if (data.reason === "L-PRRO") {

      // Paso 1: Consultar el documento actual
      const existingLicense = await query("HSY_LICENCIAS", {
        id_licencia: new ObjectId(data.id_licencia)
      });

      if (existingLicense.length === 0) {
        return res.status(404).json({ message: "Licencia no encontrada para prórroga" });
      }

      const currentEndDate = existingLicense[0].end_date;

      // Inicio: día siguiente al end_date actual
      let prorrogStart;
      if (!currentEndDate || !moment(currentEndDate, ['DD/MM/YYYY', 'YYYY-MM-DD']).isValid()) {
        // Primera prórroga: usar discharge_date + 1 día
        prorrogStart = moment(existingLicense[0].discharge_date, ['DD/MM/YYYY', 'YYYY-MM-DD']).add(1, 'days').format('YYYY-MM-DD');
      } else {
        // Prórrogas posteriores: usar end_date + 1 día
        prorrogStart = moment(currentEndDate, ['DD/MM/YYYY', 'YYYY-MM-DD']).add(1, 'days').format('YYYY-MM-DD');
      }
      const prorrogEnd = data.new_end_date ?? null;

      // Paso 3: Preparar el update
      const updateFields = {
        $set: {
          "end_date": prorrogEnd,
        },
        $push: {
          "prorrogas": {
            inicio: prorrogStart,
            fin: prorrogEnd,
          },
        },
      };

      await updateOne(
        "HSY_LICENCIAS",
        {
          id_licencia: new ObjectId(data.id_licencia)
        },
        updateFields,
      );

      await updateOne(
        "LICENCIAS",
        {
          _id: new ObjectId(data.id_licencia)
        },
        {
          $set: {
            end_date: prorrogEnd,
          },
        },
      );

      // Consultar la plaza para obtener el array previousOcuppants
      const plaza = await query("PLAZAS", { NUMPLA: Number(data.NUMPLA) });

      if (plaza.length > 0) {
        const plazaDoc = plaza[0];
        const updateSet = {
          FECHA_TERMINO: prorrogEnd,
        };

        // Si el array previousOcuppants existe y tiene elementos, actualizar el último
        if (plazaDoc.previousOcuppants && plazaDoc.previousOcuppants.length > 0) {
          const lastIndex = plazaDoc.previousOcuppants.length - 1;
          updateSet[`previousOcuppants.${lastIndex}.FECHA_TERMINO`] = prorrogEnd;
        }

        await updateOne(
          "PLAZAS",
          {
            NUMPLA: Number(data.NUMPLA)
          },
          {
            $set: updateSet,
          },
        );
      } else {
        // Si no se encuentra la plaza, puedes manejar el error o continuar
        console.warn("Plaza no encontrada para NUMPLA:", data.NUMPLA);
      }
    }
    if (employee.length > 0 && data.reason !== "L-PRRO") {
      // Empleado dado de baja
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al guardar los datos" });
    return;
  }

  let DOMICILIO1, DOMICILIO2;

  const domicilioCompleto = data.DOMICLIO_COMPLETO || "";
  const domicilioParts = domicilioCompleto.split(",");
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

  const formattedDate = moment(data.discharge_date)
    .format('DD [DE] MMMM [DE] YYYY')
    .toUpperCase();

  if (lastTipoNom === "F51" || lastTipoNom === "M51") {
    relacionB = true;
  } else if (lastTipoNom === "FCO" || lastTipoNom === "511") {
    relacionCN = true;
  }
  if (lastTipoNom === "FCT" || lastTipoNom === "CCT") {
    relacionCC = true;
  }
  if (lastTipoNom === "F53" || lastTipoNom === "M53") {
    relacionC = true;
  }
  if (lastTipoNom === "FMM" || lastTipoNom === "MMS") {
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
    NUMEMP: data.NUMEMP ? data.NUMEMP : "",
    NUMPLA: data.NUMPLA,
    CLAVECAT: data.CLAVECAT,
    NOMCATE: data.NOMCATE,
    DOMICILIO1: DOMICILIO1,
    DOMICILIO2: DOMICILIO2,
    CP: data.DIRECCION ? data.DIRECCION.CP : data.CP,
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
    "binary",
  );
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  try {
    doc.render(templateData);
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    let outputDir;
    if (L_PRRO) {
      outputDir = path.resolve(__dirname, "../../docs/prorrogas");
    } else {
      outputDir = path.resolve(__dirname, "../../docs/bajas");
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    let nameFile;
    if (L_PRRO) {
      const fechaProroga = moment(data.new_end_date).format('YYYY-MM-DD');
      nameFile = `PRORROGA_${data.CURP}_${fechaProroga}.docx`;
    } else {
      nameFile = `BAJA_${data.CURP}.docx`;
    }
    const outputPath = path.join(outputDir, nameFile);
    fs.writeFileSync(outputPath, buf);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${data.CURP}.docx`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
      },
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
  const filePath = path.resolve(
    __dirname,
    `../../docs/bajas/BAJA_${curp}.docx`,
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=BAJA_${curp}.docx`,
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.status(200).sendFile(filePath);
};
offEmployeeController.getDataLicenses = async (req, res) => {
  const { id } = req.params;
  try {
    const licenses = await query("LICENCIAS", {
      _id: new ObjectId(id),
      status: 1,
    });

    if (licenses.length === 0) {
      return res.status(404).json({
        message: "No se encontro la licencia con este ID",
      });
    }

    const ocupante = await query("PLANTILLA", { _id: new ObjectId(licenses[0].id_employee) });

    if (ocupante.length > 0 && ocupante[0].CURP) {
      let OCUPANTE = {
        NOMBRE: `${ocupante[0]?.APE_PAT || ""} ${ocupante[0]?.APE_MAT || ""
          } ${ocupante[0]?.NOMBRES || ""}`.trim(),
      };
      res.status(409).json({ message: "La plaza cuenta con un ocupante", OCUPANTE });
    } else {
      res.status(200).json(licenses);
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar las licencias" });
  }
};
offEmployeeController.getLicenses = async (req, res) => {
  try {
    const licenses = await query("LICENCIAS", { status: 1 });
    if (!licenses || licenses.length === 0) {
      return res.status(201).json({ message: "No se encontraron licencias" });
    }

    const enhanced = await Promise.all(
      licenses.map(async (lic) => {
        try {
          let plantilla = [];
          let plantillaSource = null;
          if (lic.reason === "L-SS") {
            if (lic.id_employee) {
              plantilla = await query("PLANTILLA", { _id: new ObjectId(lic.id_employee) });
              plantillaSource = plantilla.length ? "L-SS" : null;
            }
          } else if (lic.reason === "L-IBASE") {
            if (lic.RFC) {
              plantilla = await query("PLANTILLA", { RFC: lic.RFC });
              plantillaSource = plantilla.length ? "L-IBASE-RFC" : null;
            }
            if ((!plantilla || plantilla.length === 0) && lic.id_employee) {
              plantilla = await query("PLANTILLA", { _id: new ObjectId(lic.id_employee) });
              plantillaSource = plantilla.length ? "L-IBASE-ID" : null;
            }
          }

          const OCUPANTE_ACTIVO = Boolean(plantilla?.[0]?.CURP);

          const OCUPANTE = {
            NOMBRE: `${plantilla[0]?.APE_PAT || ""} ${plantilla[0]?.APE_MAT || ""} ${plantilla[0]?.NOMBRES || ""}`.trim(),
          };

          if (OCUPANTE_ACTIVO) {
            return {
              ...lic,
              OCUPANTE,
              OCUPA_OTRO_PUESTO: lic.reason === "L-IBASE" && OCUPANTE_ACTIVO && plantillaSource === "L-IBASE-RFC" ? true : false,
            };
          } else {
            return { ...lic };
          }
        } catch (err) {
          console.error("Error consultando PLANTILLA para NUMPLA:", lic.NUMPLA, err);
          return { ...lic };
        }
      }),
    );

    return res.status(200).json(enhanced);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error al recuperar las licencias" });
  }
};
module.exports = offEmployeeController;
