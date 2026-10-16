const { query, insertOne } = require("../../config/mongo");
const { querysql } = require("../../config/mysql");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const moment = require("moment");
const getCustomQuarter = (date) => {
  const month = moment(date, "YYYY-MM-DD").month() + 1;
  if (month >= 1 && month <= 4) return 1;
  if (month >= 5 && month <= 8) return 2;
  return 3;
};
const employeeController = {};

// Importamos el modelo de Employee

const { ObjectId } = require("mongodb");
const { updateOne } = require("../../config/mongo");

// Función para obtener todos los empleados. La consume SIAST (cuenta de servicio
// con permiso SVC-SIAST) para sincronizar su catálogo de empleados.
employeeController.getEmployees = async (req, res) => {
  try {
    const employees = await query("PLANTILLA", {});
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};
let historial;

employeeController.getProfileData = async (req, res) => {
  const { id } = req.params;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  try {
    const hsy_areas = await query("HSY_AREAS", {
      id_employee: new ObjectId(id),
    });
    const hsy_proyectos = await query("HSY_PROYECTOS", {
      id_employee: new ObjectId(id),
    });
    const [hsy_licencias_by_emp, hsy_licencias_by_lic] = await Promise.all([
      query("HSY_LICENCIAS", { id_employee: new ObjectId(id) }),
      query("HSY_LICENCIAS", { id_licencia: new ObjectId(id) }),
    ]);

    const hsy_licencias = hsy_licencias_by_emp.length > 0
      ? hsy_licencias_by_emp
      : hsy_licencias_by_lic;
    const hsy_recategorizaciones = await query("HSY_RECATEGORIZACIONES", {
      id_employee: new ObjectId(id),
    });
    const hsy_status = await query("HSY_STATUS_EMPLEADO", {
      id_employee: new ObjectId(id),
    });

    historial = {
      hsy_licencias,
      hsy_areas,
      hsy_proyectos,
      hsy_recategorizaciones,
      hsy_status,
    };

    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(id), $or: [{ STATUS: 1 }, { STATUS: 2 }, { status: 1 }, { status: 2 }] }),
      query("LICENCIAS", { _id: new ObjectId(id), $or: [{ status: 1 }] }),
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

    if (employee[0].SINDICATO && employee[0].SINDICATO.DELEGACION) {
      const delegados = await querysql(`
      SELECT * FROM delegaciones
      WHERE delegacion = ?`,
        [employee[0].SINDICATO.DELEGACION],
      );
      employee[0].SINDICATO.DELEGADO = delegados.length > 0 ? delegados[0].delegado : null;
    }

    // Validamos si el perfil que se esta consultado es de un empleado con licencia activa
    const licenciaActiva = await query("LICENCIAS", {
      _id: new ObjectId(id),
      status: 1,
    });


    if (licenciaActiva && licenciaActiva.length > 0) {
      employee[0].LICENCIA_ACTIVA = true;
    } else {
      employee[0].LICENCIA_ACTIVA = false;
    }

    // Validamos si el empleado esta cubriendo una licencia, para no descontarle fondo de pensiones ni cuota sindical
    const cubreLicencia = await query("LICENCIAS", {
      id_employee: id,
      status: 1,
    });

    if (cubreLicencia && cubreLicencia.length > 0) {
      employee[0].CUBRIENDO_LICENCIA = true;
    } else {
      employee[0].CUBRIENDO_LICENCIA = false;
    }

    const faceRecognition = await query("VECTORES_FACIALES", {
      employeeId: new ObjectId(id),
    });

    const vectorFacial = faceRecognition[0];

    employee[0].FACE_RECOGNITION = Boolean(vectorFacial);
    employee[0].FECHA_INICIO_ASISTENCIA = vectorFacial?.fechaInicioAsistencia || null;

    if (employee[0].DIRECCION) {
      const domicilio = [employee[0].DIRECCION.DOMICILIO, employee[0].DIRECCION.NUM_EXT].filter(Boolean).join(' ');

      const interior = employee[0].DIRECCION.NUM_INT ? `INT. ${employee[0].DIRECCION.NUM_INT}` : '';

      employee[0].DIRECCION_COMPLETA = [
        [domicilio, interior].filter(Boolean).join(', '),
        employee[0].DIRECCION.COLONIA,
        employee[0].DIRECCION.LOCALIDAD,
        employee[0].DIRECCION.MUNICIPIO,
        employee[0].DIRECCION.ESTADO,
      ].filter(Boolean).join(', ') + '.';

      employee[0].CP = employee[0].DIRECCION.CP;
    } else {
      employee[0].DIRECCION_COMPLETA = employee[0].DOMICILIO;
    }

    // Buscar el estado de la plaza del empleado
    const status_plaza = await query("PLAZAS", {
      NUMPLA: employee[0].NUMPLA_ORIGEN ? employee[0].NUMPLA_ORIGEN : employee[0].NUMPLA,
    });

    if (!status_plaza || status_plaza.length === 0) {
      return res.status(404).json({ message: "Plaza no encontrada" });
    }

    let percepciones, deducciones = {};

    //obtener las entradas de su bitácora personal
    try {
      const bitacora = await query("BITACORA", {
        id_plantilla: employee[0]._id,
      });
      employee[0].bitacora = bitacora;
    } catch (error) {
      console.error("Error retrieving bitacora:", error);
      return res
        .status(500)
        .json({ message: "Error retrieving bitacora", error });
    }

    // Calcular percepciones y deducciones según el tipo de nómina
    switch (employee[0].TIPONOM) {
      // Percepciones y deducciones para base central o foránea
      case "M51":
      case "F51":
        // Obtener percepciones base según el nivel del empleado
        percepciones = await querysql(
          `SELECT * FROM catalogo_base  WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        const dataGasadmi = await query("PERSONAL_GASADMI", {
          id_employee: new ObjectId(employee[0]._id),
        });

        if (dataGasadmi.length > 0) {
          percepciones.gasadmi = dataGasadmi[0].gasadmi;
        }

        if (employee[0].NUM_HIJOS && employee[0].NUM_HIJOS > 0) {
          percepciones.guarderia =
            (Number(employee[0].NUM_HIJOS) * Number(percepciones.guarderia)).toFixed(2);
        } else {
          delete percepciones.guarderia;
        }

        if (employee[0].LICENCIA_ACTIVA === false && employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_base WHERE NIVEL = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        // Determinar si la quincena actual es de 16 días (segunda quincena de mes con 31 días) para aunmentar el día de ajuste
        // const now = new Date();
        // const day = now.getDate();
        // const month = now.getMonth() + 1;
        // const isSegundaQuincena16Dias = day > 15 && [1, 3, 5, 7, 8, 10, 12].includes(month);

        let sueldoGravableB;
        // if (isSegundaQuincena16Dias) {
        //   const diaAjuste = percepciones.sueldo_base / 30;
        //   percepciones.dia_ajuste = diaAjuste.toFixed(2);
        // }

        const quinquenioBase = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        sueldoGravableB = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.despensa) +
          parseFloat(percepciones.act_cul_dep) +
          parseFloat(percepciones.api_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.gasadmi ? percepciones.gasadmi : 0) +
          parseFloat(quinquenioBase) +
          parseFloat(percepciones.guarderia ? percepciones.guarderia : 0)
        ).toFixed(2);

        // Calcular las deducciones 
        const isrDataB = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableB, sueldoGravableB],
        );
        const isrObjectB = isrDataB[0];

        const isrBrutoB =
          ((sueldoGravableB - parseFloat(isrObjectB.limite_inf)) *
            parseFloat(isrObjectB.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectB.cuota_fija);

        const subsidioDataB = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableB, sueldoGravableB],
        );

        const subsidioB =
          subsidioDataB && subsidioDataB.length > 0
            ? parseFloat(subsidioDataB[0].subsidio)
            : 0;

        let isrFinal = isrBrutoB - subsidioB;

        if (isrFinal < 0) isrFinal = 0;

        deducciones.ISR = (Math.round(isrFinal * 10) / 10).toFixed(2);

        // Si el empleado esta cubriendo una licencia, no se le descuenta el fondo de pensiones
        if (employee[0].FECHA_NOMBRAMIENTO && (employee[0].CUBRIENDO_LICENCIA === false || employee[0].LICENCIA_ACTIVA === true)) {
          const FONDO_PENSIONES_BASE = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_BASE * 10) / 10).toFixed(2);
        }

        // Si el empleado esta cubriendo una licencia, no se le descuenta la cuota sindical
        if (employee[0]?.SINDICATO?.CUOTA_SINDICAL === true && (employee[0].CUBRIENDO_LICENCIA === false || employee[0].LICENCIA_ACTIVA === true)) {
          const CUOTA_SINDICAL_BASE = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_BASE * 10) / 10).toFixed(2);
        }

        const IMSS_BASE = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_BASE * 10) / 10).toFixed(2);
        break;
      case "FCT":
      case "CCT":
      case "F53":
      case "M53":
        estimuloReal = await query("PERSONAL_ESTIMULO", {
          id_employee: new ObjectId(employee[0]._id),
        });

        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        percepciones.estimulo = estimuloReal && estimuloReal.length > 0 ? estimuloReal[0].estimulo : percepciones.estimulo;

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const quinquenioCC = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        const sueldoGravableCC = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCC)
        ).toFixed(2);

        const isrDataCC = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableCC, sueldoGravableCC],
        );
        const isrObjectCC = isrDataCC[0];

        const isrBrutoCC =
          ((sueldoGravableCC - parseFloat(isrObjectCC.limite_inf)) *
            parseFloat(isrObjectCC.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCC.cuota_fija);

        const subsidioDataCC = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableCC, sueldoGravableCC],
        );

        const subsidioCC =
          subsidioDataCC && subsidioDataCC.length > 0
            ? parseFloat(subsidioDataCC[0].subsidio)
            : 0;

        let isrFinalCC = isrBrutoCC - subsidioCC;

        if (isrFinalCC < 0) isrFinalCC = 0;

        deducciones.ISR = (Math.round(isrFinalCC * 10) / 10).toFixed(2);

        if (employee[0].FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CC = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CC * 10) / 10).toFixed(2);
        }

        const IMSS_CC = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CC * 10) / 10).toFixed(2);

        break;

      case "FCO":
      case "511":
        estimuloReal = await query("PERSONAL_ESTIMULO", {
          id_employee: new ObjectId(employee[0]._id),
        });

        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL],
        );

        percepciones = percepciones[0];

        percepciones.estimulo = estimuloReal && estimuloReal.length > 0 ? estimuloReal[0].estimulo : percepciones.estimulo;

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const quinquenioCN = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        const sueldoGravableCN = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCN)
        ).toFixed(2);

        const isrDataCN = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableCN, sueldoGravableCN],
        );
        const isrObjectCN = isrDataCN[0];

        const isrBrutoCN =
          ((sueldoGravableCN - parseFloat(isrObjectCN.limite_inf)) *
            parseFloat(isrObjectCN.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCN.cuota_fija);

        const subsidioDataCN = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableCN, sueldoGravableCN],
        );

        const subsidioCN =
          subsidioDataCN && subsidioDataCN.length > 0
            ? parseFloat(subsidioDataCN[0].subsidio)
            : 0;

        let isrFinalCN = isrBrutoCN - subsidioCN;

        if (isrFinalCN < 0) isrFinalCN = 0;

        deducciones.ISR = (Math.round(isrFinalCN * 10) / 10).toFixed(2);

        if (employee[0].FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CN = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CN * 10) / 10).toFixed(2);
        }

        if (employee[0]?.SINDICATO?.CUOTA_SINDICAL === true) {
          const CUOTA_SINDICAL_CN = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_CN * 10) / 10).toFixed(2);
        }

        const IMSS_CN = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CN * 10) / 10).toFixed(2);

        break;

      case "FMM":
      case "MMS":
        percepciones = await querysql(
          `SELECT * FROM catalogo_mandosmedios WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_mandosmedios WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const quinquenioMms = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        const sueldoGravableMM = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.comp_fija_garan) +
          parseFloat(percepciones.api_mms) +
          parseFloat(quinquenioMms)
        ).toFixed(2);

        const isrDataMM = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableMM, sueldoGravableMM],
        );

        const isrObjectMM = isrDataMM[0];
        const isrBrutoMMM =
          ((sueldoGravableMM - parseFloat(isrObjectMM.limite_inf)) *
            parseFloat(isrObjectMM.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectMM.cuota_fija);

        const subsidioDataMM = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableMM, sueldoGravableMM],
        );

        const subsidioMM =
          subsidioDataMM && subsidioDataMM.length > 0
            ? parseFloat(subsidioDataMM[0].subsidio)
            : 0;

        let isrFinalMM = isrBrutoMMM - subsidioMM;

        if (isrFinalMM < 0) isrFinalMM = 0;

        deducciones.ISR = (Math.round(isrFinalMM * 10) / 10).toFixed(2);

        const IMSS_MMS = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_MMS * 10) / 10).toFixed(2);

        const CAT_SEGURO = await querysql(
          "SELECT * FROM seg_vida WHERE nivel = ?",
          [employee[0].NIVEL],
        );

        const SEGURO_VIDA_MMS = parseFloat(CAT_SEGURO[0].seg_vida).toFixed(2);
        deducciones.SEGURO_VIDA = (Math.round(SEGURO_VIDA_MMS * 10) / 10).toFixed(2);

        if (employee[0].FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_MMS = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_MMS * 10) / 10).toFixed(2);
        }

        delete percepciones.isr_rdl;
        delete percepciones.rdl;

        break;
      default:
        return res
          .status(400)
          .json({ message: "Tipo de nómina no reconocido" });
    }
    delete percepciones.id;
    delete percepciones.nivel;

    // Agregar percepciones, deducciones y estado de plaza al empleado
    employee[0].historial = historial;
    employee[0].percepciones = percepciones;
    employee[0].deducciones = deducciones;
    employee[0].status_plaza = status_plaza;
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `CONSULTÓ EL PERFIL DEL EMPLEADO"${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);

    // Enviar la respuesta con los datos del empleado
    res.json(employee[0]);
  } catch (error) {
    console.error(error?.message, error?.stack);
    res.status(500).json({ message: "Error al buscar el empleado", error: error.message ?? String(error) });
  }
};

// Función para buscar empleados por una consulta
employeeController.getEmployee = async (req, res) => {
  const { query: searchQuery } = req.params;

  try {
    let empleados;
    if (/^[a-zA-Z\s]+$/.test(searchQuery)) {
      // Si la consulta contiene solo letras y espacios
      const regex = new RegExp(
        `^${searchQuery.trim().replace(/\s+/g, " ")}$`,
        "i",
      );
      empleados = await query("PLANTILLA", {
        $and: [
          {
            $or: [
              { APE_PAT: { $regex: regex } },
              { APE_MAT: { $regex: regex } },
              { NOMBRES: { $regex: regex } },
              {
                $expr: {
                  $eq: [
                    {
                      $concat: ["$APE_PAT", " ", "$APE_MAT", " ", "$NOMBRES"],
                    },
                    searchQuery.trim(),
                  ],
                },
              },
              {
                $expr: {
                  $eq: [
                    {
                      $concat: ["$APE_PAT", " ", "$NOMBRES"],
                    },
                    searchQuery.trim(),
                  ],
                },
              },
              {
                $expr: {
                  $eq: [
                    {
                      $concat: ["$APE_MAT", " ", "$NOMBRES"],
                    },
                    searchQuery.trim(),
                  ],
                },
              },
            ],
          },
        ],
      });
    } else if (/^[a-zA-Z0-9]+$/.test(searchQuery)) {
      // Si la consulta contiene letras y números
      empleados = await query("PLANTILLA", {
        $and: [
          { STATUS: 1 },
          { $or: [{ CURP: searchQuery }, { RFC: searchQuery }] },
        ],
      });
    } else if (/^\d+$/.test(searchQuery)) {
      empleados = await query("PLANTILLA", {
        $and: [{ STATUS: 1 }, { NUMEMP: parseInt(searchQuery, 10) }],
      });
      // Si la consulta contiene solo números
      empleados = await query("PLANTILLA", { NUMTARJETAS: searchQuery });
    } else {
      return res.status(400).json({ message: "Consulta no válida" });
    }

    res.send(empleados);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};
employeeController.updateArea = async (req, res) => {
  const { _id, ADSCRIPCION, AREA_RESP, CLAVE } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (CLAVE === employee[0].CLAVE) {
      return res.status(409).json({ message: "Sin cambios" });
    }

    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    const hsy_data = {
      ...req.body,
      currentDateTime,
      last_adscripcion: employee[0].ADSCRIPCION,
      last_clave: employee[0].CLAVE,
      id_employee: new ObjectId(_id),
    };
    delete hsy_data._id;

    // Actualizar la adscripción del empleado
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { ADSCRIPCION, AREA_RESP, CLAVE } },
    );
    await insertOne("HSY_AREAS", hsy_data);

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `MODIFICÓ LA ADSCRIPCIÓN A DEL EMPLEADO: "${fullName}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};
employeeController.updateProyect = async (req, res) => {
  const { _id, PROYECTO, ADSCRIPCION, AREA_RESP, CLAVE } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (PROYECTO === employee[0].PROYECTO) {
      return res.status(409).json({ message: "Sin cambios" });
    }

    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    const hsy_data = {
      ...req.body,
      currentDateTime,
      last_proyect: employee[0].PROYECTO,
      last_adscripcion: employee[0].ADSCRIPCION,
      id_employee: new ObjectId(_id),
    };
    delete hsy_data._id;
    // Actualizar el proyecto y/o adscripción del empleado
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { PROYECTO, ADSCRIPCION, AREA_RESP, CLAVE } },
    );
    await insertOne("HSY_PROYECTOS", hsy_data);

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `MODIFICÓ EL PROYECTO A DEL EMPLEADO: "${fullName}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res
      .status(200)
      .json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};
employeeController.recategorizeEmployee = async (req, res) => {
  const { _id, NUMPLA, CLAVECAT, NOMCATE, NIVEL, TIPONOM } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    let NUMPLA_ORIGEN = employee[0].NUMPLA_ORIGEN;

    // Si NO tiene plaza origen, se asigna la actual (la primera con la que entró)
    if (!NUMPLA_ORIGEN) {
      NUMPLA_ORIGEN = employee[0].NUMPLA;
    }

    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    const hsy_data = {
      ...req.body,
      currentDateTime,
      last_numpla: employee[0].NUMPLA,
      last_clavecat: employee[0].CLAVECAT,
      last_nomcate: employee[0].NOMCATE,
      last_level: employee[0].NIVEL,
      id_employee: new ObjectId(_id),
    };
    delete hsy_data._id;
    // Actualizar el proyecto y/o adscripción del empleado
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { NUMPLA, CLAVECAT, NOMCATE, NIVEL, TIPONOM, NUMPLA_ORIGEN } },
    );
    await insertOne("HSY_RECATEGORIZACIONES", hsy_data);

    if (!result || result.matchedCount === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Empleado no encontrado o sin cambios" });
    }

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `RECATEGORIZÓ A "${NOMCATE} - ${CLAVECAT}" AL EMPLEADO: "${fullName}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};

