const {
    query,
    deleteOne,
    insertOne,
    findById,
    updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

const permisosExtController = {};

// Obtener perfil del empleado
permisosExtController.getProfile = async (req, res) => {
    const id = req.params.id;
    const user = req.user;

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

        // Obtener la bitácora del empleado
        const bitacora = await query("BITACORA", {
            id_plantilla: emp._id,
        });
        emp.bitacora = bitacora;

        const permisosExt = await query("PERMISOS_EXT", {
            ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
        });
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

        res.send(ASIST_PROFILE);
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).send({ error: "An error occurred while fetching data" });
    }
};

module.exports = permisosExtController;
