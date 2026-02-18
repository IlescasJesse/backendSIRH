const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  isBefore,
} = require("date-fns");
const { es } = require("date-fns/locale");
const getCustomQuarter = (date) => {
  const month = moment(date, "YYYY-MM-DD").month() + 1;
  if (month >= 1 && month <= 4) return 1;
  if (month >= 5 && month <= 8) return 2;
  return 3;
};

const incidenciasController = {};

// Obtener empleado por criterio de búsqueda
incidenciasController.getEmployee = async (req, res) => {
  const queryParam = req.params.queryParam;

  let searchCriteria;

  // Criterio especial para COMISIONADOS
  if (queryParam.toUpperCase() === "COMISIONADOS") {
    searchCriteria = {
      "STATUS_EMPLEADO.STATUS": "COM_SDCL",
    };
  }
  // Criterio especial para VACANTES
  else if (queryParam.toUpperCase() === "VACANTES") {
    searchCriteria = {
      status: 2,
    };
  } else if (/^\d+$/.test(queryParam)) {
    const paramNumTarjeta = parseInt(queryParam, 10);

    // Si contiene solo números, buscar por NUMTARJETA
    searchCriteria = {
      $and: [
        {
          $or: [
            { NUMTARJETA: paramNumTarjeta },
            { NUMTARJETA: { $regex: `^${paramNumTarjeta}`, $options: "i" } },
          ],
        },

        { status: 1 },
      ],
    };
  } else if (/^[a-zA-ZñÑ\s]+$/.test(queryParam)) {
    // Si contiene solo letras o espacios, buscar por nombres y apellidos por separado
    searchCriteria = {
      $or: [
        { NOMBRES: { $regex: queryParam, $options: "i" } },
        { APE_PAT: { $regex: queryParam, $options: "i" } },
        { APE_MAT: { $regex: queryParam, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: ["$APE_PAT", " ", "$APE_MAT", " ", "$NOMBRES"],
              },
              regex: queryParam,
              options: "i",
            },
          },
        },
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: ["$APE_PAT", " ", "$APE_MAT"],
              },
              regex: queryParam,
              options: "i",
            },
          },
        },
      ],
    };
  } else if (/^[a-zA-ZñÑ0-9]+$/.test(queryParam)) {
    // Si contiene una mezcla de números y letras, buscar por RFC o CURP
    searchCriteria = {
      $and: [
        {
          $or: [
            { RFC: { $regex: `^${queryParam}`, $options: "i" } },
            { CURP: { $regex: `^${queryParam}`, $options: "i" } },
          ],
        },
      ],
    };
  } else {
    // Si no cumple con ninguno de los criterios, devolver un error
    return res.status(200).send({ error: "Invalid search query", data: [] });
  }

  let currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  try {
    const user = req.user;

    // Determinar si se debe agregar el filtro status: 1
    const isSpecialCriteria =
      queryParam.toUpperCase() === "COMISIONADOS" ||
      queryParam.toUpperCase() === "VACANTES";

    const resultPlantilla = await query(
      "PLANTILLA",
      isSpecialCriteria ? searchCriteria : { ...searchCriteria, status: 1 }
    );
    const resultForanea = await query(
      "PLANTILLA_FORANEA",
      isSpecialCriteria ? searchCriteria : { ...searchCriteria, status: 1 }
    );
    const resultGafetes = await query("GAFETES_TEMPO", {
      ...searchCriteria,
    });
    const result = [...resultPlantilla, ...resultForanea, ...resultGafetes];
    if (result.length === 0) {
      return res.status(404).send({ error: "No data found" });
    }

    const userAction = {
      username: user.username,
      module: "AEI-PRO",
      action: `CONSULTÓ LA INFORMACION DE ${result.length} EMPLEADO(S)`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.send(result);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

incidenciasController.getEmployebyArea = async (req, res) => {
  const area = req.params.area;
  const queryParam = req.params.queryParam;
  let searchCriteria;
  if (/^\d+$/.test(queryParam)) {
    const paramNumTarjeta = parseInt(queryParam, 10);

    // Si contiene solo números, buscar por NUMTARJETA
    searchCriteria = {
      $and: [
        {
          $or: [
            { NUMTARJETA: paramNumTarjeta },
            { NUMTARJETA: { $regex: `^${paramNumTarjeta}`, $options: "i" } },
          ],
        },
        { AREA_RESP: area }, // Coincidencia con AREA_RESP
      ],
    };
  } else if (/^[a-zA-ZñÑ]+$/.test(queryParam)) {
    // Si contiene solo letras, buscar por NOMBRES, APE_PAT, APE_MAT o combinación de ellos
    searchCriteria = {
      $and: [
        {
          $or: [
            { NOMBRES: { $regex: queryParam, $options: "i" } },
            { APE_PAT: { $regex: queryParam, $options: "i" } },
            { APE_MAT: { $regex: queryParam, $options: "i" } },
            {
              $expr: {
                $regexMatch: {
                  input: {
                    $concat: ["$APE_PAT", " ", "$APE_MAT", " ", "$NOMBRES"],
                  },
                  regex: queryParam,
                  options: "i",
                },
              },
            },
          ],
        },
        { AREA_RESP: area }, // Coincidencia con AREA_RESP
      ],
    };
  } else if (/^[a-zA-ZñÑ0-9]+$/.test(queryParam)) {
    // Si contiene una mezcla de números y letras, buscar por RFC o CURP
    searchCriteria = {
      $and: [
        {
          $or: [
            { RFC: { $regex: `^${queryParam}`, $options: "i" } },
            { CURP: { $regex: `^${queryParam}`, $options: "i" } },
          ],
        },
        { AREA_RESP: area }, // Coincidencia con AREA_RESP
      ],
    };
  } else {
    // Si no cumple con ninguno de los criterios, devolver un error
    return res.status(404).send({ error: "Invalid search query", data: [] });
  }
  let currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  try {
    const user = req.user;
    const result = await query("PLANTILLA", { ...searchCriteria, status: 1 });
    if (result.length === 0) {
      return res.status(404).send({ error: "No data found" });
    }

    const data = result[0];
    const userAction = {
      username: user.username,
      module: "AEI-PRO",
      action: `CONSULTÓ LA INFORMACION DE "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    if (result.length === 0) {
      res.status(404).send({ error: "No data found" });
    } else {
      res.send(result);
    }
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

// Obtener perfil del empleado y calcular días restantes
incidenciasController.getProfile = async (req, res) => {
  const id = req.params.id;
  const user = req.user;
  const maxDaysPerQuarter = 4;
  const maxAccumulatedDays = 6;

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

    // Obtener el cuatrimestre y año actuales
    const currentQuarter = getCustomQuarter(moment().format("YYYY-MM-DD"));
    const currentYear = moment().year();

    // Obtener la bitácora del empleado
    const bitacora = await query("BITACORA", {
      id_plantilla: emp._id,
    });
    emp.bitacora = bitacora;

    // Obtener permisos del empleado en el año actual y, si aplica, del año anterior
    const previousQuarter = currentQuarter === 1 ? 3 : currentQuarter - 1;

    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
      AÑO: currentYear,
    });

    const justificantes = await query("JUSTIFICACIONES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const incapacidades = await query("INCAPACIDADES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const permisosExt = await query("PERMISOS_EXT", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const comisiones = await query("COMISIONES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });

    let leftDays = maxDaysPerQuarter; // Comenzar con 4 días

    const hasPreviousQuarterPermits = currentQuarter === 1
      ? false
      : permits.some(
        (permit) => permit.CUATRIMESTRE === previousQuarter
      );

    if (!hasPreviousQuarterPermits && currentQuarter !== 1) {
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

    // Agregar la propiedad leftDays al objeto employee
    emp.leftDays = leftDays;
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

// Actualizar el estado del empleado
incidenciasController.updateStatusEmployee = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const STATUS_EMPLEADO = {
    FOLIO: data.FOLIO || "",
    STATUS: data.STATUS,
    LUGAR_COMISIONADO: data.LUGAR_COMISIONADO,
    DESDE: data.DESDE,
    HASTA: data.HASTA,
    OBSERVACIONES: data.OBSERVACIONES,
    PROYECTO: data.PROYECTO || "",
  };
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });
  const userAction = {
    username: user.username,
    module: "AEI-EE",
    action: `CAMBIO DE STATUS DEL EMPLEADO "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
    timestamp: currentDateTime,
  };
  try {
    // Buscar en PLANTILLA y PLANTILLA_FORANEA
    const [resultPlantilla = [], resultForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(data._id) }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(data._id) }),
    ]);

    const result = resultPlantilla.length
      ? resultPlantilla
      : resultForanea.length
        ? resultForanea
        : [];
    if (!result || result.length === 0) {
      return res.status(404).send({ error: "Employee not found" });
    }

    // Determinar colección a actualizar
    const targetCollection = resultPlantilla.length
      ? "PLANTILLA"
      : "PLANTILLA_FORANEA";

    const prevStatus = result[0].STATUS_EMPLEADO || {};
    const hsy_data = {
      ...STATUS_EMPLEADO,
      currentDateTime,
      last_status: prevStatus.STATUS || null,
      last_lugarComisionado: prevStatus.LUGAR_COMISIONADO || null,
      last_desde: prevStatus.DESDE || null,
      last_hasta: prevStatus.HASTA || null,
      last_proyecto: prevStatus.PROYECTO || null,
      last_folio: prevStatus.FOLIO || null,
      id_employee: new ObjectId(data._id),
    };
    delete hsy_data._id;

    await insertOne("HSY_STATUS_EMPLEADO", hsy_data);

    const updateFields = { STATUS_EMPLEADO };
    if (data.AREA_RESP !== undefined && data.AREA_RESP !== null) {
      updateFields.AREA_RESP = data.AREA_RESP;
    }

    await updateOne(
      targetCollection,
      { _id: new ObjectId(data._id) },
      { $set: updateFields }
    );
    await insertOne("USER_ACTIONS", userAction);
    const employee = result[0];
    res.status(200).send({
      message: "Employee status updated successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Error updating employee status:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating the employee status" });
  }
};