employeeController.getUserActionsPersonal = async (req, res) => {
  try {
    const actions = await query("USER_ACTIONS", {});
    const users = await query("USUARIOS", {});

    const filteredActions = actions.filter((a) => {
      const text = (a.action || "").toString().trim();
      const module = (a.module || "").toString().trim();
      return !/^CONSULTÓ/i.test(text) && /^PSL/i.test(module);
    });

    filteredActions.forEach((action) => {
      const matchedUser = users.find((u) => u.username === action.username);
      if (matchedUser) {
        action.name = matchedUser.name;
      }
    });

    res.send(filteredActions);
  } catch (error) {
    console.error("Error fetching user actions:", error);
    res.status(500).json({ error: "An error occurred while fetching data" });
  }
};

// Función para obtener conteo de empleados por tipo de nombramiento y género
employeeController.getEmployeeCount = async (req, res) => {
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const tipoNomMap = {
    F51: "BASE FORÁNEA",
    M51: "BASE CENTRAL",
    FCT: "CONTRATO CONFIANZA FORANEO",
    CCT: "CONTRATO CONFIANZA CENTRAL",
    FCO: "NOMBRAMIENTO CONFIANZA FORANEO",
    511: "NOMBRAMIENTO CONFIANZA CENTRAL",
    F53: "CONTRATO FORÁNEO",
    M53: "CONTRATO CENTRAL",
    FMM: "MANDOS MEDIOS FORÁNEOS",
    MMS: "MANDOS MEDIOS CENTRAL",
  };

  try {
    const todosEmpleados = await query("PLANTILLA", { status: 1 });

    // Contar por tipo de nombramiento
    const conteo = {};
    let totalHombres = 0;
    let totalMujeres = 0;

    todosEmpleados.forEach((emp) => {
      const tipoNom = emp.TIPONOM || "SIN ASIGNAR";
      conteo[tipoNom] = (conteo[tipoNom] || 0) + 1;
      if (emp.SEXO === "H") {
        totalHombres++;
      } else if (emp.SEXO === "M") {
        totalMujeres++;
      }
    });

    // Construir respuesta con descripción
    const porTipoNombramiento = Object.keys(conteo)
      .sort()
      .map((clave) => ({
        clave,
        descripcion: tipoNomMap[clave] || "Tipo no definido",
        cantidad: conteo[clave],
      }));
    // Registrar acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-EST",
      action: `CONSULTÓ CONTEO DE EMPLEADOS POR TIPO DE NOMBRAMIENTO Y GÉNERO`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({
      totalEmpleados: todosEmpleados.length,
      totalHombres,
      totalMujeres,
      porTipoNombramiento,
    });
  } catch (error) {
    console.error("Error counting employees by tipo de nombramiento:", error);
    res
      .status(500)
      .json({ error: "An error occurred while counting employees" });
  }
};

