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
const { querysql } = require("../../config/mysql");
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
      isSpecialCriteria ? searchCriteria : { ...searchCriteria, status: 1 },
    );
    const resultForanea = await query(
      "PLANTILLA_FORANEA",
      isSpecialCriteria ? searchCriteria : { ...searchCriteria, status: 1 },
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
    const hsy_areas = await query("HSY_AREAS", {
      id_employee: new ObjectId(id),
    });
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
      hsy_areas,
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

    const status_plaza = await query("PLAZAS", {
      NUMPLA: emp.NUMPLA_ORIGEN ? emp.NUMPLA_ORIGEN : emp.NUMPLA,
    });

    emp.status_plaza = status_plaza.length > 0 ? status_plaza : null;

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

    const hasPreviousQuarterPermits =
      currentQuarter === 1
        ? false
        : permits.some((permit) => permit.CUATRIMESTRE === previousQuarter);

    const fechaIngreso = moment(emp.FECHA_INGRESO, "YYYY-MM-DD", true).isValid()
      ? moment(emp.FECHA_INGRESO, "YYYY-MM-DD")
      : moment(emp.FECHA_INGRESO);

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

incidenciasController.updateCardInformation = async (req, res) => {
  const { data } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  try {

    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(data._id) }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(data._id) }),
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

    // Eliminar _id de data para evitar conflictos en updateOne
    const id = data._id;
    delete data._id;

    await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(id) },
      { $set: { ...data } },
    );

    const userAction = {
      username: user.username,
      module: "AEI-UPDATE",
      action: `MODIFICÓ INFORMACION DEL EMPLEADO "${updatedEmployee.APE_PAT} ${updatedEmployee.APE_MAT} ${updatedEmployee.NOMBRES} "`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({
      message: "Employee updated", _id: updatedEmployee._id,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error updating employee", error });
  }
};

// Actualizar el estado del empleado
incidenciasController.updateStatusEmployee = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const STATUS_EMPLEADO = data.STATUS_EMPLEADO; // Ahora es un arreglo de objetos de estado
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });
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

    const prevStatus = result[0].STATUS_EMPLEADO || []; // Ahora asumimos que es un arreglo (o vacío si es objeto/undefined)

    // Iterar sobre cada estado en el nuevo STATUS_EMPLEADO
    for (let i = 0; i < STATUS_EMPLEADO.length; i++) {
      const status = STATUS_EMPLEADO[i];
      const hsy_data = {
        ...status, // Extender el objeto de estado actual
        currentDateTime,
        last_status: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].STATUS : (prevStatus.STATUS || null),
        last_lugarComisionado: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].LUGAR_COMISIONADO : (prevStatus.LUGAR_COMISIONADO || null),
        last_desde: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].DESDE : (prevStatus.DESDE || null),
        last_hasta: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].HASTA : (prevStatus.HASTA || null),
        last_proyecto: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].PROYECTO : (prevStatus.PROYECTO || null),
        last_clave: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].CLAVE : (prevStatus.CLAVE || null),
        last_folio: (Array.isArray(prevStatus) && prevStatus[i]) ? prevStatus[i].FOLIO : (prevStatus.FOLIO || null),
        id_employee: new ObjectId(data._id),
      };
      delete hsy_data._id; // Remover si está presente
      await insertOne("HSY_STATUS_EMPLEADO", hsy_data);
    }

    const updateFields = { STATUS_EMPLEADO }; // Ahora el arreglo completo
    if (data.AREA_RESP !== undefined && data.AREA_RESP !== null) {
      updateFields.AREA_RESP = data.AREA_RESP;
    }

    let statusChangeDescription = "";
    if (STATUS_EMPLEADO.some(s => s.STATUS === null)) {
      statusChangeDescription = "AHORA NO TIENE NINGUN STATUS";
    } else if (STATUS_EMPLEADO.some(s => s.STATUS === "COM_SDCL")) {
      statusChangeDescription = "AHORA CUENTA CON COMISIÓN AL SINDICATO";
    } else if (STATUS_EMPLEADO.some(s => s.STATUS === "COM_LAB")) {
      statusChangeDescription = "AHORA CUENTA CON COMISIÓN LABORAL";
    } else if (STATUS_EMPLEADO.some(s => s.STATUS === "ASIG_LAB")) {
      statusChangeDescription = "AHORA CUENTA CON ASIGNACIÓN LABORAL";
    } else if (STATUS_EMPLEADO.some(s => s.STATUS === "EXIMA")) {
      statusChangeDescription = "AHORA CUENTA CON EXIMA";
    }

    const userAction = {
      username: user.username,
      module: "AEI-EE",
      action: `CAMBIO DE STATUS DEL EMPLEADO "${result[0].APE_PAT} ${result[0].APE_MAT} ${result[0].NOMBRES}" ${statusChangeDescription}`,
      timestamp: currentDateTime,
    };

    await updateOne(
      targetCollection,
      { _id: new ObjectId(data._id) },
      { $set: updateFields },
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
      AÑO: currentYear, // Solo año actual
    });

    // Calcular los días restantes según las reglas de los cuatrimestres
    // Máximo 4 días por cuatrimestre, pero se acumulan 2 días si no se usaron en el cuatrimestre anterior
    let leftDays = maxDaysPerQuarter; // Comenzar con 4 días

    // Verificar si el cuatrimestre anterior tuvo permisos
    const hasPreviousQuarterPermits =
      currentQuarter === 1
        ? false
        : permits.some((permit) => permit.CUATRIMESTRE === previousQuarter);

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
      `Permisos previos en cuatrimestre anterior: ${hasPreviousQuarterPermits}`,
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
      (day) => !day.HABIL && day.DIA !== "SÁBADO" && day.DIA !== "DOMINGO",
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
      MOTIVO,
      NUM_OFICIO,
      HORARIO_ENTRADA,
      HORARIO_SALIDA,
      DESDE,
      HASTA,
      NUM_DIAS,
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
      ...(MOTIVO ? { MOTIVO } : {}),
      ...(NUM_OFICIO ? { NUM_OFICIO } : {}),
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
    TIPO,
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
    TIPO,
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
  const { _id, ID_CTRL_ASIST, COMISIONES, NUMTARJETA, OBSERVACIONES } =
    req.body;

  // Crear el nuevo registro de comisión
  const comisionData = {
    id_empoyee: _id,
    ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
    COMISIONES,
    OBSERVACIONES,
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
    res
      .status(500)
      .send({ error: "An error occurred while creating the commission" });
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
        { $set: updateData },
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
incidenciasController.deleteForeigner = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  const data = req.body;
  console.log("Data received for deletion:", data);
  try {

    const plazaForanea = await query("PLANTILLA_FORANEA", {
      _id: new ObjectId(data._id),
    });

    if (plazaForanea.length === 0) {
      return res.status(409).json({
        message: "No se encontró al empleado en la plantilla foránea",
      });
    }

    const result = await updateOne("PLANTILLA_FORANEA", { _id: new ObjectId(data._id) }, { $set: { status: 2 } });

    const userAction = {
      username: user.username,
      module: "AEI-CL",
      action: `REALIZÓ LA BAJA DE: ${plazaForanea[0].APE_PAT} ${plazaForanea[0].APE_MAT} ${plazaForanea[0].NOMBRES} DE LA PLANTILLA FORANEA`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({ message: "Foreigner updated successfully", data });
  } catch (error) {
    console.error("Error updating foreigner:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating the foreigner" });
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
      AÑO: currentYear, // Solo año actual
    });

    // Calcular los días restantes según las reglas de los cuatrimestres
    // Máximo 4 días por cuatrimestre, pero se acumulan 2 días si no se usaron en el cuatrimestre anterior
    permitData.CUATRIMESTRE = currentQuarter;
    // Calcular los días restantes según las reglas de los cuatrimestres
    let leftDays = maxDaysPerQuarter; // Comenzar con 4 días

    const hasPreviousQuarterPermits =
      currentQuarter === 1
        ? false
        : permits.some(
          (p) =>
            p.CUATRIMESTRE === previousQuarter && p._id.toString() !== _id,
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
      (day) => !day.HABIL && day.DIA !== "SÁBADO" && day.DIA !== "DOMINGO",
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
      { $set: permitData },
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
      { $set: updateData },
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
      { $set: updateData },
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
      { $set: updateData },
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
      { $set: { NUMTARJETA: normalizedNUMTARJETA, TURNOMAT, TURNOVES } },
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
    res
      .status(200)
      .send({ message: "Commission deleted successfully", data: comisionData });
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

      STATUS_EMPLEADO: {
        $not: {
          $elemMatch: {
            STATUS: { $in: ["EXIMA", "COM_LAB"] }
          }
        }
      }
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

  if (!TARJETAS || !Array.isArray(TARJETAS) || TARJETAS.length === 0) {
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
    return res
      .status(404)
      .json({ message: "No hay empleados para los parámetros especificados" });
  }

  // ===============================
  // OBTENER ADSCRIPCIONES DE MYSQL
  // ===============================
  const adscripciones = await querysql(
    "SELECT id_adscripcion, nombre, nivel, parent_id FROM adscripciones"
  );

  const mapaAdscripciones = {};

  adscripciones.forEach((a) => {
    mapaAdscripciones[a.id_adscripcion] = a;
  });

  // departamentos que NO deben subir
  const departamentosEspeciales = [
    "DEPARTAMENTO DE RECURSOS HUMANOS",
    "DEPARTAMENTO DE RECURSOS FINANCIEROS",
    "DEPARTAMENTO DE RECURSOS MATERIALES",
    "DEPARTAMENTO DE SERVICIOS GENERALES",
    "DEPARTAMENTO DE SERVICIOS CENTRALES",
    "DEPARTAMENTO DE SEGUIMIENTO ADMINISTRATIVO",
  ];

  // función para obtener adscripción correcta
  function obtenerAdscripcionNivel3(nombreAdscripcion) {
    const ads = Object.values(mapaAdscripciones).find((a) =>
      a.nombre.toUpperCase().includes(nombreAdscripcion.toUpperCase())
    );

    if (!ads) return nombreAdscripcion;

    if (
      departamentosEspeciales.some((dep) =>
        ads.nombre.toUpperCase().includes(dep)
      )
    ) {
      return ads.nombre;
    }

    if (ads.nivel <= 3) {
      return ads.nombre;
    }

    let actual = ads;
    let nivel2 = null

    while (actual.parent_id && mapaAdscripciones[actual.parent_id]) {
      const padre = mapaAdscripciones[actual.parent_id];

      if (padre.nivel === 3) {
        return padre.nombre;
      }

      if (padre.nivel === 2) {
        nivel2 = padre;
      }

      actual = padre;
    }

    // si no encontró nivel 3 usar nivel 2
    if (nivel2) {
      return nivel2.nombre;
    }

    return ads.nombre;
  }

  const abreviaturasAdscripciones = {
    "DIRECCIÓN ADMINISTRATIVA": "DIREC. ADMINISTRATIVA",
    "DEPARTAMENTO DE RECURSOS HUMANOS": "DEPTO. DE REC. HUMANOS",
    "DEPARTAMENTO DE RECURSOS FINANCIEROS": "DEPTO. DE REC. FINANCIEROS",
    "DEPARTAMENTO DE RECURSOS MATERIALES": "DEPTO. DE REC. MATERIALES",
    "DEPARTAMENTO DE SERVICIOS GENERALES": "DEPTO. DE SERV. GENERALES",
    "DEPARTAMENTO DE SEGUIMIENTO ADMINISTRATIVO": "DEPTO. DE SEG. ADMINISTRATIVO",

    "SUBSECRETARÍA DE EGRESOS, CONTABILIDAD Y TESORERÍA": "SUBSRIA. DE EGRESOS, CONT. Y TES.",
    "DIRECCIÓN DE CONTABILIDAD GUBERNAMENTAL": "DIREC. DE CONTABILIDAD GUB.",
    "DIRECCIÓN DE PRESUPUESTO": "DIREC. DE PRESUPUESTO",
    "TESORERÍA": "TESORERÍA",

    "SUBSECRETARÍA DE INGRESOS": "SUBSRIA. DE INGRESOS",
    "DIRECCIÓN DE INGRESOS Y RECAUDACIÓN": "DIREC. DE INGRESOS Y REC.",
    "DIRECCIÓN DE AUDITORÍA E INSPECCIÓN FISCAL": "DIREC. DE AUD. E INS. FISCAL",

    "PROCURADURÍA FISCAL": "PROC. FISCAL",
    "DIRECCIÓN DE NORMATIVIDAD Y ASUNTOS JURÍDICOS": "DIREC. DE NORM. Y ASUN. JURÍ.",
    "DIRECCIÓN DE LO CONTENCIOSO": "DIREC. DE LO CONTENCIOSO",

    "SUBSECRETARÍA DE PLANEACIÓN E INVERSIÓN PÚBLICA": "SUBSRIA. DE PLAN. E INV. PUB.",
    "DIRECCIÓN DE PLANEACIÓN ESTATAL": "DIREC. DE PLAN. ESTATAL",
    "DIRECCIÓN DE PROGRAMACIÓN DE LA INVERSIÓN PÚBLICA": "DIREC. DE PROG. DE LA INV. PÚBLICA",
    "DIRECCIÓN DE SEGUIMIENTO A LA INVERSIÓN PÚBLICA": "DIREC. DE SEG. A LA INV. PÚBLICA",

    "DIRECCIÓN DE LA INSTANCIA TÉCNICA DE EVALUACIÓN": "DIREC. DE LA INST. TÉC. DE EVAL.",

    "OTORGAMIENTO DE SERVICIOS ADMINISTRATIVOS(DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN)": "OTORG. DE SERV. ADMINISTRATIVOS"
  };

  function abreviarAdscripcion(nombre) {

    if (!nombre) return "";

    const nombreUpper = nombre.toUpperCase();

    if (abreviaturasAdscripciones[nombreUpper]) {
      return abreviaturasAdscripciones[nombreUpper];
    }

    return nombre; // si no existe abreviatura, deja el nombre original
  }

  // aplicar a los empleados
  employees = employees.map((emp) => {
    const adscripcionOriginal = emp.STATUS_EMPLEADO?.find(s => s.STATUS === "ASIG_LAB")?.LUGAR_COMISIONADO || emp.ADSCRIPCION;
    const adscripcion = obtenerAdscripcionNivel3(adscripcionOriginal);
    return {
      ...emp,
      ADSCRIPCION: abreviarAdscripcion(adscripcion),
    }
  });


  try {
    const {
      employees: employeesBody,
      printerPosition = PRINTER,
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
      chosenQuincenas = FORTNIGHT.map(quinaenaNumToMonthHalf).filter(
        (q) => q !== null,
      );
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

    const printerOffsetGlobal = printerPosition === "DERECHA" ? 0.7 * 28.35 : 0;
    const pt = 28.35;
    const docWidth = 8.1 * 28.35;
    const docHeight = 18.3 * 28.35;

    employees = employees.map((emp) => ({
      ...emp,
      STATUS_EMPLEADO: Array.isArray(emp.STATUS_EMPLEADO) ? emp.STATUS_EMPLEADO : [],
    }));

    const ordenarPorTarjeta = (a, b) => {
      const numA = Number(a.NUMTARJETA) || 0;
      const numB = Number(b.NUMTARJETA) || 0;
      return numA - numB;
    };

    function hasStatus(emp, statuses) {
      const statusArray = emp.STATUS_EMPLEADO || [];
      return statusArray.some(s => statuses.includes(s.STATUS));
    }

    // const comisionados = employees
    //   .filter(emp =>
    //     hasStatus(emp, ["COM_SDCL", "COM_LAB"])
    //   )
    //   .sort(ordenarPorTarjeta);

    // const noComisionados = employees
    //   .filter(emp =>
    //     !hasStatus(emp, ["COM_SDCL", "COM_LAB"])
    //   )
    //   .sort(ordenarPorTarjeta);

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
            { locale: es },
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

    // Función auxiliar: Obtener días en vacaciones dentro de una quincena
    function getDiasVacacionesEnQuincena(quincenaStart, quincenaEnd, vacacionesObj) {
      if (!vacacionesObj || !vacacionesObj.FECHAS) return [];

      const fechaInicio = moment(vacacionesObj.FECHAS.FECHA_INICIO);
      const fechaFin = moment(vacacionesObj.FECHAS.FECHA_FIN);

      if (!fechaInicio.isValid() || !fechaFin.isValid()) return [];

      const diasVacaciones = [];

      let currentDay = moment(quincenaStart);  // Comenzar desde el inicio de la quincena
      const lastDay = moment(quincenaEnd);

      while (currentDay.isSameOrBefore(lastDay, 'day')) {
        const isWeekend = currentDay.day() === 0 || currentDay.day() === 6;

        // Verificar si el día actual está dentro del rango de vacaciones
        const esVacacion = currentDay.isSameOrAfter(fechaInicio) && currentDay.isSameOrBefore(fechaFin);

        if (esVacacion && !isWeekend) {
          diasVacaciones.push(`${currentDay.format("DD")} VACACIONES`);
        } else {
          diasVacaciones.push("");  // Espacio vacío para días que no son vacaciones
        }

        currentDay.add(1, "day");
      }
      return diasVacaciones;
    }

    function isComisionadoEnQuincena(emp, quincenaStart, quincenaEnd, comisionStatusTypes = ["COM_SDCL", "COM_LAB"]) {
      if (!emp.STATUS_EMPLEADO || emp.STATUS_EMPLEADO.length === 0) {
        return false;
      }

      const statusArray = emp.STATUS_EMPLEADO;

      // Buscar un estatus comisionado que sea vigente en esta quincena
      return statusArray.some(status => {
        // Verificar que tenga el tipo de comisión correcto
        if (!comisionStatusTypes.includes(status.STATUS)) {
          return false;
        }

        // Si no hay fechas de vigencia, asumir que está activo (PERMANENTEMENTE COMISIONADO)
        if (!status.DESDE && !status.HASTA) {
          return true;
        }

        const statusDesde = status.DESDE ? moment(status.DESDE) : null;
        const statusHasta = status.HASTA ? moment(status.HASTA) : null;
        const quinStart = moment(quincenaStart);
        const quinEnd = moment(quincenaEnd);

        // Validar si la comisión se superpone con la quincena
        if (statusDesde && statusDesde.isAfter(quinEnd)) {
          // La comisión inicia DESPUÉS de que termina la quincena
          return false;
        }

        if (statusHasta && statusHasta.isBefore(quinStart)) {
          // La comisión termina ANTES de que inicie la quincena
          return false;
        }

        return true;
      });
    }

    for (const quincena of quincenas) {

      const comisionados = employees
        .filter(emp => isComisionadoEnQuincena(emp, quincena.start, quincena.end))
        .sort(ordenarPorTarjeta);

      const noComisionados = employees
        .filter(emp => !isComisionadoEnQuincena(emp, quincena.start, quincena.end))
        .sort(ordenarPorTarjeta);


      // Generar PDF de comisionados
      if (comisionados.length > 0) {
        const pdfBuffer = await new Promise((resolve, reject) => {
          const buffersArray = [];
          const doc = new PDFDocument({ size: [docWidth, docHeight] });
          doc.fontSize(9);

          // Capturar datos en buffers en lugar de escribir a disco
          doc.on("data", (chunk) => {
            buffersArray.push(chunk);
          });

          doc.on("error", reject);

          //const backgroundImage = path.join(__dirname, "../../assets/img/fondoTarjeta.jpg");

          comisionados.forEach((record, index) => {
            if (index > 0) doc.addPage();
            // doc.image(backgroundImage, 0, 0, {
            //   width: docWidth,
            //   height: docHeight,
            // });
            const cardNumber = record.NUMTARJETA || "";
            const area = record.ADSCRIPCION || "";
            const name =
              `${record.APE_PAT || ""} ${record.APE_MAT || ""} ${record.NOMBRES || ""}`.trim();
            const REL_L =
              record.TIPONOM === "F51" || record.TIPONOM === "M51"
                ? "PB"
                : record.TIPONOM === "FCT" || record.TIPONOM === "CCT"
                  ? "CC"
                  : record.TIPONOM === "FCO" || record.TIPONOM === "511"
                    ? "CN"
                    : record.TIPONOM || "";
            const shift =
              record.TURNOMAT || record.TURNOVES || record.HORARIO || "";

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

            let numCardX, numCardY, xStartCard, xEndCard;

            if (printerPosition === "DERECHA") {
              numCardX = 174;
              numCardY = 29;
              xStartCard = 174;
              xEndCard = 228;
            } else {
              numCardX = 174;
              numCardY = 29 - 0.8 * pt;
              xStartCard = 174;
              xEndCard = 228;
            }

            const rangeCardWidth = xEndCard - xStartCard;
            doc.text(cardNumber, numCardX, numCardY, {
              width: rangeCardWidth,
              lineBreak: false,
            });

            const bodyFontSize = 8.5 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(bodyFontSize).font("Helvetica");
            let numAreaX, numAreaY, xStartArea, xEndArea;

            if (printerPosition === "DERECHA") {
              numAreaX = 31;
              numAreaY = 58;
              xStartArea = 31;
              xEndArea = 221;
            } else {
              numAreaX = 31;
              numAreaY = 58 - 0.8 * pt;
              xStartArea = 31;
              xEndArea = 221;
            }

            const rangeAreaWidth = xEndArea - xStartArea;
            doc.text(area, numAreaX, numAreaY, {
              width: rangeAreaWidth,
              align: "center",
              lineBreak: false,
            });

            let numNameX, numNameY, xStartName, xEndName;

            if (printerPosition === "DERECHA") {
              numNameX = 44;
              numNameY = 76;
              xStartName = 44;
              xEndName = 221;
            } else {
              numNameX = 44;
              numNameY = 76 - 0.8 * pt;
              xStartName = 44;
              xEndName = 221;
            }

            const rangeNameWidth = xEndName - xStartName;
            doc.text(name, numNameX, numNameY, {
              width: rangeNameWidth,
              align: "center",
              lineBreak: false,
            });

            let numRelLX, numRelLY, xStartRelL, xEndRelL;

            if (printerPosition === "DERECHA") {
              numRelLX = 73;
              numRelLY = 97;
              xStartRelL = 73;
              xEndRelL = 221;
            } else {
              numRelLX = 73;
              numRelLY = 97 - 0.8 * pt;
              xStartRelL = 73;
              xEndRelL = 221;
            }

            const rangeRelLWidth = xEndRelL - xStartRelL;
            doc.text(REL_L, numRelLX, numRelLY, {
              width: rangeRelLWidth,
              align: "center",
              lineBreak: false,
            });

            let numShiftX, numShiftY, xStartShift, xEndShift;

            if (printerPosition === "DERECHA") {
              numShiftX = 50;
              numShiftY = 116;
              xStartShift = 50;
              xEndShift = 221;
            } else {
              numShiftX = 50;
              numShiftY = 116 - 0.8 * pt;
              xStartShift = 50;
              xEndShift = 221;
            }

            const rangeShiftWidth = xEndShift - xStartShift;
            doc.text(shift, numShiftX, numShiftY, {
              width: rangeShiftWidth,
              align: "center",
            });

            let numQuinX, numQuinY, xStartQuin, xEndQuin;

            if (printerPosition === "DERECHA") {
              numQuinX = 55;
              numQuinY = 135;
              xStartQuin = 55;
              xEndQuin = 221;
            } else {
              numQuinX = 55;
              numQuinY = 135 - 0.8 * pt;
              xStartQuin = 55;
              xEndQuin = 221;
            }

            const rangeQuinWidth = xEndQuin - xStartQuin;
            // doc.rect(xStartQuin, numQuinY, rangeQuinWidth, 5).fill("black");
            const quincenaFont = 9 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(quincenaFont).font("Helvetica-Bold");
            doc.text(quincena.texto, numQuinX, numQuinY, {
              width: rangeQuinWidth,
              align: "center",
              lineBreak: false,
            });

            // COMISIONADO
            if (hasStatus(record, ["COM_SDCL", "COM_LAB"])) {
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
                  },
                )
                .restore();
            }
          });

          doc.on("end", () => {
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
          base64: pdfBuffer.toString("base64"),
        });
      }

      // Generar PDF de no comisionados
      if (noComisionados.length > 0) {
        const pdfBuffer = await new Promise((resolve, reject) => {
          const buffersArray = [];
          const doc = new PDFDocument({ size: [docWidth, docHeight] });
          doc.fontSize(9);

          // Capturar datos en buffers
          doc.on("data", (chunk) => {
            buffersArray.push(chunk);
          });

          doc.on("error", reject);

          //const backgroundImage = path.join(__dirname, "../../assets/img/fondoTarjeta.jpg");

          noComisionados.forEach((record, index) => {
            if (index > 0) doc.addPage();
            // doc.image(backgroundImage, 0, 0, {
            //   width: docWidth,
            //   height: docHeight,
            // });

            const cardNumber = record.NUMTARJETA || "";
            const area = record.ADSCRIPCION || "";
            const name =
              `${record.APE_PAT || ""} ${record.APE_MAT || ""} ${record.NOMBRES || ""}`.trim();
            const REL_L =
              record.TIPONOM === "F51" || record.TIPONOM === "M51"
                ? "PB"
                : record.TIPONOM === "FCT" || record.TIPONOM === "CCT"
                  ? "CC"
                  : record.TIPONOM === "FCO" || record.TIPONOM === "511"
                    ? "CN"
                    : record.TIPONOM || "";
            const shift =
              record.TURNOMAT || record.TURNOVES || record.HORARIO || "";

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


            let numCardX, numCardY, xStartCard, xEndCard;

            if (printerPosition === "DERECHA") {
              numCardX = 174;
              numCardY = 29;
              xStartCard = 174;
              xEndCard = 228;
            } else {
              numCardX = 174;
              numCardY = 29 - 0.8 * pt;
              xStartCard = 174;
              xEndCard = 228;
            }

            const rangeCardWidth = xEndCard - xStartCard;
            doc.text(cardNumber, numCardX, numCardY, {
              width: rangeCardWidth,
              lineBreak: false,
            });

            const bodyFontSize = 8.5 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(bodyFontSize).font("Helvetica");
            let numAreaX, numAreaY, xStartArea, xEndArea;

            if (printerPosition === "DERECHA") {
              numAreaX = 31;
              numAreaY = 58;
              xStartArea = 31;
              xEndArea = 221;
            } else {
              numAreaX = 31;
              numAreaY = 58 - 0.8 * pt;
              xStartArea = 31;
              xEndArea = 221;
            }

            const rangeAreaWidth = xEndArea - xStartArea;
            doc.text(area, numAreaX, numAreaY, {
              width: rangeAreaWidth,
              align: "center",
              lineBreak: false,
            });

            let numNameX, numNameY, xStartName, xEndName;

            if (printerPosition === "DERECHA") {
              numNameX = 44;
              numNameY = 76;
              xStartName = 44;
              xEndName = 221;
            } else {
              numNameX = 44;
              numNameY = 76 - 0.8 * pt;
              xStartName = 44;
              xEndName = 221;
            }

            const rangeNameWidth = xEndName - xStartName;
            doc.text(name, numNameX, numNameY, {
              width: rangeNameWidth,
              align: "center",
              lineBreak: false,
            });

            let numRelLX, numRelLY, xStartRelL, xEndRelL;

            if (printerPosition === "DERECHA") {
              numRelLX = 73;
              numRelLY = 97;
              xStartRelL = 73;
              xEndRelL = 221;
            } else {
              numRelLX = 73;
              numRelLY = 97 - 0.8 * pt;
              xStartRelL = 73;
              xEndRelL = 221;
            }

            const rangeRelLWidth = xEndRelL - xStartRelL;
            doc.text(REL_L, numRelLX, numRelLY, {
              width: rangeRelLWidth,
              align: "center",
              lineBreak: false,
            });

            let numShiftX, numShiftY, xStartShift, xEndShift;

            if (printerPosition === "DERECHA") {
              numShiftX = 50;
              numShiftY = 116;
              xStartShift = 50;
              xEndShift = 221;
            } else {
              numShiftX = 50;
              numShiftY = 116 - 0.8 * pt;
              xStartShift = 50;
              xEndShift = 221;
            }

            const rangeShiftWidth = xEndShift - xStartShift;
            doc.text(shift, numShiftX, numShiftY, {
              width: rangeShiftWidth,
              align: "center",
            });

            let numQuinX, numQuinY, xStartQuin, xEndQuin;

            if (printerPosition === "DERECHA") {
              numQuinX = 55;
              numQuinY = 135;
              xStartQuin = 55;
              xEndQuin = 221;
            } else {
              numQuinX = 55;
              numQuinY = 135 - 0.8 * pt;
              xStartQuin = 55;
              xEndQuin = 221;
            }

            const rangeQuinWidth = xEndQuin - xStartQuin;
            // doc.rect(xStartQuin, numQuinY, rangeQuinWidth, 5).fill("black");
            const quincenaFont = 9 + (printerPosition === "IZQUIERDA" ? 1 : 0);
            doc.fontSize(quincenaFont).font("Helvetica-Bold");
            doc.text(quincena.texto, numQuinX, numQuinY, {
              width: rangeQuinWidth,
              align: "center",
              lineBreak: false,
            });

            // // VACACIONES
            const diasEnVacaciones = getDiasVacacionesEnQuincena(
              quincena.start,
              quincena.end,
              record.VACACIONES
            );

            const vacacionesMarginLeft = 0.7 * pt;
            const vacacionesTopMargin = 1 * pt;
            const vacacionesLineHeight = 0.2 * pt;

            let vacacionesY
            if (printerPosition === "DERECHA") {
              vacacionesY = 186;
            } else {
              vacacionesY = 186 - 0.8 * pt;
            }


            const lineHeight = doc.heightOfString("VACACIONES", {
              width: docWidth - vacacionesMarginLeft,
            });

            diasEnVacaciones.forEach((texto) => {
              if (texto) {
                // Separar el día y la palabra VACACIONES
                const [dia, ...resto] = texto.split(" ");
                const palabra = resto.join(" ");
                const palabraEspaciada = palabra.split("").join("   ");
                const textoFinal = `${dia}        ${palabraEspaciada}`;
                doc
                  .font("Helvetica-Bold")
                  .fontSize(0.4 * pt)
                  .text(textoFinal, vacacionesMarginLeft, vacacionesY, {
                    width: docWidth - vacacionesMarginLeft,
                    align: "left",
                  });
                doc.font("Helvetica");
              }
              vacacionesY += lineHeight + vacacionesLineHeight;
            });

          });

          doc.on("end", () => {
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
          base64: pdfBuffer.toString("base64"),
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Tarjetas generadas exitosamente (${quincenas.length} quincena(s))`,
      pdfs: pdfFiles.map((pdf) => ({
        filename: pdf.filename,
        data: pdf.base64, // Base64 encoded PDF
      })),
      // comisionados: comisionados.length,
      // noComisionados: noComisionados.length,
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

incidenciasController.getAllEmployeesByStatus = async (req, res) => {
  const { status } = req.body;
  let queryCondition;

  queryCondition = {
    STATUS_EMPLEADO: {
      $elemMatch: { STATUS: status }
    }
  };

  try {
    const employees = await query("PLANTILLA", queryCondition);

    if (!employees || employees.length === 0) {
      return res.status(404).json({ message: "No hay empleados con el status especificado" });
    }

    let empleadosFiltrados = employees;
    empleadosFiltrados = empleadosFiltrados
      .map((emp) => ({
        _id: emp._id,
        NOMBRE: `${emp.APE_PAT || ""} ${emp.APE_MAT || ""} ${emp.NOMBRES || ""}`.trim(),
        ADSCRIPCION: emp.ADSCRIPCION || "",
        TIPONOM: emp.TIPONOM || "",
        NUMTARJETA: emp.NUMTARJETA || "",
        NUMPLA: emp.NUMPLA || "",
        NUMEMP: emp.NUMEMP || "",
        STATUS_EMPLEADO: (emp.STATUS_EMPLEADO || [])
          .filter((s) => s.STATUS === status),
      }))
      .sort((a, b) => {
        const numA = Number(a.NUMTARJETA) || 0;
        const numB = Number(b.NUMTARJETA) || 0;
        return numB - numA;
      });

    res.status(200).json(empleadosFiltrados);
  } catch (error) {
    console.error("Error al obtener empleados:", error.message);
    res.status(500).json({ message: "Error al obtener la información." });
  }
};

module.exports = incidenciasController;
