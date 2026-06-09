const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
    query,
    updateOne,
    updateMany,
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
                a.tipo,
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
                    tipo: row.tipo,
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

adscripcionProyectoController.newAdscripcion = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { nombre, tipo, nivel, clave, parent_id, proyectos } = req.body;

        if (!nombre || !tipo || !nivel || clave === undefined) {
            return res.status(400).json({ message: "Faltan campos obligatorios (nombre, tipo, nivel, clave)" });
        }

        const existing = await querysql(
            `SELECT id_adscripcion FROM adscripciones WHERE nombre = ? AND clave = ?`,
            [nombre, clave]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: "Adscripción ya registrada" });
        }

        const insertResult = await querysql(`
            INSERT INTO adscripciones (nombre, tipo, nivel, clave, parent_id)
            VALUES (?, ?, ?, ?, ?)
        `, [nombre, tipo, nivel, clave, parent_id || null]);

        const id_adscripcion = insertResult.insertId;

        if (proyectos && proyectos.length > 0) {
            const placeholders = proyectos.map(() => "(?, ?)").join(", ");
            const values = proyectos.flatMap(id_proyecto => [id_adscripcion, id_proyecto]);

            await querysql(`
                INSERT INTO adscripcion_proyecto (id_adscripcion, id_proyecto)
                VALUES ${placeholders}
            `, values);
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `REGISTRÓ UNA NUEVA ADSCRIPCIÓN: "${nombre}"`,
            timestamp: currentDateTime,
        };
        await insertOne("USER_ACTIONS", userAction);

        res.status(201).json({
            message: "Adscripción creada correctamente",
            id_adscripcion
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al crear la adscripción" });
    }
};

adscripcionProyectoController.updateAdscripcion = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id_adscripcion, nombre, clave, parent_id, proyectos, previousName, previousKey } = req.body;

        const existing = await querysql(`SELECT * FROM adscripciones WHERE id_adscripcion = ?`, [id_adscripcion]);

        if (existing.length === 0) {
            return res.status(404).json({ message: "Adscripción no encontrada" });
        }

        const duplicateData = await querysql(
            `SELECT id_adscripcion FROM adscripciones WHERE nombre = ? AND clave = ? AND id_adscripcion != ?`,
            [nombre, clave, id_adscripcion]
        );

        if (duplicateData.length > 0) {
            return res.status(409).json({ message: "Adscripción ya registrada" });
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

        const updateFilters = [];
        if (previousName && previousName !== nombre) {
            updateFilters.push({ ADSCRIPCION: previousName });
        }
        if (previousKey && previousKey !== clave) {
            updateFilters.push({ CLAVE: previousKey });
        }

        if (updateFilters.length > 0) {
            const updateData = {};
            if (previousName && previousName !== nombre) updateData.ADSCRIPCION = nombre;
            if (previousKey && previousKey !== clave) updateData.CLAVE = clave;

            for (const filter of updateFilters) {
                await updateMany("PLANTILLA", filter, { $set: updateData });
            }

            for (const filter of updateFilters) {
                await updateMany("PLANTILLA_FORANEA", filter, { $set: updateData });
            }

            if (previousName && previousName !== nombre) {
                await updateMany(
                    "PLANTILLA",
                    { "STATUS_EMPLEADO.LUGAR_COMISIONADO": previousName },
                    { $set: { "STATUS_EMPLEADO.$[elem].LUGAR_COMISIONADO": nombre } },
                    { arrayFilters: [{ "elem.LUGAR_COMISIONADO": previousName }] }
                );

                await updateMany(
                    "PLANTILLA_FORANEA",
                    { "STATUS_EMPLEADO.LUGAR_COMISIONADO": previousName },
                    { $set: { "STATUS_EMPLEADO.$[elem].LUGAR_COMISIONADO": nombre } },
                    { arrayFilters: [{ "elem.LUGAR_COMISIONADO": previousName }] }
                );
            }

            if (previousKey && previousKey !== clave) {
                await updateMany(
                    "PLANTILLA",
                    { "STATUS_EMPLEADO.CLAVE": previousKey },
                    { $set: { "STATUS_EMPLEADO.$[elem].CLAVE": clave } },
                    { arrayFilters: [{ "elem.CLAVE": previousKey }] }
                );

                await updateMany(
                    "PLANTILLA_FORANEA",
                    { "STATUS_EMPLEADO.CLAVE": previousKey },
                    { $set: { "STATUS_EMPLEADO.$[elem].CLAVE": clave } },
                    { arrayFilters: [{ "elem.CLAVE": previousKey }] }
                );
            }
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `MODIFICÓ LA INFORMACIÓN DE LA ADSCRIPCIÓN CON EL ID "${id_adscripcion}"`,
            timestamp: currentDateTime,
        };
        await insertOne("USER_ACTIONS", userAction);
        res.json({ message: "Adscripción-proyecto actualizada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar adscripción-proyecto" });
    }
};

adscripcionProyectoController.deleteAdscripcion = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id_adscripcion } = req.body;

        if (!id_adscripcion) {
            return res.status(400).json({ message: "Falta el ID de la adscripción" });
        }

        const existing = await querysql(`SELECT * FROM adscripciones WHERE id_adscripcion = ?`, [id_adscripcion]);

        if (existing.length === 0) {
            return res.status(404).json({ message: "Adscripción no encontrada" });
        }

        await querysql(
            `UPDATE adscripciones SET parent_id = NULL WHERE parent_id = ?`,
            [id_adscripcion]
        );

        await querysql(
            `DELETE FROM adscripcion_proyecto WHERE id_adscripcion = ?`,
            [id_adscripcion]
        );

        await querysql(
            `DELETE FROM adscripciones WHERE id_adscripcion = ?`,
            [id_adscripcion]
        );

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `ELIMINÓ LA INFORMACIÓN DE LA ADSCRIPCIÓN CON EL ID "${id_adscripcion}"`,
            timestamp: currentDateTime,
        };
        await insertOne("USER_ACTIONS", userAction);
        res.json({ message: "Adscripción-proyecto actualizada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar adscripción-proyecto" });
    }
};

adscripcionProyectoController.getCatalogoAdsc = async (req, res) => {
    try {
        const catalogo = await querysql(`SELECT * FROM aux_catalogo_adsc`);
        res.json({ catalogo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener los catalogos" });
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

adscripcionProyectoController.newProyecto = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "Amer ica/Mexico_City",
    });
    try {
        const { proyecto, unidad_responsable, unidad_ejecutora, obra_actividad } = req.body;

        if (!proyecto || !unidad_responsable || !unidad_ejecutora || !obra_actividad) {
            return res.status(400).json({ message: "Faltan campos obligatorios" });
        }

        duplicateProyecto = await querysql(`SELECT * FROM proyectos WHERE proyecto = ?`, [proyecto]);

        if (duplicateProyecto.length > 0) {
            return res.status(409).json({ message: "Ya existe un registro con el mismo proyecto" });
        }

        await querysql(`INSERT INTO proyectos (proyecto, unidad_responsable, unidad_ejecutora, obra_actividad) VALUES (?,?,?,?)`,
            [proyecto, unidad_responsable, unidad_ejecutora, obra_actividad]);

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `REGISTRÓ UN NUEVO PROYECTO: "${proyecto}"`,
            timestamp: currentDateTime,
        };
        await insertOne("USER_ACTIONS", userAction);
        res.json({ message: "Proyecto registrado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al registrar el proyecto" });
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
