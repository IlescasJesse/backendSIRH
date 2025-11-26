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

    const emp = employee[0];

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
    console.log("Profile data:", ASIST_PROFILE);
    res.send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};
vacacionesController.updateEmployee = async (req, res) => {
  const data = req.body;
  const id = req.params._id;
  const fecha_vacaciones = req.body.FECHA_VACACIONES;
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const userAction = {
    timestamp: currentDateTime,
    username: user.username,
    module: "VACV-PI",
    action: `ACTUALIZÓ LA FECHA DE VACACIONES DEL EMPLEADO CON ID "${id}"`,
  };
  try {
    // Evitar sobrescribir el _id
    if (data._id) {
      delete data._id;
    }
    // Actualizar la propiedad VACACIONES con fecha_vacaciones
    await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(id) },
      { $set: { "VACACIONES.FECHA_VACACIONES": fecha_vacaciones } }
    );
    res.send({ message: "Employee updated successfully" });
    await insertOne("USER_ACTIONS", userAction);
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
  await insertOne("USER_ACTIONS", userAction);

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
vacacionesController.updatePeriodoVacacionalEmpleado = async (req, res) => {};
module.exports = vacacionesController;