employeeController.afiliarSindicato = async (req, res) => {
  const { _id, AFILIADO, DELEGACION, FECHA_AFILIACION, CUOTA_SINDICAL } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    let fechaAfiliacionDate = FECHA_AFILIACION;

    if (FECHA_AFILIACION) {
      fechaAfiliacionDate = new Date(FECHA_AFILIACION);
    } else {
      fechaAfiliacionDate = null;
    }

    const SINDICATO = {
      AFILIADO,
      DELEGACION,
      FECHA_AFILIACION: fechaAfiliacionDate,
      CUOTA_SINDICAL,
    };

    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { SINDICATO } },
    );

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `AFILIÓ AL SINDICATO AL EMPLEADO: "${employee[0].APE_PAT || ''} ${employee[0].APE_MAT || ''} ${employee[0].NOMBRES || ''}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).json({ message: "Empleado actualizado correctamente", _id });

  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
}

employeeController.getUnifiedProfileData = async (req, res) => {
  const { id } = req.params;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  const maxDaysPerQuarter = 4;
  const maxAccumulatedDays = 6;

  try {
    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(id), $or: [{ status: 1 }] }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(id), $or: [{ status: 1 }] }),
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

    if (employee[0].SINDICATO && employee[0].SINDICATO.DELEGACION) {
      const delegados = await querysql(`
      SELECT * FROM delegaciones
      WHERE delegacion = ?`,
        [employee[0].SINDICATO.DELEGACION],
      );
      employee[0].SINDICATO.DELEGADO = delegados.length > 0 ? delegados[0].delegado : null;
    }

    const hsy_areas = await query("HSY_AREAS", {
      id_employee: new ObjectId(id),
    });
    const hsy_proyectos = await query("HSY_PROYECTOS", {
      id_employee: new ObjectId(id),
    });
    const [hsy_licencias_by_emp, hsy_licencias_by_lic] = await Promise.all([
      query("HSY_LICENCIAS", { id_employee: new ObjectId(id) }),
      query("HSY_LICENCIAS", { id_licencia: new ObjectId(id) }),
    ]);

    const hsy_licencias = hsy_licencias_by_emp.length > 0
      ? hsy_licencias_by_emp
      : hsy_licencias_by_lic;

    const hsy_recategorizaciones = await query("HSY_RECATEGORIZACIONES", {
      id_employee: new ObjectId(id),
    });
    const hsy_status = await query("HSY_STATUS_EMPLEADO", {
      id_employee: new ObjectId(id),
    });
    const bitacora = await query("BITACORA", {
      id_plantilla: employee[0]._id,
    });

    historial = {
      hsy_licencias,
      hsy_areas,
      hsy_proyectos,
      hsy_recategorizaciones,
      hsy_status,
    };

    // Validamos si el empleado esta cubriendo una licencia, para no descontarle fondo de pensiones ni cuota sindical
    const cubreLicencia = await query("LICENCIAS", {
      id_employee: id,
      status: 1,
    });

    if (cubreLicencia && cubreLicencia.length > 0) {
      employee[0].CUBRIENDO_LICENCIA = true;
    } else {
      employee[0].CUBRIENDO_LICENCIA = false;
    }


    if (employee[0].DIRECCION) {
      employee[0].DIRECCION_COMPLETA = [
        `${employee[0].DIRECCION.DOMICILIO} ${employee[0].DIRECCION.NUM_EXT}`,
        employee[0].DIRECCION.COLONIA,
        employee[0].DIRECCION.LOCALIDAD,
        employee[0].DIRECCION.MUNICIPIO,
        employee[0].DIRECCION.ESTADO,
      ].filter(Boolean).join(', ') + '.',
        employee[0].CP = employee[0].DIRECCION.CP;
    } else {
      employee[0].DIRECCION_COMPLETA = employee[0].DOMICILIO;
    }

    // Buscar el estado de la plaza del empleado
    const status_plaza = await query("PLAZAS", {
      NUMPLA: employee[0].NUMPLA_ORIGEN ? employee[0].NUMPLA_ORIGEN : employee[0].NUMPLA,
    });

    if (!status_plaza || status_plaza.length === 0) {
      return res.status(404).json({ message: "Plaza no encontrada" });
    }

    let percepciones, deducciones = {};

    // Calcular percepciones y deducciones según el tipo de nómina
    switch (employee[0].TIPONOM) {
      // Percepciones y deducciones para base central o foránea
      case "M51":
      case "F51":
        // Obtener percepciones base según el nivel del empleado
        percepciones = await querysql(
          `SELECT * FROM catalogo_base  WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        const dataGasadmi = await query("PERSONAL_GASADMI", {
          id_employee: new ObjectId(employee[0]._id),
        });

        if (dataGasadmi.length > 0) {
          percepciones.gasadmi = dataGasadmi[0].gasadmi;
        }

        if (employee[0].NUM_HIJOS && employee[0].NUM_HIJOS > 0) {
          percepciones.guarderia =
            (Number(employee[0].NUM_HIJOS) * Number(percepciones.guarderia)).toFixed(2);
        } else {
          delete percepciones.guarderia;
        }

        if (employee[0].LICENCIA_ACTIVA === false && employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_base WHERE NIVEL = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        let sueldoGravableB;

        const quinquenioBase = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        sueldoGravableB = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.despensa) +
          parseFloat(percepciones.act_cul_dep) +
          parseFloat(percepciones.api_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.gasadmi ? percepciones.gasadmi : 0) +
          parseFloat(quinquenioBase) +
          parseFloat(percepciones.guarderia ? percepciones.guarderia : 0)
        ).toFixed(2);

        // Calcular las deducciones 
        const isrDataB = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableB, sueldoGravableB],
        );
        const isrObjectB = isrDataB[0];

        const isrBrutoB =
          ((sueldoGravableB - parseFloat(isrObjectB.limite_inf)) *
            parseFloat(isrObjectB.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectB.cuota_fija);

        const subsidioDataB = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableB, sueldoGravableB],
        );

        const subsidioB =
          subsidioDataB && subsidioDataB.length > 0
            ? parseFloat(subsidioDataB[0].subsidio)
            : 0;

        let isrFinal = isrBrutoB - subsidioB;

        if (isrFinal < 0) isrFinal = 0;

        deducciones.ISR = (Math.round(isrFinal * 10) / 10).toFixed(2);

        // Si el empleado esta cubriendo una licencia, no se le descuenta el fondo de pensiones
        if (employee[0].FECHA_NOMBRAMIENTO && (employee[0].CUBRIENDO_LICENCIA === false || employee[0].LICENCIA_ACTIVA === true)) {
          const FONDO_PENSIONES_BASE = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_BASE * 10) / 10).toFixed(2);
        }

        // Si el empleado esta cubriendo una licencia, no se le descuenta la cuota sindical
        if (employee[0]?.SINDICATO?.CUOTA_SINDICAL === true && (employee[0].CUBRIENDO_LICENCIA === false || employee[0].LICENCIA_ACTIVA === true)) {
          const CUOTA_SINDICAL_BASE = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_BASE * 10) / 10).toFixed(2);
        }

        const IMSS_BASE = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_BASE * 10) / 10).toFixed(2);
        break;
      case "FCT":
      case "CCT":
      case "F53":
      case "M53":
        estimuloReal = await query("PERSONAL_ESTIMULO", {
          id_employee: new ObjectId(employee[0]._id),
        });

        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        percepciones.estimulo = estimuloReal && estimuloReal.length > 0 ? estimuloReal[0].estimulo : percepciones.estimulo;

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const quinquenioCC = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        const sueldoGravableCC = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCC)
        ).toFixed(2);

        const isrDataCC = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableCC, sueldoGravableCC],
        );
        const isrObjectCC = isrDataCC[0];

        const isrBrutoCC =
          ((sueldoGravableCC - parseFloat(isrObjectCC.limite_inf)) *
            parseFloat(isrObjectCC.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCC.cuota_fija);

        const subsidioDataCC = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableCC, sueldoGravableCC],
        );

        const subsidioCC =
          subsidioDataCC && subsidioDataCC.length > 0
            ? parseFloat(subsidioDataCC[0].subsidio)
            : 0;

        let isrFinalCC = isrBrutoCC - subsidioCC;

        if (isrFinalCC < 0) isrFinalCC = 0;

        deducciones.ISR = (Math.round(isrFinalCC * 10) / 10).toFixed(2);

        if (employee[0].FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CC = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CC * 10) / 10).toFixed(2);
        }

        const IMSS_CC = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CC * 10) / 10).toFixed(2);

        break;

      case "FCO":
      case "511":
        estimuloReal = await query("PERSONAL_ESTIMULO", {
          id_employee: new ObjectId(employee[0]._id),
        });

        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL],
        );

        percepciones = percepciones[0];

        percepciones.estimulo = estimuloReal && estimuloReal.length > 0 ? estimuloReal[0].estimulo : percepciones.estimulo;

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const sueldoGravableCN = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCN)
        ).toFixed(2);

        const isrDataCN = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableCN, sueldoGravableCN],
        );
        const isrObjectCN = isrDataCN[0];

        const isrBrutoCN =
          ((sueldoGravableCN - parseFloat(isrObjectCN.limite_inf)) *
            parseFloat(isrObjectCN.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCN.cuota_fija);

        const subsidioDataCN = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableCN, sueldoGravableCN],
        );

        const subsidioCN =
          subsidioDataCN && subsidioDataCN.length > 0
            ? parseFloat(subsidioDataCN[0].subsidio)
            : 0;

        let isrFinalCN = isrBrutoCN - subsidioCN;

        if (isrFinalCN < 0) isrFinalCN = 0;

        deducciones.ISR = (Math.round(isrFinalCN * 10) / 10).toFixed(2);

        if (employee[0].FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CN = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CN * 10) / 10).toFixed(2);
        }

        if (employee[0]?.SINDICATO?.CUOTA_SINDICAL === true) {
          const CUOTA_SINDICAL_CN = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_CN * 10) / 10).toFixed(2);
        }

        const IMSS_CN = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CN * 10) / 10).toFixed(2);

        break;

      case "FMM":
      case "MMS":
        percepciones = await querysql(
          `SELECT * FROM catalogo_mandosmedios WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_mandosmedios WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const quinquenioMms = Object.entries(percepciones)
          .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

        const sueldoGravableMM = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.comp_fija_garan) +
          parseFloat(percepciones.api_mms) +
          parseFloat(quinquenioMms)
        ).toFixed(2);

        const isrDataMM = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableMM, sueldoGravableMM],
        );

        const isrObjectMM = isrDataMM[0];
        const isrBrutoMMM =
          ((sueldoGravableMM - parseFloat(isrObjectMM.limite_inf)) *
            parseFloat(isrObjectMM.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectMM.cuota_fija);

        const subsidioDataMM = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableMM, sueldoGravableMM],
        );

        const subsidioMM =
          subsidioDataMM && subsidioDataMM.length > 0
            ? parseFloat(subsidioDataMM[0].subsidio)
            : 0;

        let isrFinalMM = isrBrutoMMM - subsidioMM;

        if (isrFinalMM < 0) isrFinalMM = 0;

        deducciones.ISR = (Math.round(isrFinalMM * 10) / 10).toFixed(2);

        const IMSS_MMS = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_MMS * 10) / 10).toFixed(2);

        const CAT_SEGURO = await querysql(
          "SELECT * FROM seg_vida WHERE nivel = ?",
          [employee[0].NIVEL],
        );

        const SEGURO_VIDA_MMS = parseFloat(CAT_SEGURO[0].seg_vida).toFixed(2);
        deducciones.SEGURO_VIDA = (Math.round(SEGURO_VIDA_MMS * 10) / 10).toFixed(2);

        if (employee[0].FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_MMS = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_MMS * 10) / 10).toFixed(2);
        }

        delete percepciones.isr_rdl;
        delete percepciones.rdl;

        break;
      default:
        return res
          .status(400)
          .json({ message: "Tipo de nómina no reconocido" });
    }
    delete percepciones.id;
    delete percepciones.nivel;

    const currentQuarter = getCustomQuarter(moment().format("YYYY-MM-DD"));
    const currentYear = moment().year();

    // Obtener permisos del empleado en el año actual y, si aplica, del año anterior
    const previousQuarter = currentQuarter === 1 ? 3 : currentQuarter - 1;

    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(employee[0].ID_CTRL_ASIST) || [],
      AÑO: currentYear,
    });

    const justificantes = await query("JUSTIFICACIONES", {
      ID_CTRL_ASIST: new ObjectId(employee[0].ID_CTRL_ASIST) || [],
    });
    const incapacidades = await query("INCAPACIDADES", {
      ID_CTRL_ASIST: new ObjectId(employee[0].ID_CTRL_ASIST) || [],
    });
    const permisosExt = await query("PERMISOS_EXT", {
      ID_CTRL_ASIST: new ObjectId(employee[0].ID_CTRL_ASIST) || [],
    });
    const comisiones = await query("COMISIONES", {
      ID_CTRL_ASIST: new ObjectId(employee[0].ID_CTRL_ASIST) || [],
    });

    const incidencias = await query("INCIDENCIAS", {
      ID_CTRL_ASIST: new ObjectId(employee[0].ID_CTRL_ASIST) || [],
    });


    let leftDays = maxDaysPerQuarter; // Comenzar con 4 días

    const hasPreviousQuarterPermits =
      currentQuarter === 1
        ? false
        : permits.some((permit) => permit.CUATRIMESTRE === previousQuarter);

    const fechaIngreso = moment(employee[0].FECHA_INGRESO, "YYYY-MM-DD", true).isValid()
      ? moment(employee[0].FECHA_INGRESO, "YYYY-MM-DD")
      : moment(employee[0].FECHA_INGRESO);

    const mesesTrabajados = fechaIngreso.isValid()
      ? moment().diff(fechaIngreso, "months")
      : 0;

    const eligibleDate = fechaIngreso.clone().add(4, "months");

    const previousQuarterYear = currentQuarter === 1 ? currentYear - 1 : currentYear;
    const previousQuarterStartMonth =
      previousQuarter === 1 ? 0 : previousQuarter === 2 ? 4 : 8;

    const previousQuarterStart = moment({
      year: previousQuarterYear,
      month: previousQuarterStartMonth,
      day: 1,
    });

    const hadRightInPreviousQuarter = eligibleDate.isSameOrBefore(previousQuarterStart);

    if (!hasPreviousQuarterPermits && currentQuarter !== 1 && hadRightInPreviousQuarter) {
      leftDays = maxAccumulatedDays; // 6 días
    }

    // Restar los días ya usados en el cuatrimestre actual
    permits.forEach((permit) => {
      if (
        permit.CUATRIMESTRE === currentQuarter &&
        permit.AÑO === currentYear
      ) {
        leftDays -= permit.NUM_DIAS || 0;
      }
    });

    if (leftDays < 0) leftDays = 0;

    employee[0].leftDays = leftDays;

    const data = {
      PERSONAL: {
        INFORMACION: employee[0],
        HISTORIAL: historial,
        PERCEPCIONES: percepciones,
        DEDUCCIONES: deducciones,
        STATUS_PLAZA: status_plaza
      },
      CTRL_ASIST: {
        ECONOMICOS: permits,
        JUSTIFICANTES: justificantes,
        INCAPACIDADES: incapacidades,
        PERMISOS_EXT: permisosExt,
        COMISIONNES: comisiones,
        INCIDENCIAS: incidencias
      },
      BITACORA: bitacora
    }


    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `CONSULTÓ EL PERFIL DEL EMPLEADO"${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);

    // Enviar la respuesta con los datos del empleado
    res.json(data);
  } catch (error) {
    console.error(error?.message, error?.stack);
    res.status(500).json({ message: "Error al buscar el empleado", error: error.message ?? String(error) });
  }
};

