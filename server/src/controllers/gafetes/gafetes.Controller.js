const {
    query,
    deleteOne,
    insertOne,
    findById,
    updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");

const gafetesController = {};

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

        const employee = employeePlantilla.length ? employeePlantilla : employeeForanea.length ? employeeForanea : [];

        if (!employee || employee.length === 0) {
            res.status(404).send({ error: "No data found" });
            return;
        }

        const emp = employee[0]

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

module.exports = gafetesController;