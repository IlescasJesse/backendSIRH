const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");

const incidenciasController = {};

// Obtener empleado por criterio de búsqueda
incidenciasController.getEmployee = async (req, res) => {
  const queryParam = req.params.queryParam;
  console.log(queryParam);

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

        { status: 1 },
      ],
    };
  } else if (/^[a-zA-Z\s]+$/.test(queryParam)) {
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
  } else if (/^[a-zA-Z0-9]+$/.test(queryParam)) {
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
    const resultPlantilla = await query("PLANTILLA", {
      ...searchCriteria,
      status: 1,
    });
    const resultForanea = await query("PLANTILLA_FORANEA", {
      ...searchCriteria,
      status: 1,
    });
    const result = [...resultPlantilla, ...resultForanea];
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
  } else if (/^[a-zA-Z]+$/.test(queryParam)) {
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
  } else if (/^[a-zA-Z0-9]+$/.test(queryParam)) {
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

    const employee = employeePlantilla.length ? employeePlantilla : employeeForanea.length ? employeeForanea : [];

    if (!employee || employee.length === 0) {
      res.status(404).send({ error: "No data found" });
      return;
    }

    const emp = employee[0]

    console.log("Employee data:", emp.STATUS_EMPLEADO);

    // Obtener el cuatrimestre y año actuales
    const currentQuarter = moment().quarter();
    const currentYear = moment().year();

    // Obtener la bitácora del empleado
    const bitacora = await query("BITACORA", {
      id_plantilla: emp._id,
    });
    emp.bitacora = bitacora;

    // Obtener permisos del empleado en el año actual
    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
      AÑO: currentYear,
    });

    console.log("Permits data:", permits);

    const justificantes = await query("JUSTIFICACIONES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const incapacidades = await query("INCAPACIDADES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const permisosExt = await query("PERMISOS_EXT", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });

    // Calcular los días restantes según las reglas de los cuatrimestres
    let leftDays = maxDaysPerQuarter;

    permits.forEach((permit) => {
      if (permit.CUATRIMESTRE === currentQuarter) {
        leftDays -= permit.NUM_DIAS || 0; // Restar los días del permiso actual
      }
    });

    // Si no hay permisos en el cuatrimestre anterior, permitir acumulación
    const hasPreviousQuarterPermits = permits.some(
      (permit) => permit.CUATRIMESTRE === currentQuarter - 1
    );

    if (!hasPreviousQuarterPermits) {
      leftDays = Math.min(leftDays, maxAccumulatedDays);
    }

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
    };
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: user.username,
      module: "AEI-PI",
      action: `CONSULTÓ EL PERFIL DE INCIDENCIAS DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
    };
    await insertOne("USER_ACTIONS", userAction);
    console.log("Profile data:", ASIST_PROFILE);

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
  console.log(data);
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
    const result = await query("PLANTILLA", {
      _id: new ObjectId(data._id),
    });

    if (!result || result.length === 0) {
      return res.status(404).send({ error: "Employee not found" });
    }

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
      "PLANTILLA",
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

  // Función personalizada para calcular el cuatrimestre
  const getCustomQuarter = (date) => {
    const month = moment(date, "YYYY-MM-DD").month() + 1; // Obtener el mes (1-12)
    if (month >= 1 && month <= 4) return 1; // Enero - Abril
    if (month >= 5 && month <= 8) return 2; // Mayo - Agosto
    return 3; // Septiembre - Diciembre
  };

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

    // Validar que las fechas DESDE y HASTA no crucen cuatrimestres
    const desdeQuarter = getCustomQuarter(DESDE);
    const hastaQuarter = getCustomQuarter(HASTA);
    const desdeYear = moment(DESDE, "YYYY-MM-DD").year();
    const hastaYear = moment(HASTA, "YYYY-MM-DD").year();

    if (desdeQuarter !== hastaQuarter || desdeYear !== hastaYear) {
      return res.status(407).send({
        error: "Las fechas DESDE y HASTA no pueden cruzar cuatrimestres.",
      });
    }

    console.log(desdeQuarter);

    // Obtener permisos existentes del empleado en el año actual
    const currentQuarter = desdeQuarter;
    const currentYear = hastaYear;

    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
      AÑO: currentYear,
    });

    console.log("Existing permits:", permits);

    // Calcular los días restantes según las reglas de los cuatrimestres
    let leftDays = maxDaysPerQuarter;

    permits.forEach((permit) => {
      if (permit.CUATRIMESTRE === currentQuarter) {
        leftDays -= permit.NUM_DIAS || 0; // Restar los días del permiso actual
      }
    });

    if (leftDays < 0) leftDays = 0;

    console.log("Left days after calculation:", leftDays);

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
    } = req.body;

    // Crear el nuevo justificante
    justificationData = {
      id_empoyee: _id,
      ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
      FECHA,
      HORA_DESDE,
      HORA_HASTA,
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
incidenciasController.saveIncidencia = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    username: user.username,
    module: "AEI-CAI",
    action: `GUARDÓ INCIDENCIA DEL EMPLEADO "${data.NOMBRES} ${data.APE_PAT} ${data.APE_MAT}"`,
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

incidenciasController.newExtPermit = async (req, res) => {
  const user = req.user;

  const {
    _id,
    DESDE,
    HASTA,
    NUM_DIAS,
    OBSERVACIONES,
    ID_CTRL_ASIST,
    NUMTARJETA,
  } = req.body;
  // Crear el nuevo registro de permiso extraordinario
  const extPermitData = {
    id_empoyee: _id,
    DESDE,
    HASTA,
    NUM_DIAS,
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
  console.log("Request body:", req.body);
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
  console.log("Received data:", data);
  try {
    const plantillaId = new ObjectId(); // _id para PLANTILLA_FORANEA
    const idBitacora = new ObjectId(); // _id para BITACORA
    const idCtrlAsist = new ObjectId(); // ID_CTRL_ASIST del foráneo

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
  console.log("Update data:", updateData);
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  const currentQuarter = moment(updateData.DESDE, "YYYY-MM-DD").quarter();
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

    console.log("Permit data to update:", permitData);

    const maxDaysPerQuarter = 4;
    const maxAccumulatedDays = 6;

    // Validar que las fechas DESDE y HASTA no crucen cuatrimestres
    const desdeQuarter = moment(permitData.DESDE, "YYYY-MM-DD").quarter();
    const hastaQuarter = moment(permitData.HASTA, "YYYY-MM-DD").quarter();
    const desdeYear = moment(permitData.DESDE, "YYYY-MM-DD").year();
    const hastaYear = moment(permitData.HASTA, "YYYY-MM-DD").year();

    if (desdeQuarter !== hastaQuarter || desdeYear !== hastaYear) {
      return res.status(407).send({
        error: "Las fechas DESDE y HASTA no pueden cruzar cuatrimestres.",
      });
    }

    // Obtener permisos existentes del empleado en el año actual
    const permits = await query("PERMISOS_ECONOMICOS", {
      ID_CTRL_ASIST: new ObjectId(permitData.ID_CTRL_ASIST),
      AÑO: permitData.AÑO,
    });

    console.log("Existing permits:", permits);

    // Calcular los días restantes según las reglas de los cuatrimestres
    let leftDays = maxDaysPerQuarter;

    permits.forEach((permit) => {
      if (
        permit._id.toString() !== _id &&
        permit.CUATRIMESTRE === permitData.CUATRIMESTRE
      ) {
        // Restar los días del permiso actual en el mismo cuatrimestre
        leftDays -= permit.NUM_DIAS || 0;
      }
    });

    if (leftDays < 0) leftDays = 0;

    console.log("Left days after calculation:", leftDays);

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

incidenciasController.updateExtPermit = async (req, res) => {
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
      { $set: updateData }
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

incidenciasController.deleteExtPermit = async (req, res) => {
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

incidenciasController.getIncidencias = async (req, res) => {
  const id = req.params.id;
  try {
    const incidencias = await query("INCIDENCIAS", {
      ID_CTRL_ASIST: new ObjectId(id),
    });

    console.log("Incidencias data:", incidencias);
    res.send(incidencias);
  } catch (error) {
    console.error("Error fetching incidencias:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};
incidenciasController.asignarTarjeta = async (req, res) => {
  const { _id, NUMTARJETA, TURNOMAT, TURNOVES } = req.body;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const employee = await query("PLANTILLA", {
    _id: new ObjectId(_id),
  });
  if (!employee || employee.length === 0) {
    return res.status(404).send({ error: "Employee not found" });
  }
  const userAction = {
    username: user.username,
    module: "AEI-PRO",
    action: `ASIGNÓ TARJETA "${NUMTARJETA}" AL  EMPLEADO "${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}"`,
    timestamp: currentDateTime,
  };
  try {
    await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { NUMTARJETA, TURNOMAT, TURNOVES } }
    );
    await insertOne("USER_ACTIONS", userAction);
    res.status(200).send({
      message: "Card assigned successfully",
      data: { _id, NUMTARJETA },
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
incidenciasController.getAllIncidencias = async (req, res) => {
  try {
    const incidencias = await query("INCIDENCIAS", {});
    console.log("Incidencias data:", incidencias);
    res.status(200).send(incidencias);
  } catch (error) {
    console.error("Error fetching incidencias:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

module.exports = incidenciasController;
