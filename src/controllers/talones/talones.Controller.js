const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");

const talonesController = {};

// Obtener perfil del empleado y calcular días restantes
talonesController.getProfile = async (req, res) => {
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

    console.log("Employee data:", emp.STATUS_EMPLEADO);

    // Obtener la bitácora del empleado
    const bitacora = await query("BITACORA", {
      id_plantilla: emp._id,
    });
    emp.bitacora = bitacora;

    const incapacidades = await query("INCAPACIDADES", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });
    const permisosExt = await query("PERMISOS_EXT", {
      ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
    });

    // Buscar documento de talones del empleado
    const talonesDoc = await query("TALONES", {
      id_empleado: new ObjectId(emp._id),
    });

    const ASIST_PROFILE = {
      employee: [emp],
      incapacidades: incapacidades,
      permisosExt: permisosExt,
      talones: talonesDoc, // <-- aquí están el talón actual y los anteriores
    };

    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: user.username,
      module: "AEI-PI",
      action: `CONSULTÓ EL PERFIL DE TALÓN DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
    };
    await insertOne("USER_ACTIONS", userAction);
    console.log("Profile data:", ASIST_PROFILE);

    res.status(200).send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

// Obtener talones pendientes a regresar
talonesController.getAllTalonesPendientesRegresar = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    // Obtener todos los documentos de talones
    const talonesDocumentos = await query("TALONES", {});

    if (!talonesDocumentos || talonesDocumentos.length === 0) {
      return res.status(404).send({ error: "No talones found" });
    }

    // Obtener todos los empleados
    const [empleadosPlantilla = [], empleadosForanea = []] = await Promise.all([
      query("PLANTILLA", { status: 1 }),
      query("PLANTILLA_FORANEA", { status: 1 }),
    ]);
    const todosEmpleados = [...empleadosPlantilla, ...empleadosForanea];

    // Mapeo de ID empleado a datos del empleado
    const empleadosMap = {};
    todosEmpleados.forEach((emp) => {
      empleadosMap[emp._id.toString()] = emp;
    });

    // Filtrar talones con status === 2 y enriquecer con datos del empleado
    const talonesRegresar = [];

    talonesDocumentos.forEach((doc) => {
      const empleado = empleadosMap[doc.id_empleado.toString()];

      if (empleado && Array.isArray(doc.TALONES)) {
        doc.TALONES.forEach((talon) => {
          if (talon.status === 3) {
            talonesRegresar.push({
              _id: talon._id,
              QUINCENA: talon.QUINCENA,
              status: talon.status,
              empleado: {
                _id: empleado._id,
                NOMBRE: `${empleado.APE_PAT || ''} ${empleado.APE_MAT || ''} ${empleado.NOMBRES || ''}`.trim(),
                TIPONOM: empleado.TIPONOM,
                ADSCRIPCION: empleado.ADSCRIPCION
              }
            });
          }
        });
      }
    });

    // Registrar acción del usuario
    const userAction = {
      username: user.username,
      module: "TAL-REG",
      action: `CONSULTÓ TALONES PENDIENTES A REGRESAR (STATUS 2)`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).send(talonesRegresar);
  } catch (error) {
    console.error("Error fetching talones a regresar:", error);
    res.status(500).send({ error: "An error occurred while fetching talones" });
  }
};

// Obtener talones pendientes a entregar (status === 2) con información del empleado
talonesController.getAllTalonesPendintesEntregar = async (req, res) => {
  const user = req.user;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    // Obtener todos los documentos de talones
    const talonesDocumentos = await query("TALONES", {});

    if (!talonesDocumentos || talonesDocumentos.length === 0) {
      return res.status(404).send({ error: "No talones found" });
    }

    // Obtener todos los empleados
    const [empleadosPlantilla = [], empleadosForanea = []] = await Promise.all([
      query("PLANTILLA", { status: 1 }),
      query("PLANTILLA_FORANEA", { status: 1 }),
    ]);
    const todosEmpleados = [...empleadosPlantilla, ...empleadosForanea];

    // Mapeo de ID empleado a datos del empleado
    const empleadosMap = {};
    todosEmpleados.forEach((emp) => {
      empleadosMap[emp._id.toString()] = emp;
    });

    // Filtrar talones con status === 2 y enriquecer con datos del empleado
    const talonesEntregar = [];

    talonesDocumentos.forEach((doc) => {
      const empleado = empleadosMap[doc.id_empleado.toString()];

      if (empleado && Array.isArray(doc.TALONES)) {
        doc.TALONES.forEach((talon) => {
          if (talon.status === 2) {
            talonesEntregar.push({
              _id: talon._id,
              QUINCENA: talon.QUINCENA,
              status: talon.status,
              empleado: {
                _id: empleado._id,
                NOMBRE: `${empleado.APE_PAT || ''} ${empleado.APE_MAT || ''} ${empleado.NOMBRES || ''}`.trim(),
                TIPONOM: empleado.TIPONOM,
                ADSCRIPCION: empleado.ADSCRIPCION,
              },
            });
          }
        });
      }
    });
    // Registrar acción del usuario
    const userAction = {
      username: user.username,
      module: "TAL-ENT",
      action: `CONSULTÓ TALONES PENDIENTES A ENTREGAR (STATUS 2)`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).send(talonesEntregar);
  } catch (error) {
    console.error("Error fetching talones a entregar:", error);
    res.status(500).send({ error: "An error occurred while fetching talones" });
  }
};

module.exports = talonesController;
