const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
    query,
    updateOne,
    insertOne,
    deleteOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const { querysql } = require("../../config/mysql");
const adscripcionProyectoController = {};

adscripcionProyectoController.getAdscripciones = async (req, res) => {
    try {
        const proyectos = await querysql(`
            SELECT 
                a.id_adscripcion,
                a.nombre AS adscripcion,
                a.nivel,
                a.clave,
                a.parent_id,
                p.id_proyecto,
                p.proyecto
            FROM adscripciones a
            LEFT JOIN adscripcion_proyecto ap 
                ON ap.id_adscripcion = a.id_adscripcion
            LEFT JOIN proyectos p 
                ON p.id_proyecto = ap.id_proyecto
            ORDER BY a.nivel ASC
        `);

        const grouped = {};

        proyectos.forEach(row => {
            const key = row.id_adscripcion;

            if (!grouped[key]) {
                grouped[key] = {
                    id_adscripcion: row.id_adscripcion,
                    nombre: row.adscripcion,
                    nivel: row.nivel,
                    clave: row.clave,
                    parent_id: row.parent_id,
                    proyectos: []
                };
            }

            if (row.id_proyecto) {
                // evitar duplicados (recomendado)
                const existe = grouped[key].proyectos.some(
                    p => p.id_proyecto === row.id_proyecto
                );

                if (!existe) {
                    grouped[key].proyectos.push({
                        id_proyecto: row.id_proyecto,
                        no_proyecto: row.proyecto
                    });
                }
            }
        });

        const resultado = Object.values(grouped);

        const adscripciones = {
            1: [],
            2: [],
            3: [],
            4: [],
            5: []
        };

        resultado.forEach(item => {
            if (adscripciones[item.nivel]) {
                adscripciones[item.nivel].push(item);
            }
        });

        // ✅ RESPUESTA CORRECTA
        res.json({ adscripciones });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Error al obtener adscripciones"
        });
    }
};

adscripcionProyectoController.updateAdscripcion = async (req, res) => {
    try {
        const { id_adscripcion, nombre, clave, parent_id, proyectos } = req.body;

        const existing = await querysql(`SELECT * FROM adscripciones WHERE id_adscripcion = ?`, [id_adscripcion]);

        if (existing.length === 0) {
            return res.status(404).json({ message: "Adscripción no encontrada" });
        }

        const updateData = await querysql(`
            UPDATE adscripciones 
            SET nombre = ?, clave = ?, parent_id = ? 
            WHERE id_adscripcion = ?
        `, [nombre, clave, parent_id, id_adscripcion]);

        await querysql(`DELETE FROM adscripcion_proyecto WHERE id_adscripcion = ?`, [id_adscripcion]);

        if (proyectos && proyectos.length > 0) {

            const placeholders = proyectos.map(() => "(?, ?)").join(", ");
            const values = proyectos.flatMap(id_proyecto => [id_adscripcion, id_proyecto]);

            await querysql(`
                INSERT INTO adscripcion_proyecto (id_adscripcion, id_proyecto)
                VALUES ${placeholders}
            `, values);
        }

        res.json({ message: "Adscripción-proyecto actualizada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar adscripción-proyecto" });
    }
};

adscripcionProyectoController.getProyectos = async (req, res) => {
    try {
        const proyectos = await querysql(`SELECT * FROM proyectos`);
        res.json({ proyectos });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Error al obtener proyectos"
        });
    }
};

adscripcionProyectoController.updateProyecto = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });
    try {
        const { id_proyecto, proyecto, unidad_responsable, unidad_ejecutora, obra_actividad } = req.body;

        if (!id_proyecto || !proyecto || !unidad_responsable || !unidad_ejecutora || !obra_actividad) {
            return res.status(400).json({ message: "Faltan campos obligatorios" });
        }

        existingProyecto = await querysql(`SELECT * FROM proyectos WHERE id_proyecto = ?`, [id_proyecto]);

        if (existingProyecto.length === 0) {
            return res.status(404).json({ message: "Proyecto no encontrado" });
        }

        duplicateProyecto = await querysql(`SELECT * FROM proyectos WHERE proyecto = ? AND id_proyecto != ?`, [proyecto, id_proyecto]);

        if (duplicateProyecto.length > 0) {
            return res.status(409).json({ message: "Ya existe un registro con el mismo proyecto" });
        }

        await querysql(`UPDATE proyectos SET proyecto = ?, unidad_responsable = ?, unidad_ejecutora = ?, obra_actividad = ? WHERE id_proyecto = ?`, [proyecto, unidad_responsable, unidad_ejecutora, obra_actividad, id_proyecto]);

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `MODIFICÓ LA INFORMACIÓN DEL PROYECTO: "${proyecto}" con ID: "${id_proyecto}"`,
            timestamp: currentDateTime,
        };
        await insertOne("USER_ACTIONS", userAction);
        res.json({ message: "Proyecto actualizado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar proyecto" });
    }
};

adscripcionProyectoController.deleteProyecto = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });
    try {
        const { id_proyecto } = req.body;

        if (!id_proyecto) {
            return res.status(400).json({ message: "Falta el ID del proyecto" });
        }

        const existingProyecto = await querysql(`SELECT * FROM proyectos WHERE id_proyecto = ?`, [id_proyecto]);

        if (existingProyecto.length === 0) {
            return res.status(404).json({ message: "Proyecto no encontrado" });
        }

        const adscripcionProyectos = await querysql(`SELECT * FROM adscripcion_proyecto WHERE id_proyecto = ?`, [id_proyecto]);

        if (adscripcionProyectos.length > 0) {
            return res.status(409).json({ message: "No se puede eliminar el proyecto porque está asociado a una adscripción" });
        }

        await querysql(`DELETE FROM proyectos WHERE id_proyecto = ?`, [id_proyecto]);

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `ELIMINÓ EL PROYECTO: "${existingProyecto[0].proyecto}"`,
            timestamp: currentDateTime,
        };
        await insertOne("USER_ACTIONS", userAction);

        res.json({ message: "Proyecto eliminado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al eliminar proyecto" });
    }
}

module.exports = adscripcionProyectoController;