// Crear un nuevo permiso económico
incidenciasController.newEconomicPermit = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    _id,
    AREA_RESP,
    RFC,
    ID_CTRL_ASIST,
    PROYECTO,
    TIPONOM,
    NUMTARJETA,
    CLAVECAT,
    DESDE,
    HASTA,
    NUM_DIAS,
    OBSERVACIONES,
    CLAVE_PERMISO,
    CLAVE_GOCE_SUELDO,
    DIAS_DESCONTAR,
    QUINCENA,
    NOMBRE,
  } = req.body;

  const userAction = {
    username: user.username,
    module: "AEI-PE",
    action: `CREÓ UN NUEVO PERMISO ECONÓMICO AL EMPLEADO "${NOMBRE}"`,
    timestamp: currentDateTime,
  };

  const maxDaysPerQuarter = 4;
  const maxAccumulatedDays = 6;

  try {
    // Validar que no exista un permiso con las mismas fechas
    const existingPermit = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
      DESDE,
      HASTA,
    });

    if (existingPermit.length > 0) {
      return res.status(409).send({
        error: "Ya existe un permiso con las mismas fechas para este empleado.",
      });
    }

    // Validar que las fechas DESDE y HASTA no crucen cuatrimestres (usar función global)
    const desdeQuarter = getCustomQuarter(DESDE);
    const hastaQuarter = getCustomQuarter(HASTA);
    const desdeYear = moment(DESDE, "YYYY-MM-DD").year();
    const hastaYear = moment(HASTA, "YYYY-MM-DD").year();

    if (desdeQuarter !== hastaQuarter || desdeYear !== hastaYear) {
      return res.status(407).send({
        error: "Las fechas DESDE y HASTA no pueden cruzar cuatrimestres.",
      });
    }

    const currentQuarter = desdeQuarter;
    const currentYear = hastaYear;

    // Determinar cuatrimestre y año anteriores para permitir acumulación entre año anterior y enero
    const previousQuarter = currentQuarter === 1 ? 3 : currentQuarter - 1;

    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
      AÑO: currentYear,  // Solo año actual
    });

    // Calcular los días restantes según las reglas de los cuatrimestres
    // Máximo 4 días por cuatrimestre, pero se acumulan 2 días si no se usaron en el cuatrimestre anterior
    let leftDays = maxDaysPerQuarter; // Comenzar con 4 días

    // Verificar si el cuatrimestre anterior tuvo permisos
    const hasPreviousQuarterPermits = currentQuarter === 1
      ? false
      : permits.some(
        (permit) => permit.CUATRIMESTRE === previousQuarter
      );

    // Si no hay permisos en el cuatrimestre anterior, agregar 2 días acumulados
    if (!hasPreviousQuarterPermits && currentQuarter !== 1) {
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

    console.log(`Cuatrimestre actual: ${currentQuarter}`);
    console.log(
      `Permisos previos en cuatrimestre anterior: ${hasPreviousQuarterPermits}`
    );
    console.log(`Días disponibles: ${leftDays}`);

    // Validar si el nuevo permiso excede los días restantes permitidos
    if (NUM_DIAS > leftDays) {
      return res.status(400).send({
        error: `No se puede crear el permiso. Días restantes permitidos: ${leftDays}.`,
      });
    }

    // Si tiene días disponibles, validar las demás condiciones
    // Obtener todos los días del rango solicitado
    const rangeDays = [];
    let currentDate = moment(DESDE, "YYYY-MM-DD");
    const endDate = moment(HASTA, "YYYY-MM-DD");

    while (currentDate.isSameOrBefore(endDate)) {
      rangeDays.push(currentDate.format("DD-MM-YYYY"));
      currentDate.add(1, "days");
    }

    // Consultar los días del rango en CALENDARIO
    const calendarData = await query("CALENDARIO", {
      FECHA: { $in: rangeDays },
    });

    // Validar si algún día del rango es inhábil
    const inhabilDays = calendarData.filter(
      (day) => !day.HABIL && day.DIA !== "SÁBADO" && day.DIA !== "DOMINGO"
    );
    if (inhabilDays.length > 0) {
      return res.status(405).send({
        error:
          "No se puede solicitar un permiso en un rango que incluya días inhábiles que no sean sábado o domingo.",
        inhabilDays,
      });
    }

    // Consultar el día anterior a DESDE y el día posterior a HASTA
    const [prevDayData, nextDayData] = await Promise.all([
      query("CALENDARIO", {
        FECHA: moment(DESDE).subtract(1, "days").format("DD-MM-YYYY"),
      }),
      query("CALENDARIO", {
        FECHA: moment(HASTA).add(1, "days").format("DD-MM-YYYY"),
      }),
    ]);

    // Validar si el día anterior o posterior es inhábil (excepto fines de semana)
    const prevDayIsWeekend =
      prevDayData.length > 0 &&
      (prevDayData[0].DIA === "SÁBADO" || prevDayData[0].DIA === "DOMINGO");
    const nextDayIsWeekend =
      nextDayData.length > 0 &&
      (nextDayData[0].DIA === "SÁBADO" || nextDayData[0].DIA === "DOMINGO");

    if (
      (prevDayData.length > 0 && !prevDayData[0].HABIL && !prevDayIsWeekend) ||
      (nextDayData.length > 0 && !nextDayData[0].HABIL && !nextDayIsWeekend)
    ) {
      return res.status(406).send({
        error:
          "Debe laborar un día antes y un día después de un día inhábil para solicitar el permiso.",
      });
    }

    // Crear el nuevo permiso si pasa todas las validaciones
    const permitData = {
      id_empoyee: _id,
      AREA_RESP,
      RFC,
      ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
      PROYECTO,
      TIPONOM,
      NUMTARJETA,
      CLAVECAT,
      DESDE,
      HASTA,
      NUM_DIAS,
      OBSERVACIONES,
      CLAVE_PERMISO,
      CUATRIMESTRE: currentQuarter,
      AÑO: currentYear,
      CLAVE_GOCE_SUELDO,
      DIAS_DESCONTAR,
      QUINCENA,
      NOMBRE,
      FECHA_CAPTURA: moment().format("YYYY/MM/DD"), // Add capture date
    };
    await insertOne("USER_ACTIONS", userAction);
    await insertOne("PERMISOS_ECONOMICOS", permitData);
    res.send({ message: "Permit created", data: permitData });
  } catch (error) {
    console.error("Error creating permit:", error);
    res
      .status(500)
      .send({ error: "An error occurred while creating the permit" });
  }
};
// Crear un nuevo justificante
incidenciasController.newJustification = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  let justificationData; // Declare justificationData in the correct scope
  try {
    const {
      ID_CTRL_ASIST,
      _id,
      FECHA,
      HORA_DESDE,
      HORA_HASTA,
      OBSERVACIONES,
      NUMTARJETA,
      FOLIO,
      TIPO_COMPROBANTE,
      HORARIO_ENTRADA,
      HORARIO_SALIDA,
      DESDE,
      HASTA,
      NUM_DIAS
    } = req.body;

    // Crear el nuevo justificante
    justificationData = {
      id_empoyee: _id,
      ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
      FECHA,
      ...(HORA_DESDE ? { HORA_DESDE } : {}),
      ...(HORA_HASTA ? { HORA_HASTA } : {}),
      ...(HORARIO_ENTRADA ? { HORARIO_ENTRADA } : {}),
      ...(HORARIO_SALIDA ? { HORARIO_SALIDA } : {}),
      ...(DESDE ? { DESDE } : {}),
      ...(HASTA ? { HASTA } : {}),
      ...(NUM_DIAS ? { NUM_DIAS } : {}),
      OBSERVACIONES,
      AÑO: moment(FECHA).year(),
      NUMTARJETA,
      FOLIO,
      TIPO_COMPROBANTE,
    };
    // Obtener justificantes existentes del empleado en el año actual
    const userAction = {
      username: user.username,
      module: "AEI-JT",
      action: `CREÓ UN NUEVO JUSTIFICANTE DEL EMPLEADO CON TARJETA "${NUMTARJETA}"`,
      timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
    };
    await insertOne("USER_ACTIONS", userAction);
    await insertOne("JUSTIFICACIONES", justificationData);
  } catch (error) {
    console.error("Error creating justification:", error);
    res
      .status(500)
      .send({ error: "An error occurred while creating the justification" });
    return;
  }
  res
    .status(200)
    .send({ message: "Justification created", data: justificationData });
};
// Crear una nueva incapacidad
incidenciasController.newInability = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    _id,
    DESDE,
    HASTA,
    NUM_DIAS,
    ID_CTRL_ASIST,
    NUMTARJETA,
    OBSERVACIONES,
  } = req.body;

  // Crear el nuevo registro de incapacidad
  const incapacidadData = {
    id_empoyee: _id,
    DESDE,
    HASTA,
    NUM_DIAS,
    ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
    AÑO: moment(DESDE).year(),
    NUMTARJETA,
    OBSERVACIONES,
  };
  const userAction = {
    username: user.username,
    module: "AEI-IP",
    action: `CREÓ UNA NUEVA INCAPACIDAD DEL EMPLEADO CON TARJETA  "${NUMTARJETA}"`,
    timestamp: currentDateTime,
  };
  try {
    const eployee = await query("PLANTILLA", {
      ID_CTRL_ASIST: incapacidadData.ID_CTRL_ASIST,
    });
    await insertOne("INCAPACIDADES", incapacidadData);
    await insertOne("USER_ACTIONS", userAction);
    res
      .status(200)
      .send({ message: "Inability created", data: incapacidadData });
  } catch (error) {
    console.error("Error creating incapacity:", error);
    res
      .status(500)
      .send({ error: "An error occurred while creating the incapacity" });
  }
};
// Crear una nueva comisión
incidenciasController.newCommission = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    _id,
    ID_CTRL_ASIST,
    COMISIONES,
    NUMTARJETA,
    OBSERVACIONES
  } = req.body;

  // Crear el nuevo registro de comisión
  const comisionData = {
    id_empoyee: _id,
    ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
    COMISIONES,
    OBSERVACIONES
  };

  const userAction = {
    username: user.username,
    module: "AEI-IP",
    action: `CREÓ UNA NUEVA COMISIÓN DEL EMPLEADO CON TARJETA "${NUMTARJETA}"`,
    timestamp: currentDateTime,
  };

  try {
    // Buscar empleado en PLANTILLA y PLANTILLA_FORANEA
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
      res.status(404).send({ error: "No data found" });
      return;
    }

    await insertOne("COMISIONES", comisionData);
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({ message: "Commission created", data: comisionData });
  } catch (error) {
    console.error("Error creating commission:", error);
    res.status(500).send({ error: "An error occurred while creating the commission" });
  }
};

