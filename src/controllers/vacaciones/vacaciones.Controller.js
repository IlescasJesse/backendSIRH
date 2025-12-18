const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");

const vacacionesController = {};

// Obtener perfil del empleado
vacacionesController.getProfile = async (req, res) => {
  const id = req.params.id;
  const user = req.user;

  try {
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

    let totalDays = 0;
    const emp = employee[0];

    // Validar y calcular años trabajados de forma segura
    const fechaIngreso = moment(emp.FECHA_INGRESO, "YYYY-MM-DD", true);
    const ahora = moment();

    let yearsWorked = 0;
    if (!fechaIngreso.isValid()) {
      console.warn(
        `FECHA_INGRESO inválida para empleado ${emp._id}:`,
        emp.FECHA_INGRESO
      );
      yearsWorked = 0;
    } else {
      yearsWorked = ahora.diff(fechaIngreso, "years");
      if (!Number.isFinite(yearsWorked) || yearsWorked < 0) yearsWorked = 0;
    }

    // Determinar días según años trabajados
    if (yearsWorked <= 5) {
      totalDays = 11;
    } else if (yearsWorked > 5 && yearsWorked <= 10) {
      totalDays = 13;
    } else if (yearsWorked > 10 && yearsWorked <= 15) {
      totalDays = 15;
    } else if (yearsWorked > 15 && yearsWorked <= 20) {
      totalDays = 17;
    } else if (yearsWorked > 20) {
      totalDays = 19;
    }

    const diasKey = String(totalDays);
    const diasNumber = Number(diasKey);

    const labelForPeriodo = (p) => {
      const labels = {
        1: "PRIMER PERÍODO",
        2: "SEGUNDO PERÍODO",
        3: "TERCER PERÍODO",
        4: "CUARTO PERÍODO",
        5: "PRIMER PERÍODO",
        6: "SEGUNDO PERÍODO",
        7: "TERCER PERÍODO",
        8: "CUARTO PERÍODO",
      };
      return labels[p] || `PERIODO ${p}`;
    };

    if (emp.TIPONOM === "F51" || emp.TIPONOM === "M51") {
      const docs = await query("PER_VACACIONALES_BASE", {});

      const matches = docs
        .filter((doc) => Object.prototype.hasOwnProperty.call(doc, diasKey))
        .map((doc) => {
          const fechasObj = doc[diasKey] || {};
          const inicio = fechasObj.FECHA_INI
            ? moment(fechasObj.FECHA_INI).format("YYYY-MM-DD")
            : null;
          const fin = fechasObj.FECHA_FIN
            ? moment(fechasObj.FECHA_FIN).format("YYYY-MM-DD")
            : null;

          return {
            periodo: doc.PERIODO ?? 0,
            label: labelForPeriodo(doc.PERIODO),
            opciones: [
              {
                dias: diasNumber,
                fechas: { inicio, fin },
              },
            ],
            _id: doc._id,
          };
        });

      const month = moment().month();
      const isFirstSection = month >= 1 && month <= 6;
      const filteredMatches = matches.filter((m) =>
        isFirstSection ? m.periodo >= 1 && m.periodo <= 4 : m.periodo >= 5
      );

      emp.PERIODOS_VACACIONALES = filteredMatches;
    } else {
      const docs = await query("PER_VACACIONALES_CONTRATO", {});
      const matches = docs
        .filter((doc) => Object.prototype.hasOwnProperty.call(doc, diasKey))
        .map((doc) => {
          const fechasObj = doc[diasKey] || {};
          const inicio = fechasObj.FECHA_INI
            ? moment(fechasObj.FECHA_INI).format("YYYY-MM-DD")
            : null;
          const fin = fechasObj.FECHA_FIN
            ? moment(fechasObj.FECHA_FIN).format("YYYY-MM-DD")
            : null;

          return {
            periodo: doc.PERIODO ?? 0,
            label: labelForPeriodo(doc.PERIODO),
            opciones: [
              {
                dias: diasNumber,
                fechas: { inicio, fin },
              },
            ],
            _id: doc._id,
          };
        });

      const month = moment().month();
      const isFirstSection = month >= 1 && month <= 6;
      const filteredMatches = matches.filter((m) =>
        isFirstSection ? m.periodo >= 1 && m.periodo <= 4 : m.periodo >= 5
      );
      emp.PERIODOS_VACACIONALES = filteredMatches;
    }

    // Obtener la bitácora del empleado
    const bitacora = await query("BITACORA", {
      id_plantilla: emp._id,
    });

    emp.bitacora = bitacora;

    const ASIST_PROFILE = {
      employee: [emp],
    };

    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: user.username,
      module: "AEI-PI",
      action: `CONSULTÓ EL PERFIL DE VACACIONES DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
    };
    await insertOne("USER_ACTIONS", userAction);
    res.send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};
vacacionesController.updateEmployee = async (req, res) => {
  const data = req.body || {};
  const id = data._id;
  const fecha_vacaciones = data.FECHA_VACACIONES;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    timestamp: currentDateTime,
    username: user && user.username ? user.username : "unknown",
    module: "VACV-PI",
    action: `ACTUALIZÓ LA FECHA DE VACACIONES DEL EMPLEADO CON ID "${id}"`,
  };

  try {
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).send({ error: "ID inválido" });
    }

    // Evitar sobrescribir el _id si viene en el body
    if (data._id) delete data._id;

    const update = {
      $set: { "VACACIONES.FECHA_VACACIONES": fecha_vacaciones },
    };

    // Intentar actualizar en PLANTILLA primero
    let result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(id) },
      update
    );

    // Si no hay coincidencia en PLANTILLA, intentar en PLANTILLA_FORANEA
    if (!result || (result.matchedCount === 0 && result.modifiedCount === 0)) {
      result = await updateOne(
        "PLANTILLA_FORANEA",
        { _id: new ObjectId(id) },
        update
      );
    }

    // Si aun no se encontró, informar 404
    if (!result || (result.matchedCount === 0 && result.modifiedCount === 0)) {
      return res.status(404).send({ error: "Empleado no encontrado" });
    }

    // Registrar acción del usuario (no bloquear respuesta si falla el logging)
    try {
      await insertOne("USER_ACTIONS", userAction);
    } catch (logErr) {
      console.warn("No se pudo registrar user action:", logErr);
    }

    res.send({ message: "Employee updated successfully", _id: id });
  } catch (error) {
    console.error("Error updating employee:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating employee" });
  }
};
vacacionesController.updateVacacionesBase = async (req, res) => {
  const data = req.body;
  const { PERIODO, ...objectsToUpdate } = data;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    timestamp: currentDateTime,
    username: user.username,
    module: "VAC-PI",
    action: `ACTUALIZÓ EL PERIODO DE VACACIONES BASE "${PERIODO}"`,
  };

  try {
    // Obtener la clave del objeto a actualizaR
    const objectKey = Object.keys(objectsToUpdate)[0]; // Ejemplo: "11", "13", etc.
    const objectValue = objectsToUpdate[objectKey]; //

    // Construir el campo dinámico para la actualización
    const updateField = {};
    updateField[`${objectKey}.FECHA_INI`] = objectValue.FECHA_INI;
    updateField[`${objectKey}.FECHA_FIN`] = objectValue.FECHA_FIN;

    // Actualizar solo el objeto específico dentro del documento que coincida con PERIODO
    await updateOne(
      "PER_VACACIONALES_BASE",
      { PERIODO: PERIODO },
      { $set: updateField }
    );

    res.send({ message: "Vacaciones base updated successfully" });
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error("Error updating vacaciones base:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating vacaciones base" });
  }
};

// Mismo método para actualizar PER_VACACIONALES_CONTRATO en CONTRATO
vacacionesController.updateVacacionesContrato = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const { PERIODO, ...objectsToUpdate } = data;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    timestamp: currentDateTime,
    username: user.username,
    module: "VAC-PI",
    action: `ACTUALIZÓ EL PERIODO DE VACACIONES DEL CONTRATO "${PERIODO}"`,
  };
  try {
    const objectKey = Object.keys(objectsToUpdate)[0];
    const objectValue = objectsToUpdate[objectKey];

    const updateField = {};
    updateField[`${objectKey}.FECHA_INI`] = objectValue.FECHA_INI;
    updateField[`${objectKey}.FECHA_FIN`] = objectValue.FECHA_FIN;

    await updateOne(
      "PER_VACACIONALES_CONTRATO",
      { PERIODO: PERIODO },
      { $set: updateField }
    );

    res.send({ message: "Vacaciones contrato updated successfully" });
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error("Error updating vacaciones contrato:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating vacaciones contrato" });
  }
};
vacacionesController.getPeriodosVacacionales = async (req, res) => {
  try {
    const periodosBase = await query("PER_VACACIONALES_BASE", {});
    const periodosContrato = await query("PER_VACACIONALES_CONTRATO", {});
    res.send({ periodosBase, periodosContrato });
  } catch (error) {
    console.error("Error fetching periodos vacacionales:", error);
    res.status(500).send({
      error: "An error occurred while fetching periodos vacacionales",
    });
  }
};
vacacionesController.savePeriodoVacacionalEmpleado = async (req, res) => {
  const data = req.body;
  const id = req.body._id;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    timestamp: currentDateTime,
    username: user.username,
    module: "VACV-PI",
    action: `ACTUALIZÓ LA CONFIGURACIÓN DE VACACIONES DEL EMPLEADO CON ID "${id}"`,
  };

  try {
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).send({ error: "ID inválido" });
    }

    if (
      typeof data.PERIODO === "undefined" ||
      typeof data.DIAS === "undefined"
    ) {
      return res.status(400).send({ error: "PERIODO y DIAS son requeridos" });
    }

    // Evitar sobrescribir el _id si viene en el body
    if (data._id) delete data._id;

    const update = {
      $set: {
        "VACACIONES.PERIODO": data.PERIODO,
        "VACACIONES.DIAS": data.DIAS,
        "VACACIONES.FECHAS": data.FECHAS,
      },
    };

    // Intentar actualizar en PLANTILLA primero
    let result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(id) },
      update
    );

    // Si no se actualizó, intentar en PLANTILLA_FORANEA
    if (!result || (result.modifiedCount === 0 && result.matchedCount === 0)) {
      result = await updateOne(
        "PLANTILLA_FORANEA",
        { _id: new ObjectId(id) },
        update
      );
    }

    if (!result || (result.modifiedCount === 0 && result.matchedCount === 0)) {
      return res.status(404).send({ error: "Empleado no encontrado" });
    }

    // Registrar acción del usuario (no bloquear la respuesta si falla el logging)
    try {
      await insertOne("USER_ACTIONS", userAction);
    } catch (logErr) {
      console.warn("No se pudo registrar user action:", logErr);
    }

    res.status(200).send({ message: "Employee updated successfully", _id: id });
  } catch (error) {
    console.error("Error updating employee:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating employee" });
  }
};
module.exports = vacacionesController;