employeeController.printFichaTecnica = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const pdfTemplatePath = path.resolve(__dirname, "../../templates/templateFichaTecnica.pdf");

  if (!fs.existsSync(pdfTemplatePath)) {
    return res.status(404).json({ message: "Template PDF no encontrado", path: pdfTemplatePath });
  }

  try {
    const [employeePlantilla = [], employeeLicencia = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(id), status: 1 }),
      query("LICENCIAS", { _id: new ObjectId(id), status: 1 }),
    ]);

    const employee = employeePlantilla[0] || employeeLicencia[0];

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const status_plaza = await query("PLAZAS", { NUMPLA: employee.NUMPLA_ORIGEN ? employee.NUMPLA_ORIGEN : employee.NUMPLA });

    if (!status_plaza || status_plaza.length === 0) {
      return res.status(404).json({ message: "Place not found" });
    }

    const plaza = status_plaza[0];

    // Cargar PDF
    const pdfBytes = fs.readFileSync(pdfTemplatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // Obtener campos del formulario y mapear nombres reales
    const form = pdfDoc.getForm();
    const fieldsByName = Object.fromEntries(
      form.getFields().map((f) => [f.getName(), f]),
    );

    function calcularEdad(curp) {
      if (!curp || typeof curp !== "string" || curp.length < 10) {
        return "";
      }

      const fecha = curp.substring(4, 10);

      if (!/^\d{6}$/.test(fecha)) {
        return "";
      }

      const anio = Number(fecha.substring(0, 2));
      const mes = Number(fecha.substring(2, 4));
      const dia = Number(fecha.substring(4, 6));

      const anioActual = new Date().getFullYear();
      const anioCortoActual = anioActual % 100;

      const anioCompleto =
        anio <= anioCortoActual ? 2000 + anio : 1900 + anio;

      const nacimiento = new Date(anioCompleto, mes - 1, dia);

      // Validar que la fecha de nacimiento sea real.
      if (
        nacimiento.getFullYear() !== anioCompleto ||
        nacimiento.getMonth() !== mes - 1 ||
        nacimiento.getDate() !== dia
      ) {
        return "";
      }

      const hoy = new Date();

      let edad = hoy.getFullYear() - anioCompleto;

      if (
        hoy.getMonth() < nacimiento.getMonth() ||
        (hoy.getMonth() === nacimiento.getMonth() &&
          hoy.getDate() < nacimiento.getDate())
      ) {
        edad--;
      }

      if (edad < 0) {
        return "";
      }

      return `${edad} ${edad === 1 ? "AÑO" : "AÑOS"}`;
    }


    const tipoNomMapping = {
      'F51': 'BASE FORÁNEA',
      'M51': 'BASE CENTRAL',
      'FCT': 'CONTRATO CONFIANZA FORANEO',
      'CCT': 'CONTRATO CONFIANZA CENTRAL',
      'FCO': 'NOMBRAMIENTO CONFIANZA FORANEO',
      '511': 'NOMBRAMIENTO CONFIANZA CENTRAL',
      'F53': 'CONTRATO FORÁNEO',
      'M53': 'CONTRATO CENTRAL',
      'FMM': "MANDOS MEDIOS FORÁNEOS",
      'MMS': "MANDOS MEDIOS CENTRAL",
    };

    async function obtenerDelegado(delegacion) {
      if (!delegacion || typeof delegacion !== "string") {
        return "";
      }

      const delegados = await querysql(`
      SELECT * FROM delegaciones
      WHERE delegacion = ?`,
        [delegacion],
      );
      return delegados.length > 0 ? delegados[0].delegado : '';
    }


    const statusArray = Array.isArray(employee.STATUS_EMPLEADO) ? employee.STATUS_EMPLEADO : [];

    const s1 = statusArray[0] || {};
    const s2 = statusArray[1] || {};

    const obtenerTextoStatus = (status) => {
      const statusMessages = {
        COM_SDCL: () =>
          `${employee?.SEXO === 'M' ? 'COMISIÓNADA' : 'COMISIÓNADO'} SINDICALMENTE EN: "${status.LUGAR_COMISIONADO || 'NO ESPECIFICADO'}"`,

        COM_LAB: () =>
          `${employee?.SEXO === 'M' ? 'COMISIÓNADA' : 'COMISIÓNADO'} LABORALMENTE EN: "${status.LUGAR_COMISIONADO || 'NO ESPECIFICADO'}"`,

        ASIG_LAB: () => {
          const lugar = status.LUGAR_COMISIONADO || '';
          const articulo = lugar.trim().toUpperCase().startsWith('DEPARTAMENTO') ? 'EL' : 'LA';

          return `${employee?.SEXO === 'M' ? 'ASIGNADA' : 'ASIGNADO'} LABORALMENTE EN ${articulo}: "${lugar}" CON LA CLAVE: "${status.CLAVE || ''}"`;
        },

        EXIMA: () =>
          `EXIMA AUTORIZADA`,

        LIC_ENF: () =>
          `LICENCIA POR ENFERMEDAD`,
      };

      return statusMessages[status.STATUS]?.() || '';
    };

    const historialOcupantes = Array.isArray(plaza.previousOcuppants)
      ? plaza.previousOcuppants.filter(ocupante => ocupante != null)
      : [];

    const ultimoOcupante = historialOcupantes.at(-1) || null;
    const penultimoOcupante = historialOcupantes.at(-2) || null;

    const motivoMapping = {
      'R-DEF': 'RENUNCIA - DEFINITIVA',
      'R-OCA': 'RENUNCIA - POR OCUPAR OTRO CARGO',
      'R-JUB': 'RENUNCIA - POR JUBILACIÓN',
      'R-PEN': 'RENUNCIA - POR PENSIÓN',
      'L-IBASE': 'LICENCIA - INDEFINIDA A BASE',
      'L-SS': 'LICENCIA - SIN GOCE DE SUELDO',
      'L-PRRO': 'LICENCIA - PRÓRROGA',
      'RR': 'RECISIÓN O REVOCACIÓN',
      'DEF': 'DEFUNCIÓN'
    };

    const fieldMapping = {
      FECHA_ACTUAL: moment().format('DD/MM/YYYY'),
      ELABORO: `GENERADO POR: ${user.name}`,
      APE_PAT: employee.APE_PAT ?? "",
      APE_MAT: employee.APE_MAT ?? "",
      NOMBRES: employee.NOMBRES ?? "",
      EDAD: calcularEdad(employee.CURP),
      SEXO: employee.SEXO ?? "",
      DOMICILIO: employee.DIRECCION?.DOMICILIO ?? employee.DOMICILIO ?? "",
      NUM_EXT: employee.DIRECCION?.NUM_EXT ?? "",
      NUM_INT: employee.DIRECCION?.NUM_INT ?? "",
      COLONIA: employee.DIRECCION?.COLONIA ?? "",
      MUNICIPIO: employee.DIRECCION?.MUNICIPIO ?? "",
      CP: employee.DIRECCION?.CP ?? employee.CP ?? "",
      ESTADO: employee.DIRECCION?.ESTADO ?? "",
      LUGARNAC: employee.LUGARNAC ?? "",
      NACIONALIDAD: employee.NACIONALIDAD ?? "",
      FECHA_NAC: employee.FECHA_NAC ? moment(employee.FECHA_NAC).format("DD-MM-YYYY") : "",
      TEL_PERSONAL: employee.TEL_PERSONAL ?? "",
      EMAIL: employee.EMAIL ?? "",
      CURP: employee.CURP ?? "",
      RFC: employee.RFC ?? "",
      ESTADO_CIVIL: employee.ESTADO_CIVIL ?? "",
      CONYUGE: employee.CONUYUGE ?? "",
      NUM_HIJOS: employee.NUM_HIJOS ?? "",
      AFILIACI: employee.AFILIACI ?? "",
      ALERGIA: employee.ALERGIA ?? "",
      SANGRE: employee.SANGRE ?? "",
      AVISAR: employee.AVISAR ?? "",
      TEL_EMERGENCIA1: employee.TEL_EMERGENCIA1 ?? "",
      TEL_EMERGENCIA2: employee.TEL_EMERGENCIA2 ?? "",
      PROFESION1: (() => {
        const nivelEstudio = employee?.ESTUDIOS?.PRIMER_ESTUDIO?.NIVEL_ESTUDIO;
        if (nivelEstudio) {
          const profes = employee?.ESTUDIOS?.PRIMER_ESTUDIO?.PROFES;
          const cedulaProfes = employee?.ESTUDIOS?.PRIMER_ESTUDIO?.CEDULA;

          let resultado = '';
          if (['BACHILLERATO', 'PREPARATORIA', 'LICENCIATURA', 'INGENIERÍA', 'MAESTRIA', 'DOCTORADO'].includes(nivelEstudio)) {
            resultado = nivelEstudio;
            if (profes) {
              resultado += ` ${profes}`;
            }
            if (cedulaProfes) {
              resultado += `, CON CEDULA PROFESIONAL: ${cedulaProfes}`;
            }
          } else {
            resultado = `${nivelEstudio}`;
          }
          return resultado;
        }
        return employee?.PROFES || '';
      })(),
      PROFESION2: (() => {
        const nivelEstudio = employee?.ESTUDIOS?.SEGUNDO_ESTUDIO?.NIVEL_ESTUDIO;
        if (nivelEstudio) {
          const profes = employee?.ESTUDIOS?.SEGUNDO_ESTUDIO?.PROFES;
          const cedulaProfes = employee?.ESTUDIOS?.SEGUNDO_ESTUDIO?.CEDULA;

          let resultado = '';
          if (['BACHILLERATO', 'PREPARATORIA', 'LICENCIATURA', 'INGENIERÍA', 'MAESTRIA', 'DOCTORADO'].includes(nivelEstudio)) {
            resultado = nivelEstudio;
            if (profes) {
              resultado += ` ${profes}`;
            }
            if (cedulaProfes) {
              resultado += `, CON CEDULA PROFESIONAL: ${cedulaProfes}`;
            }
          } else {
            resultado = `${nivelEstudio}`;
          }
          return resultado;
        }
        return '';
      })(),

      NUMPLA: employee.NUMPLA ?? "",
      NUMEMP: employee.NUMEMP ?? "",
      TIPONOM: tipoNomMapping[employee.TIPONOM] ?? employee.TIPONOM,
      CLAVECAT: employee.CLAVECAT ?? "",
      NOMCATE: employee.NOMCATE ?? "",
      NIVEL: employee.NIVEL ?? "",
      FECHA_INGRESO: employee.FECHA_INGRESO ? moment(employee.FECHA_INGRESO).format("DD-MM-YYYY") : "",
      FECHA_NOMBRAMIENTO: employee.FECHA_NOMBRAMIENTO ? moment(employee.FECHA_NOMBRAMIENTO).format("DD-MM-YYYY") : "",
      ADSCRIPCION: employee.ADSCRIPCION ?? "",
      PROYECTO: employee.PROYECTO ?? "",
      CLAVE: employee.CLAVE ?? "",
      NUMQUIN: employee.NUMQUIN ?? "",
      NUMTARJETA: employee.NUMTARJETA ?? "",
      HORARIO: employee.TURNOMAT ? employee.TURNOMAT : employee.TURNOVES ? employee.TURNOVES : "",
      DELEGACION: employee.SINDICATO?.DELEGACION ?? "",
      DELEGADO: employee.SINDICATO?.DELEGACION ? await obtenerDelegado(employee.SINDICATO.DELEGACION) : "",

      STATUS1: obtenerTextoStatus(s1),
      FECHA_INICIO_1: s1.DESDE ? moment(s1.DESDE).format("DD-MM-YYYY") : "",
      FECHA_TERMINO_1: s1.HASTA ? moment(s1.HASTA).format("DD-MM-YYYY") : "",
      STATUS2: obtenerTextoStatus(s2),
      FECHA_INICIO_2: s2.DESDE ? moment(s2.DESDE).format("DD-MM-YYYY") : "",
      FECHA_TERMINO_2: s2.HASTA ? moment(s2.HASTA).format("DD-MM-YYYY") : "",

      ULTIMO_OCUPANTE: ultimoOcupante?.NOMBRE ?? "",
      MOTIVO_BAJA_ULTIMO: motivoMapping[ultimoOcupante?.MOTIVO_BAJA] ?? ultimoOcupante?.MOTIVO_BAJA ?? "",
      FECHA_BAJA_ULTIMO: ultimoOcupante?.FECHA_BAJA ? moment(ultimoOcupante?.FECHA_BAJA).format("DD-MM-YYYY") : "",

      PENULTIMO_OCUPANTE: penultimoOcupante?.NOMBRE ?? "",
      MOTIVO_BAJA_PENULTIMO: motivoMapping[penultimoOcupante?.MOTIVO_BAJA] ?? penultimoOcupante?.MOTIVO_BAJA ?? "",
      FECHA_BAJA_PENULTIMO: penultimoOcupante?.FECHA_BAJA ? moment(penultimoOcupante?.FECHA_BAJA).format("DD-MM-YYYY") : "",
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

    const pdfBytesOutput = await pdfDoc.save();

    const nombreArchivo = `FICHA_TECNICA_${employee.APE_PAT || ""}_${employee.APE_MAT || ""}_${employee.NOMBRES || ""}.pdf`
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nombreArchivo}"`
    );

    const userAction = {
      username: user.username,
      module: "PSL",
      action: `IMPRIMIÓ LA FICHA TÉCNICA DEL EMPLEADO: "${employee.APE_PAT || ''} ${employee.APE_MAT || ''} ${employee.NOMBRES || ''}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);

    return res.status(200).send(Buffer.from(pdfBytesOutput));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al generar el documento PDF", error });
  }
};


// Exportamos el controlador de empleados
module.exports = employeeController;