incidenciasController.saveIncidencia = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-CAI",
    action: `GUARDÓ INCIDENCIA DEL EMPLEADO "${data.NOMBRE}"`,
    timestamp: currentDateTime,
  };

  if (data.ID_CTRL_ASIST) {
    data.ID_CTRL_ASIST = new ObjectId(data.ID_CTRL_ASIST);
  }

  try {
    // Check if an incidence already exists with the same RFC and QUINCENA
    const existingIncidence = await query("INCIDENCIAS", {
      RFC: data.RFC,
      QUINCENA: data.QUINCENA,
    });

    if (existingIncidence.length > 0) {
      // Update the existing incidence
      const { _id, ...updateData } = data; // Exclude _id from the update data
      await updateOne(
        "INCIDENCIAS",
        { _id: existingIncidence[0]._id },
        { $set: updateData }
      );
    } else {
      // Create a new incidence document
      if (!data._id) {
        data._id = new ObjectId(); // Generate a new unique _id if not provided
      }
      await insertOne("INCIDENCIAS", data);
    }

    // Log the user action
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).send({
      message: "Incidence saved successfully",
      data,
    });
  } catch (error) {
    console.error("Error saving incidence:", error);
    res
      .status(500)
      .send({ error: "An error occurred while saving the incidence" });
  }
};
incidenciasController.newForeigner = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-CL",
    action: `CREÓ UN NUEVO REGISTRO DE PLANTILLA FORANEA`,
    timestamp: currentDateTime,
  };
  const data = req.body;
  try {
    const plazaPlantilla = await query("PLANTILLA", { NUMPLA: data.NUMPLA });
    const plazaForanea = await query("PLANTILLA_FORANEA", {
      NUMPLA: data.NUMPLA,
    });
    if (plazaPlantilla.length > 0 || plazaForanea.length > 0) {
      return res.status(409).json({
        message: "El número de plaza ya está registrado en plantilla",
        errorCode: "DUPLICATE_NUMPLA",
      });
    }

    if (data.NUMTARJETA !== null) {
      const tarjetaPlantilla = await query("PLANTILLA", {
        NUMTARJETA: data.NUMTARJETA,
        AREA_RESP: data.AREA_RESP,
      });
      const tarjetaForanea = await query("PLANTILLA_FORANEA", {
        NUMTARJETA: data.NUMTARJETA,
        AREA_RESP: data.AREA_RESP,
      });
      if (tarjetaPlantilla.length > 0 || tarjetaForanea.length > 0) {
        return res.status(409).json({
          message:
            "El número de tarjeta ya está registrado en el área seleccionada",
          errorCode: "DUPLICATE_NUMTARJETA",
        });
      }
    }

    const plantillaId = new ObjectId();
    const idBitacora = new ObjectId();
    const idCtrlAsist = new ObjectId();

    data._id = plantillaId;
    data.status = 1;
    data.ID_CTRL_ASIST = idCtrlAsist;
    data.ID_BITACORA = idBitacora;

    await insertOne("PLANTILLA_FORANEA", data);

    const bitacoraDoc = {
      _id: idBitacora,
      personal: [],
      incidencias: [],
      nomina: [],
      archivo: [],
      tramites: [],
      capacitaciones: [],
      id_plantilla: plantillaId,
    };

    await insertOne("BITACORA", bitacoraDoc);
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({ message: "Foreigner created successfully", data });
  } catch (error) {
    console.error("Error creating foreigner:", error);
    res
      .status(500)
      .send({ error: "An error occurred while creating the foreigner" });
  }
};
//update
incidenciasController.updateEconomicPermit = async (req, res) => {
  const { _id, ...updateData } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  const currentQuarter = getCustomQuarter(updateData.DESDE);
  const currentYear = moment(updateData.DESDE, "YYYY-MM-DD").year();

  try {
    // Verificar si el permiso económico existe
    const existingPermit = await query("PERMISOS_ECONOMICOS", {
      _id: new ObjectId(_id),
    });

    if (!existingPermit || existingPermit.length === 0) {
      return res.status(404).send({ error: "Economic permit not found" });
    }

    // Validar que no exista un permiso con las mismas fechas
    const overlappingPermit = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(updateData.ID_CTRL_ASIST),
      DESDE: updateData.DESDE,
      HASTA: updateData.HASTA,

      _id: { $ne: new ObjectId(_id) }, // Excluir el permiso actual
    });

    if (overlappingPermit.length > 0) {
      return res.status(409).send({
        error: "Ya existe un permiso con las mismas fechas para este empleado.",
      });
    }

    const permitData = {
      ...existingPermit[0],
      ...updateData,
      CUATRIMESTRE: currentQuarter,
      AÑO: currentYear,
    };

    const maxDaysPerQuarter = 4;
    const maxAccumulatedDays = 6;

    const desdeQuarter = getCustomQuarter(permitData.DESDE);
    const hastaQuarter = getCustomQuarter(permitData.HASTA);
    const desdeYear = moment(permitData.DESDE, "YYYY-MM-DD").year();
    const hastaYear = moment(permitData.HASTA, "YYYY-MM-DD").year();

    if (desdeQuarter !== hastaQuarter || desdeYear !== hastaYear) {
      return res.status(407).send({
        error: "Las fechas DESDE y HASTA no pueden cruzar cuatrimestres.",
      });
    }

    // Obtener permisos existentes del empleado en el año actual
    // Incluir permisos del año anterior si el cuatrimestre actual es el 1 (enero-abril)
    const previousQuarter = currentQuarter === 1 ? 3 : currentQuarter - 1;

    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(permitData.ID_CTRL_ASIST),
      AÑO: currentYear,  // Solo año actual
    });

    // Calcular los días restantes según las reglas de los cuatrimestres
    // Máximo 4 días por cuatrimestre, pero se acumulan 2 días si no se usaron en el cuatrimestre anterior
    permitData.CUATRIMESTRE = currentQuarter;
    // Calcular los días restantes según las reglas de los cuatrimestres
    let leftDays = maxDaysPerQuarter; // Comenzar con 4 días

    const hasPreviousQuarterPermits = currentQuarter === 1
      ? false
      : permits.some(
        (p) =>
          p.CUATRIMESTRE === previousQuarter &&
          p._id.toString() !== _id
      );

    // Si no hay permisos en el cuatrimestre anterior, permitir acumulación a 6 días
    if (!hasPreviousQuarterPermits && currentQuarter !== 1) {
      leftDays = maxAccumulatedDays; // 6 días
    }

    // Restar los días ya usados en el cuatrimestre actual (excluir el permiso que se está actualizando) y solo del año actual
    permits.forEach((p) => {
      if (
        p._id.toString() !== _id &&
        p.CUATRIMESTRE === currentQuarter &&
        p.AÑO === currentYear
      ) {
        leftDays -= p.NUM_DIAS || 0;
      }
    });

    if (leftDays < 0) leftDays = 0;

    // Validar si el permiso actualizado excede los días restantes permitidos
    if (permitData.NUM_DIAS > leftDays) {
      const exceededPermits = permits
        .filter((permit) => permit.CUATRIMESTRE === permitData.CUATRIMESTRE)
        .map((permit) => ({ DESDE: permit.DESDE, NUM_DIAS: permit.NUM_DIAS }));

      return res.status(400).send({
        error: `No se puede actualizar el permiso. Días restantes permitidos: ${leftDays}.`,
        exceededPermits,
      });
    }

    // Obtener todos los días del rango solicitado
    const rangeDays = [];
    let currentDate = moment(permitData.DESDE, "YYYY-MM-DD");
    const endDate = moment(permitData.HASTA, "YYYY-MM-DD");

    while (currentDate.isSameOrBefore(endDate)) {
      rangeDays.push(currentDate.format("DD-MM-YYYY"));
      currentDate.add(1, "days");
    }

    // Consultar los días del rango en CALENDARIO
    const calendarData = await query("CALENDARIO", {
      FECHA: { $in: rangeDays },
    });

    // Validar si algún día del rango es inhábil
    const inhabilDays = calendarData.filter(
      (day) => !day.HABIL && day.DIA !== "SÁBADO" && day.DIA !== "DOMINGO"
    );
    if (inhabilDays.length > 0) {
      return res.status(405).send({
        error:
          "No se puede actualizar un permiso en un rango que incluya días inhábiles entre semana.",
        inhabilDays,
      });
    }

    // Consultar el día anterior a DESDE y el día posterior a HASTA
    const [prevDayData, nextDayData] = await Promise.all([
      query("CALENDARIO", {
        FECHA: moment(permitData.DESDE)
          .subtract(1, "days")
          .format("DD-MM-YYYY"),
      }),
      query("CALENDARIO", {
        FECHA: moment(permitData.HASTA).add(1, "days").format("DD-MM-YYYY"),
      }),
    ]);

    // Validar si el día anterior o posterior es inhábil (excepto fines de semana)
    const prevDayIsWeekend =
      prevDayData.length > 0 &&
      (prevDayData[0].DIA === "SÁBADO" || prevDayData[0].DIA === "DOMINGO");
    const nextDayIsWeekend =
      nextDayData.length > 0 &&
      (nextDayData[0].DIA === "SÁBADO" || nextDayData[0].DIA === "DOMINGO");

    if (
      (prevDayData.length > 0 && !prevDayData[0].HABIL && !prevDayIsWeekend) ||
      (nextDayData.length > 0 && !nextDayData[0].HABIL && !nextDayIsWeekend)
    ) {
      return res.status(406).send({
        error:
          "Debe laborar un día antes y un día después de un día inhábil para actualizar el permiso.",
      });
    }
    const userAction = {
      username: user.username,
      module: "AEI-PE",
      action: `ACTUALIZÓ UN PERMISO ECONÓMICO DEL EMPLEADO "${permitData.NOMBRE}"`,
      timestamp: currentDateTime,
    };

    // Actualizar el permiso económico
    await updateOne(
      "PERMISOS_ECONOMICOS",
      { _id: new ObjectId(_id) },
      { $set: permitData }
    );
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({
      message: "Economic permit updated successfully",
      data: permitData,
    });
  } catch (error) {
    console.error("Error updating economic permit:", error);
    res.status(500).send({
      error: "An error occurred while updating the economic permit",
    });
  }
};
incidenciasController.updateJustification = async (req, res) => {
  const { _id, ...updateData } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-JT",
    action: `ACTUALIZÓ UN JUSTIFICANTE DEL EMPLEADO CON TARJETA "${updateData.NUMTARJETA}"`,
    timestamp: currentDateTime,
  };

  try {
    const result = await query("JUSTIFICACIONES", {
      _id: new ObjectId(_id),
    });

    if (!result || result.length === 0) {
      return res.status(404).send({ error: "Justification not found" });
    }

    await updateOne(
      "JUSTIFICACIONES",
      { _id: new ObjectId(_id) },
      { $set: updateData }
    );
    const employee = result[0];
    res.status(200).send({
      message: "Justification updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating justification:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating the justification" });
  }
};
incidenciasController.updateInability = async (req, res) => {
  const { _id, ...updateData } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-IP",
    action: `ACTUALIZÓ UNA INCAPACIDAD DEL EMPLEADO CON TARJETA "${updateData.NUMTARJETA}"`,
    timestamp: currentDateTime,
  };

  try {
    const result = await query("INCAPACIDADES", {
      _id: new ObjectId(_id),
    });

    if (!result || result.length === 0) {
      return res.status(404).send({ error: "Inability not found" });
    }

    const employee = result[0];
    await updateOne(
      "INCAPACIDADES",
      { _id: new ObjectId(_id) },
      { $set: updateData }
    );
    res.status(200).send({
      message: "Inability updated successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Error updating inability:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating the inability" });
  }
};
incidenciasController.updateCommission = async (req, res) => {
  const { _id, ...updateData } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-IP",
    action: `ACTUALIZÓ UNA COMISIÓN DEL EMPLEADO CON TARJETA "${updateData.NUMTARJETA}"`,
    timestamp: currentDateTime,
  };

  try {
    const result = await query("COMISIONES", {
      _id: new ObjectId(_id),
    });

    if (!result || result.length === 0) {
      return res.status(404).send({ error: "Commission not found" });
    }

    const employee = result[0];
    await updateOne(
      "COMISIONES",
      { _id: new ObjectId(_id) },
      { $set: updateData }
    );
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({
      message: "Commission updated successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Error updating commission:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating the commission" });
  }
};
// incidenciasController.updateIncidencia = async (req, res) => {
//   console.log(req.body);

//   const data = req.body;
//   const user = req.user;
//   const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
//   const userAction = {
//     username: user.username,
//     module: "AEI-PRO",
//     action: `ACTUALIZAR INCIDENCIA DEL EMPLEADO "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
//     timestamp: currentDateTime,
//   };
//   try {
//     const result = await query("INCIDENCIAS", {
//       _id: new ObjectId(data._id),
//       QUINCENA: data.QUINCENA,
//     });

//     if (!result || result.length === 0) {
//       return res.status(404).send({ error: "Incidence not found" });
//     }
//     const objectData = {
//       NOMBRE: data.NOMBRE,
//       APE_MAT: data.APE_MAT,
//       APE_PAT: data.APE_PAT,
//       ID_CTRL_ASIST: new ObjectId(data.ID_CTRL_ASIST),
//       QUINCENA: data.QUINCENA,
//       INCIDENCIAS: data.INCIDENCIAS,
//       CONTADORES: data.CONTADORES,
//     };
//     await updateOne(
//       "INCIDENCIAS",
//       { _id: new ObjectId(data._id), QUINCENA: data.QUINCENA },
//       { $set: objectData }
//     );
//     await insertOne("USER_ACTIONS", userAction);
//     const employee = result[0];
//     res.status(200).send({
//       message: "Incidence updated successfully",
//       data: employee,
//     });
//   } catch (error) {
//     console.error("Error updating incidence:", error);
//     res
//       .status(500)
//       .send({ error: "An error occurred while updating the incidence" });
//   }
// };

//delete

incidenciasController.deleteJustification = async (req, res) => {
  const { id } = req.params;

  try {
    const permitData = await query("JUSTIFICACIONES", {
      _id: new ObjectId(id),
    });
    const result = await deleteOne("JUSTIFICACIONES", {
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Justification not found" });
    }
    const employee = result;
    res
      .status(200)
      .send({ message: "Justification deleted", data: permitData[0] });
  } catch (error) {
    console.error("Error deleting justification:", error);
    const employee = result[0];
    res.status(500).send({
      error: "An error occurred while deleting the justification",
      _id: employee.id_empoyee,
    });
  }
};

incidenciasController.deleteInability = async (req, res) => {
  const { id } = req.params;

  try {
    const permitData = await query("INCAPACIDADES", {
      _id: new ObjectId(id),
    });
    const result = await deleteOne("INCAPACIDADES", { _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Inability not found" });
    }
    const employee = result;
    res.status(200).send({ message: "Inability deleted", data: permitData[0] });
  } catch (error) {
    console.error("Error deleting inability:", error);
    res
      .status(500)
      .send({ error: "An error occurred while deleting the inability" });
  }
};

incidenciasController.deleteEconomicPermit = async (req, res) => {
  const { id } = req.params;

  try {
    const permitData = await query("PERMISOS_ECONOMICOS", {
      _id: new ObjectId(id),
    });
    const result = await deleteOne("PERMISOS_ECONOMICOS", {
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Economic permit not found" });
    }
    const employee = result;
    res.status(200).send({
      message: "Economic permit deleted",
      data: permitData[0],
    });
  } catch (error) {
    console.error("Error deleting economic permit:", error);
    res
      .status(500)
      .send({ error: "An error occurred while deleting the economic permit" });
  }
};
incidenciasController.getIncidencias = async (req, res) => {
  const id = req.params.id;
  try {
    const incidencias = await query("INCIDENCIAS", {
      ID_CTRL_ASIST: new ObjectId(id),
    });

    res.send(incidencias);
  } catch (error) {
    console.error("Error fetching incidencias:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};
incidenciasController.asignarTarjeta = async (req, res) => {
  const { _id, NUMTARJETA, TURNOMAT, TURNOVES, AREA_RESP } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    // Buscar empleado en ambas colecciones
    const [resultPlantilla = [], resultForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(_id) }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(_id) }),
    ]);

    const result = resultPlantilla.length
      ? resultPlantilla
      : resultForanea.length
        ? resultForanea
        : [];
    if (!result || result.length === 0) {
      return res.status(404).send({ error: "Employee not found" });
    }

    const employee = result[0];
    const targetCollection = resultPlantilla.length
      ? "PLANTILLA"
      : "PLANTILLA_FORANEA";
    const areaToCheck = AREA_RESP ?? employee.AREA_RESP;

    // Normalizar NUMTARJETA para coincidir con el tipo almacenado en DB si es numérico
    const normalizedNUMTARJETA = !isNaN(Number(NUMTARJETA))
      ? Number(NUMTARJETA)
      : NUMTARJETA;

    // Excluir el propio documento al buscar duplicados
    const excludeCurrent = { _id: { $ne: new ObjectId(_id) } };
    const tarjetaPlantilla = await query("PLANTILLA", {
      NUMTARJETA: normalizedNUMTARJETA,
      AREA_RESP: areaToCheck,
      ...excludeCurrent,
    });
    const tarjetaForanea = await query("PLANTILLA_FORANEA", {
      NUMTARJETA: normalizedNUMTARJETA,
      AREA_RESP: areaToCheck,
      ...excludeCurrent,
    });

    if (tarjetaPlantilla.length > 0 || tarjetaForanea.length > 0) {
      return res.status(409).json({
        message:
          "El número de tarjeta ya está registrado en el área seleccionada",
        errorCode: "DUPLICATE_NUMTARJETA",
      });
    }

    await updateOne(
      targetCollection,
      { _id: new ObjectId(_id) },
      { $set: { NUMTARJETA: normalizedNUMTARJETA, TURNOMAT, TURNOVES } }
    );

    const userAction = {
      username: user.username,
      module: "AEI-PRO",
      action: `ASIGNÓ TARJETA "${NUMTARJETA}" AL EMPLEADO "${employee.NOMBRES} ${employee.APE_PAT} ${employee.APE_MAT}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).send({
      message: "Card assigned successfully",
      data: { _id, NUMTARJETA: normalizedNUMTARJETA },
    });
  } catch (error) {
    console.error("Error assigning card:", error);
    res
      .status(500)
      .send({ error: "An error occurred while assigning the card" });
  }
};
incidenciasController.deleteIncidencia = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-PRO",
    action: `ELIMINÓ INCIDENCIA DEL EMPLEADO CON ID "${id}"`,
    timestamp: currentDateTime,
  };
  try {
    const result = await deleteOne("INCIDENCIAS", { _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Incidence not found" });
    }
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({ message: "Incidence deleted successfully" });
  } catch (error) {
    console.error("Error deleting incidence:", error);
    res
      .status(500)
      .send({ error: "An error occurred while deleting the incidence" });
  }
};
incidenciasController.deleteCommission = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-PRO",
    action: `ELIMINÓ COMISIÓN DEL EMPLEADO CON ID "${id}"`,
    timestamp: currentDateTime,
  };

  try {

    const dataResult = await query("COMISIONES", { _id: new ObjectId(id) });
    if (dataResult.length === 0) {
      return res.status(404).send({ error: "Commission not found" });
    }
    // Crear el nuevo registro de comisión
    const comisionData = {
      id_empoyee: dataResult[0].id_empoyee,
    };

    const result = await deleteOne("COMISIONES", { _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ error: "Commission not found" });
    }
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({ message: "Commission deleted successfully", data: comisionData });
  } catch (error) {
    console.error("Error deleting commission:", error);
    res
      .status(500)
      .send({ error: "An error occurred while deleting the commission" });
  }
};
incidenciasController.getAllIncidencias = async (req, res) => {
  try {
    const incidencias = await query("INCIDENCIAS", {});
    res.status(200).send(incidencias);
  } catch (error) {
    console.error("Error fetching incidencias:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};
incidenciasController.getUserActionsIncidencias = async (req, res) => {
  try {
    const actions = await query("USER_ACTIONS", {});
    const users = await query("USUARIOS", {});

    const filteredActions = actions.filter((a) => {
      const text = (a.action || "").toString().trim();
      const module = (a.module || "").toString().trim();
      return !/^CONSULTÓ/i.test(text) && /^AEI/i.test(module);
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
// Función para obtener todos los empleados
incidenciasController.getAllEmployeesByArea = async (req, res) => {
  const area = req.params.area;

  try {
    const criteria = {
      AREA_RESP: area,
      status: 1,
      NUMTARJETA: { $exists: true, $nin: [null, ""] },
      TIPONOM: { $nin: ["FMM", "MMS"] },
      "STATUS_EMPLEADO.STATUS": { $nin: ["EXIMA", "COM_LAB"] },
    };

    const [plantilla = [], foranea = []] = await Promise.all([
      query("PLANTILLA", criteria),
      query("PLANTILLA_FORANEA", criteria),
    ]);

    const employees = [...plantilla, ...foranea];
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

incidenciasController.printAsistenceCards = async (req, res) => {
  const { AREA_RESP, TARJETAS, PRINTER, YEAR, FORTNIGHT } = req.body;

  if (
    !TARJETAS ||
    !Array.isArray(TARJETAS) ||
    TARJETAS.length === 0
  ) {
    return res.status(400).json({
      message:
        "Los números de tarjetas a imprimir son obligatorios y debe ser un array.",
    });
  }

  const queryFilter = {
    NUMTARJETA: { $in: TARJETAS.map((num) => parseInt(num, 10)) },
    AREA_RESP: AREA_RESP ? { $eq: AREA_RESP } : undefined,
  };

  const [plantilla = [], foranea = []] = await Promise.all([
    query("PLANTILLA", queryFilter),
    query("PLANTILLA_FORANEA", queryFilter),
  ]);

  let employees = [...plantilla, ...foranea];

  if (employees.length === 0) {
    return res.status(404).json({ message: "No hay empleados para los parámetros especificados" });
  }
  try {
    const {
      employees: employeesBody,
      printerPosition = PRINTER || "DERECHA",
      selectedYear = YEAR,
      outputDir = "./pdfs",
    } = req.body || {};

    if (Array.isArray(employeesBody) && employeesBody.length) {
      employees = employeesBody;
    }

    // Crear directorio de salida si no existe
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Función para convertir número de quincena (1-24) a { month, half }
    const quinaenaNumToMonthHalf = (quincenaNum) => {
      const num = Number(quincenaNum);
      if (num < 1 || num > 24) return null;

      const month = Math.ceil(num / 2);
      const half = num % 2 === 0 ? 2 : 1;

      return { month, half };
    };

    let chosenQuincenas = [];

    // Convertir FORTNIGHT (números) a array de { month, half }
    if (Array.isArray(FORTNIGHT) && FORTNIGHT.length > 0) {
      chosenQuincenas = FORTNIGHT
        .map(quinaenaNumToMonthHalf)
        .filter(q => q !== null);
    }

    // Si no hay quincenas válidas, generar la siguiente
    if (chosenQuincenas.length === 0) {
      const now = new Date();
      const day = now.getDate();
      const currentMonth = now.getMonth() + 1;
      const isFirstHalf = day <= 15;
      if (isFirstHalf) {
        chosenQuincenas = [{ month: currentMonth, half: 2 }];
      } else {
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        chosenQuincenas = [{ month: nextMonth, half: 1 }];
      }
    }

    const printerOffsetGlobal =
      printerPosition === "DERECHA" ? 0.7 * 28.35 : 0;
    const pt = 28.35;
    const docWidth = 8.1 * 28.35;
    const docHeight = 18.3 * 28.35;

    // Separar comisionados y no comisionados
    // Normalizar para evitar null en STATUS_EMPLEADO
    employees = employees.map(emp => ({
      ...emp,
      STATUS_EMPLEADO: emp.STATUS_EMPLEADO || {},
    }));

    const ordenarPorTarjeta = (a, b) => {
      const numA = Number(a.NUMTARJETA) || 0;
      const numB = Number(b.NUMTARJETA) || 0;
      return numA - numB;
    };

    const comisionados = employees
      .filter(
        (emp) =>
          emp.STATUS_EMPLEADO?.STATUS === "COM_SDCL" ||
          emp.STATUS_EMPLEADO?.STATUS === "COM_LAB"
      )
      .sort(ordenarPorTarjeta);
    const noComisionados = employees
      .filter(
        (emp) =>
          !(emp.STATUS_EMPLEADO?.STATUS === "COM_SDCL" ||
            emp.STATUS_EMPLEADO?.STATUS === "COM_LAB")
      )
      .sort(ordenarPorTarjeta);

    // Calcular quincenas
    const today = new Date();
    const quincenas = [];

    if (
      chosenQuincenas &&
      Array.isArray(chosenQuincenas) &&
      chosenQuincenas.length > 0
    ) {
      chosenQuincenas.forEach((s) => {
        const monthIdx = Number(s.month);
        const half = Number(s.half);
        const currentYear =
          selectedYear && Number.isInteger(selectedYear)
            ? Number(selectedYear)
            : today.getFullYear();

        let start = new Date(currentYear, monthIdx - 1, half === 1 ? 1 : 16);
        let end = half === 1 ? addDays(start, 14) : endOfMonth(start);

        if (!selectedYear && isBefore(end, today)) {
          const nextYear = currentYear + 1;
          start = new Date(nextYear, monthIdx - 1, half === 1 ? 1 : 16);
          end = half === 1 ? addDays(start, 14) : endOfMonth(start);
        }

        quincenas.push({
          start,
          end,
          texto: `DEL ${format(start, "dd", { locale: es })} AL ${format(
            end,
            "dd 'DE' MMMM 'DE' yyyy",
            { locale: es }
          )}`.toUpperCase(),
          nombre: format(start, "yyyy-MM-dd", { locale: es }),
        });
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "No valid quincenas provided",
      });
    }

    // Generar PDFs en memoria (buffers)
    const pdfFiles = []; // Array para almacenar {filename, buffer, base64}

    for (const quincena of quincenas) {
      // Generar PDF de comisionados
      if (comisionados.length > 0) {
        const pdfBuffer = await new Promise((resolve, reject) => {
          const buffersArray = [];
          const doc = new PDFDocument({ size: [docWidth, docHeight] });
          doc.fontSize(9);

          // Capturar datos en buffers en lugar de escribir a disco
          doc.on('data', (chunk) => {
            buffersArray.push(chunk);
          });

          doc.on('error', reject);

          comisionados.forEach((record, index) => {
            if (index > 0) doc.addPage();

            // Mapeo de nombres completos (tiene prioridad)
            const adscripcionesAbrevia = {
              "SUBSECRETARÍA DE EGRESOS, CONTABILIDAD Y TESORERÍA": "SUBSRIA. DE EGRESOS, CONT. Y TES.",
              "COORD. DE CENTROS INTEGRALES DE ATENCIÓN AL CONTRIBUYENTE": "COORD. DE C.I.A.C.",
              "OTOR. DE SERVICIOS ADMINISTRATIVOS(DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN)": "OTORG. DE SERV. ADMINISTRATIVOS"

            };

            const palabrasAbrevia = {
              "SUBSECRETARÍA": "SUBSRIA.",
              "PROCURADURÍA": "PROC.",
              "DIRECCIÓN": "DIREC.",
              "COORDINACIÓN": "COORD.",
              "DEPARTAMENTO": "DEPTO.",
              "SERVICIOS": "SERV.",
              "RECURSOS": "REC.",
              "GUBERNAMENTAL": "GUB.",
              "RECAUDACIÓN": "REC.",
              "OTORGAMIENTO": "OTOR.",
              "SANTA": "STA."
            };

            const palabrasEliminar = ["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y"]; // Conectivas

            const abreviarAdscripcion = (texto) => {
              if (!texto) return "";

              // 1. Mapeo exacto de nombres comunes
              const mapeoExacto = Object.keys(adscripcionesAbrevia).find(key =>
                texto.toUpperCase().startsWith(key.toUpperCase())
              );
              if (mapeoExacto) {
                const abrev = adscripcionesAbrevia[mapeoExacto];
                const resto = texto.substring(mapeoExacto.length).trim();
                return resto ? `${abrev} ${resto}` : abrev;
              }

              // 2. Reemplazar palabras individuales
              let resultado = texto;
              for (const [palabra, abreviatura] of Object.entries(palabrasAbrevia)) {
                const regex = new RegExp(`\\b${palabra}\\b`, 'gi');
                resultado = resultado.replace(regex, abreviatura);
              }

              return resultado;
            };


            const cardNumber = record.NUMTARJETA || "";
            const area = abreviarAdscripcion(record.ADSCRIPCION) || "";
            const name = `${record.APE_PAT || ""} ${record.APE_MAT || ""} ${record.NOMBRES || ""}`.trim();
            const REL_L = record.TIPONOM === 'F51' || record.TIPONOM === 'M51' ? 'PB'
              : record.TIPONOM === 'FCT' || record.TIPONOM === 'CCT' ? 'CC'
                : record.TIPONOM === 'FCO' || record.TIPONOM === '511' ? 'CN'
                  : record.TIPONOM || '';
            const shift = record.TURNOMAT || record.TURNOVES || record.HORARIO || "";

            // Ajuste dinámico de posición para NUM
            const baseNumSize = 22;
            const numStr = String(cardNumber || "");
            const digitCount = (numStr.match(/\d/g) || []).length;
            let extraNumOffsetX = 0;

            if (digitCount === 3) {
              extraNumOffsetX = -0.3 * pt;
            } else if (digitCount === 4) {
              extraNumOffsetX = -0.5 * pt;
            }

            const numFontSizeAdjusted =
              baseNumSize + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(numFontSizeAdjusted).font("Helvetica-Bold");

            const extraLeftUp = printerPosition === "IZQUIERDA" ? -0.1 * pt : 0;
            const ajusteY = -5.67 + extraLeftUp;
            const extraRight2mm = printerPosition === "DERECHA" ? 0.2 * pt : 0;

            // NUM
            const numBaseX = 6.5 * pt;
            const numX =
              printerPosition === "DERECHA"
                ? numBaseX - 0.5 * pt + extraNumOffsetX
                : numBaseX + extraNumOffsetX;
            const numY =
              (1.8 - 1 - 0.2) * pt +
              ajusteY +
              (printerPosition === "IZQUIERDA" ? -0.2 * pt : 0) +
              printerOffsetGlobal +
              extraRight2mm;

            doc.text(cardNumber, numX, numY, {
              width: docWidth - numX,
              lineBreak: false,
            });

            // AREA, NOMBRE, REL_L
            const bodyFontSize =
              8.5 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(bodyFontSize).font("Helvetica");
            doc.text(
              area,
              0,
              (2.5 - 1) * pt + ajusteY + printerOffsetGlobal + extraRight2mm,
              {
                width: docWidth,
                align: "center",
              }
            );

            doc.text(
              name,
              0,
              (3.2 - 1) * pt + ajusteY + printerOffsetGlobal + extraRight2mm,
              {
                width: docWidth,
                align: "center",
              }
            );

            doc.text(
              REL_L,
              0,
              (4 - 1) * pt + ajusteY + printerOffsetGlobal + extraRight2mm,
              {
                width: docWidth,
                align: "center",
              }
            );

            // HORARIO
            const shiftY =
              3.8 * pt +
              ajusteY +
              (printerPosition === "DERECHA" ? -0.2 * pt : 0) +
              printerOffsetGlobal +
              extraRight2mm;
            doc.text(shift, 0, shiftY, {
              width: docWidth,
              align: "center",
            });

            // QUINCENA
            const offsetX = 0.5 * pt + (printerPosition === "DERECHA" ? 0.2 * pt : 0);
            const baseY =
              (5.6 - 1) * pt +
              ajusteY +
              (printerPosition === "DERECHA" ? -0.3 * pt : 0) +
              printerOffsetGlobal +
              extraRight2mm;
            const quincenaFont = 9 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(quincenaFont).font("Helvetica-Bold");
            doc.text(quincena.texto, offsetX, baseY, {
              width: docWidth - offsetX,
              align: "center",
            });

            // COMISIONADO
            if (
              record.STATUS_EMPLEADO?.STATUS === "COM_SDCL" ||
              record.STATUS_EMPLEADO?.STATUS === "COM_LAB"
            ) {
              doc
                .save()
                .fontSize(22)
                .font("Helvetica-Bold")
                .rotate(-30, {
                  origin: [1.5 * 28.35, (10 + 2) * 28.35 + printerOffsetGlobal],
                })
                .text(
                  "COMISIONADO",
                  1.5 * 28.35,
                  (10 + 2) * 28.35 + printerOffsetGlobal,
                  {
                    width: docWidth - 1.5 * 28.35,
                    align: "left",
                  }
                )
                .restore();
            }
          });

          doc.on('end', () => {
            const buffer = Buffer.concat(buffersArray);
            resolve(buffer);
          });

          doc.end();
        });

        const printerTag = String(printerPosition || "IZQUIERDA")
          .toUpperCase()
          .replace(/\s+/g, "_");
        const fileName = `TARJETAS_COMISIONADOS_${quincena.nombre}_${printerTag}.pdf`;

        pdfFiles.push({
          filename: fileName,
          buffer: pdfBuffer,
          base64: pdfBuffer.toString('base64'),
        });
      }

      // Generar PDF de no comisionados
      if (noComisionados.length > 0) {
        const pdfBuffer = await new Promise((resolve, reject) => {
          const buffersArray = [];
          const doc = new PDFDocument({ size: [docWidth, docHeight] });
          doc.fontSize(9);

          // Capturar datos en buffers
          doc.on('data', (chunk) => {
            buffersArray.push(chunk);
          });

          doc.on('error', reject);

          noComisionados.forEach((record, index) => {
            if (index > 0) doc.addPage();

            const abreviarAdscripcion = (texto) => {
              if (!texto) return "";

              // Mapeo de nombres completos - búsqueda exacta o al inicio
              const adscripcionesAbrevia = {
                "COORDINACIÓN DE CENTROS INTEGRALES DE ATENCIÓN AL CONTRIBUYENTE": "COORD. DE C.I.A.C.",
                "COORDINACION DE CENTROS INTEGRALES DE ATENCIÓN AL CONTRIBUYENTE": "COORD. DE C.I.A.C.",
                "CENTRO INTEGRAL DE ATENCIÓN AL CONTRIBUYENTE DE SANTA CRUZ AMILPAS": "C.I.A.C. DE STA. CRUZ AMILPAS",
                "CENTRO INTEGRAL DE ATENCIÓN AL CONTRIBUYENTE DE STA. CRUZ AMILPAS": "C.I.A.C. DE STA. CRUZ AMILPAS",
                "DEPARTAMENTO DE REVISIÓN Y ANÁLISIS DEL SECTOR PARAESTATAL": "DEPTO. REV. Y ANÁL. SECT. PARAEST.",
                "DEPARTAMENTO DE REVISIÓN Y ANÁLISIS DEL SECTOR CENTRAL": "DEPTO. REV. Y ANÁL. SECT. CENTRAL",
                "SUBSECRETARÍA DE EGRESOS, CONTABILIDAD Y TESORERÍA": "SUBSRÍA. DE EGRESOS, CONT. Y TES.",
                "OTORGAMIENTO DE SERVICIOS ADMINISTRATIVOS(DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN)": "OTORG. DE SERV. ADMINISTRATIVOS",
                'DEPARTAMENTO DE PROCESAMIENTO DE CUENTAS POR LIQUIDAR CERTIFICADAS DE GASTO DE OPERACIÓN "A"': 'DEPTO. PROC. CTAS. LIQ. CERT. G.O. “A”',
                'DEPARTAMENTO DE PROCESAMIENTO DE CUENTAS POR LIQUIDAR CERTIFICADAS DE GASTO DE OPERACIÓN "B"': 'DEPTO. PROC. CTAS. LIQ. CERT. G.O. “B”',
                "DEPARTAMENTO DE SEGUIMIENTO PRESUPUESTARIO A GASTO DE OPERACIÓN": "DEPTO. SEGUIM. PRESUP. A G.O.",
                "DEPARTAMENTO DE ATENCIÓN Y SEGUIMIENTO A LOS PROCESOS DE AUDITORÍAS": "DEPTO. AT. Y SEGUIM. PROC. DE AUD.",
                "DEPTO. DE PROCESAMIENTO DE CUENTAS POR LIQUIDAR CERTIFICADAS DE INVERSIÓN PÚBLICA": "DEPTO. PROC. CTAS. LIQ. CERT. INV. PÚBL."
              };

              // 1. Buscar mapeo exacto primero
              if (adscripcionesAbrevia[texto]) {
                return adscripcionesAbrevia[texto];
              }

              // 2. Si no hay exacto, buscar al inicio del texto
              for (const [key, value] of Object.entries(adscripcionesAbrevia)) {
                if (texto.toUpperCase().startsWith(key.toUpperCase())) {
                  // Extraer la parte adicional después del mapeo
                  const resto = texto.substring(key.length).trim();
                  return resto ? `${value} ${resto}` : value;
                }
              }

              // 3. Reemplazar palabras individuales
              const palabrasAbrevia = {
                "COORDINACIÓN": "COORD.",
                "COORDINACION": "COORD.",
                "CENTRO": "CTO.",
                "CENTROS": "CTOS.",
                "INTEGRAL": "INTEG.",
                "INTEGRALES": "INTEG.",
                "ATENCIÓN": "AT.",
                "ATENCION": "AT.",
                "CONTRIBUYENTE": "CONTRIB.",
                "CONTRIBUYENTES": "CONTRIBS.",
                "DEPARTAMENTO": "DEPTO.",
                "DIRECCIÓN": "DIR.",
                "DIRECCION": "DIR.",
                "REVISIÓN": "REV.",
                "REVISION": "REV.",
                "ANÁLISIS": "ANÁL.",
                "ANALISIS": "ANÁL.",
                "SECTOR": "SECT.",
                "PARAESTATAL": "PARAEST.",
                "SUBSECRETARÍA": "SUBSRÍA.",
                "SUBSECRETARIA": "SUBSRÍA.",
                "PROCURADURÍA": "PROC.",
                "PROCURADURIA": "PROC.",
                "SERVICIOS": "SERV.",
                "SEGUIMIENTO": "SEGUIM.",
                "PRESUPUESTARIO": "PRESUP.",
                "OPERACIÓN": "OPER.",
                "PROCEDIMIENTO": "PROCED.",
                "PLANEACIÓN": "PLANEAC.",
                "EVALUACIÓN": "EVAL.",
                "MUNICIPALES": "MUN.",
                "INTEGRACIÓN": "INTEG.",
                "RECURSOS": "REC.",
                "GUBERNAMENTAL": "GUB.",
                "RECAUDACIÓN": "RECAUD.",
                "OTORGAMIENTO": "OTOR.",
                "SANTA": "STA.",
                "ADMINISTRATIVA": "ADMIN.",
                "ADMINISTRACIÓN": "ADMIN.",
                "CONTROL": "CTRL.",
                "OFICINA": "OFNA.",
                "PRESUPUESTARIA": "PRESUP.",
                "PROCESOS": "PROC.",
                "AUDITORÍAS": "AUD.",
                "REGISTRO": "REG.",
              };

              let resultado = texto;
              for (const [palabra, abreviatura] of Object.entries(palabrasAbrevia)) {
                const regex = new RegExp(`\\b${palabra}\\b`, 'gi');
                resultado = resultado.replace(regex, abreviatura);
              }

              return resultado;
            };

            function abreviarNombre(nombre, max = 34) {
              if (nombre.length <= max) return nombre;

              const reemplazos = {
                "DEPARTAMENTO": "DEPTO.",
                "DIRECCIÓN": "DIR.",
                "GENERAL": "GRAL.",
                "SERVICIOS": "SERV.",
                "ADMINISTRATIVOS": "ADM.",
                "COORDINACIÓN": "COORD.",
                "SUBSECRETARÍA": "SUBSEC.",
                "SECRETARÍA": "SEC.",
                "TECNOLOGÍAS": "TEC.",
                "INFORMACIÓN": "INF.",
                "PLANEACIÓN": "PLAN.",
                "INVERSIÓN": "INV.",
                "PÚBLICA": "PÚB."
              };

              let abreviado = nombre.toUpperCase();

              for (const palabra in reemplazos) {
                abreviado = abreviado.replaceAll(palabra, reemplazos[palabra]);
              }

              // Si aún supera el límite, recortar inteligentemente
              if (abreviado.length > max) {
                abreviado = abreviado.slice(0, max - 3).trim() + "...";
              }

              return abreviado;
            }


            const cardNumber = record.NUMTARJETA || "";
            const area = abreviarNombre(record.ADSCRIPCION) || "";
            const name = `${record.APE_PAT || ""} ${record.APE_MAT || ""} ${record.NOMBRES || ""}`.trim();
            const REL_L = record.TIPONOM === 'F51' || record.TIPONOM === 'M51' ? 'PB'
              : record.TIPONOM === 'FCT' || record.TIPONOM === 'CCT' ? 'CC'
                : record.TIPONOM === 'FCO' || record.TIPONOM === '511' ? 'CN'
                  : record.TIPONOM || '';
            const shift = record.TURNOMAT || record.TURNOVES || record.HORARIO || "";

            const baseNumSize = 22;
            const numStr = String(cardNumber || "");
            const digitCount = (numStr.match(/\d/g) || []).length;
            let extraNumOffsetX = 0;

            if (digitCount === 3) {
              extraNumOffsetX = -0.3 * pt;
            } else if (digitCount === 4) {
              extraNumOffsetX = -0.5 * pt;
            }

            const numFontSizeAdjusted =
              baseNumSize + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(numFontSizeAdjusted).font("Helvetica-Bold");

            const extraLeftUp = printerPosition === "IZQUIERDA" ? -0.1 * pt : 0;
            const ajusteY = -5.67 + extraLeftUp;
            const extraRight2mm = printerPosition === "DERECHA" ? 0.2 * pt : 0;

            const numBaseX = 6.5 * pt;
            const numX =
              printerPosition === "DERECHA"
                ? numBaseX - 0.5 * pt + extraNumOffsetX
                : numBaseX + extraNumOffsetX;
            const numY =
              (1.8 - 1 - 0.2) * pt +
              ajusteY +
              (printerPosition === "IZQUIERDA" ? -0.2 * pt : 0) +
              printerOffsetGlobal +
              extraRight2mm;

            doc.text(cardNumber, numX, numY, {
              width: docWidth - numX,
              lineBreak: false,
            });

            const bodyFontSize =
              8.5 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(bodyFontSize).font("Helvetica");
            doc.text(
              area,
              0,
              (2.5 - 1) * pt + ajusteY + printerOffsetGlobal + extraRight2mm,
              {
                width: docWidth,
                align: "center",
              }
            );

            doc.text(
              name,
              0,
              (3.2 - 1) * pt + ajusteY + printerOffsetGlobal + extraRight2mm,
              {
                width: docWidth,
                align: "center",
              }
            );

            doc.text(
              REL_L,
              0,
              (4 - 1) * pt + ajusteY + printerOffsetGlobal + extraRight2mm,
              {
                width: docWidth,
                align: "center",
              }
            );

            const shiftY =
              3.8 * pt +
              ajusteY +
              (printerPosition === "DERECHA" ? -0.2 * pt : 0) +
              printerOffsetGlobal +
              extraRight2mm;
            doc.text(shift, 0, shiftY, {
              width: docWidth,
              align: "center",
            });

            const offsetX = 0.5 * pt + (printerPosition === "DERECHA" ? 0.2 * pt : 0);
            const baseY =
              (5.6 - 1) * pt +
              ajusteY +
              (printerPosition === "DERECHA" ? -0.3 * pt : 0) +
              printerOffsetGlobal +
              extraRight2mm;
            const quincenaFont = 9 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(quincenaFont).font("Helvetica-Bold");
            doc.text(quincena.texto, offsetX, baseY, {
              width: docWidth - offsetX,
              align: "center",
            });
          });

          doc.on('end', () => {
            const buffer = Buffer.concat(buffersArray);
            resolve(buffer);
          });

          doc.end();
        });

        const printerTag = String(printerPosition || "IZQUIERDA")
          .toUpperCase()
          .replace(/\s+/g, "_");
        const fileName = `TARJETAS_NO_COMISIONADOS_${quincena.nombre}_${printerTag}.pdf`;

        pdfFiles.push({
          filename: fileName,
          buffer: pdfBuffer,
          base64: pdfBuffer.toString('base64'),
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Tarjetas generadas exitosamente (${quincenas.length} quincena(s))`,
      pdfs: pdfFiles.map(pdf => ({
        filename: pdf.filename,
        data: pdf.base64, // Base64 encoded PDF
      })),
      comisionados: comisionados.length,
      noComisionados: noComisionados.length,
      quincenas: quincenas.length,
    });
  } catch (err) {
    console.error("Error generando tarjetas:", err);
    return res.status(500).json({
      success: false,
      message: "Error generating cards",
      error: err.message,
    });
  }
};

module.exports = incidenciasController;