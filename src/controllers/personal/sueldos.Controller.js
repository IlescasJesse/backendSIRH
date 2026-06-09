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
const sueldosController = {};

sueldosController.getSueldosAndQuin = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const sueldosBase = await querysql(`SELECT * FROM catalogo_base`);
        const sueldosContrato = await querysql(`SELECT * FROM catalogo_contrato`);
        const sueldosMandosMedios = await querysql(`SELECT * FROM catalogo_mandosmedios`);

        const quinBase = await querysql(`SELECT * FROM quin_base`);
        const quinContrato = await querysql(`SELECT * FROM quin_confianza`);
        const quinMandosMedios = await querysql(`SELECT * FROM quin_mandosmedios`);

        const estimulos = await query("PERSONAL_ESTIMULO");

        const gasadmi = await query("PERSONAL_GASADMI");

        const estimulosWithEmployee = await Promise.all(
            estimulos.map(async (estimulo) => {
                let employeeInfo = null;

                if (estimulo.id_employee && ObjectId.isValid(String(estimulo.id_employee))) {
                    const employeeResult = await query("PLANTILLA", {
                        _id: new ObjectId(String(estimulo.id_employee)),
                    });

                    employeeInfo = Array.isArray(employeeResult) ? employeeResult[0] || null : null;
                }

                return {
                    ...estimulo,
                    NOMBRE: employeeInfo.status === 1 ? `${employeeInfo.APE_PAT || ''} ${employeeInfo.APE_MAT || ''} ${employeeInfo.NOMBRES || ''}`.trim() : 'V A C A N T E',
                    NUMPLA: employeeInfo.NUMPLA || null,
                    TIPONOM: employeeInfo.TIPONOM || null,
                };
            })
        );

        const gasadmiWithEmployee = await Promise.all(
            gasadmi.map(async (estimulo) => {
                let employeeInfo = null;

                if (estimulo.id_employee && ObjectId.isValid(String(estimulo.id_employee))) {
                    const employeeResult = await query("PLANTILLA", {
                        _id: new ObjectId(String(estimulo.id_employee)),
                    });

                    employeeInfo = Array.isArray(employeeResult) ? employeeResult[0] || null : null;
                }

                return {
                    ...estimulo,
                    NOMBRE: employeeInfo.status === 1 ? `${employeeInfo.APE_PAT || ''} ${employeeInfo.APE_MAT || ''} ${employeeInfo.NOMBRES || ''}`.trim() : 'V A C A N T E',
                    NUMPLA: employeeInfo.NUMPLA || null,
                    TIPONOM: employeeInfo.TIPONOM || null,
                };
            })
        );


        const data = {
            SUELDOS: {
                BASE: sueldosBase,
                CONTRATO: sueldosContrato,
                MANDOS_MEDIOS: sueldosMandosMedios
            },
            QUINQUENIOS: {
                BASE: quinBase,
                CONTRATO: quinContrato,
                MANDOS_MEDIOS: quinMandosMedios
            },
            ESTIMULOS: estimulosWithEmployee,
            GASADMI: gasadmiWithEmployee
        };

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `CONSULTÓ LA INFORMACIÓN DE SUELDOS Y QUINQUENIOS`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Error al obtener el catálogo de sueldos"
        });
    }
};

sueldosController.putSueldos = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });
    try {
        const data = req.body;
        nameTable = '';

        if (data.tipo === 'BASE') {
            nameTable = 'catalogo_base';
        } else if (data.tipo === 'CONTRATO') {
            nameTable = 'catalogo_contrato';
        } else if (data.tipo === 'MANDOS_MEDIOS') {
            nameTable = 'catalogo_mandosmedios';
        }

        if (!nameTable) {
            return res.status(400).json({ message: "Tipo inválido" });
        }

        const sueldo = await querysql(`SELECT * FROM ${nameTable} WHERE nivel = ?`, [data.nivel]);

        if (sueldo.length === 0) {
            return res.status(404).json({ message: "Sueldo no encontrado" });
        }

        const { id, nivel, tipo, ...fieldsToUpdate } = data;
        const keys = Object.keys(fieldsToUpdate);

        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const values = keys.map(key => fieldsToUpdate[key]);

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `MODIFICÓ LA INFORMACIÓN DE SUELDOS DE: "${data.tipo}" DEL NIVEL: "${data.nivel}"`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);

        await querysql(
            `UPDATE ${nameTable} SET ${setClause} WHERE nivel = ?`,
            [...values, nivel]
        );

        return res.json({ message: "Actualizado correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar el sueldo" });
    }
}

sueldosController.putQuinquenios = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });
    try {
        const data = req.body;
        nameTable = '';

        if (data.tipo === 'BASE') {
            nameTable = 'quin_base';
        } else if (data.tipo === 'CONTRATO') {
            nameTable = 'quin_confianza';
        } else if (data.tipo === 'MANDOS_MEDIOS') {
            nameTable = 'quin_mandosmedios';
        }

        if (!nameTable) {
            return res.status(400).json({ message: "Tipo inválido" });
        }

        const quinquenio = await querysql(`SELECT * FROM ${nameTable} WHERE nivel = ?`, [data.nivel]);

        if (quinquenio.length === 0) {
            return res.status(404).json({ message: "Quinquenio no encontrado" });
        }

        const { nivel, tipo, ...fieldsToUpdate } = data;
        const keys = Object.keys(fieldsToUpdate);

        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const values = keys.map(key => fieldsToUpdate[key]);

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `MODIFICÓ LA INFORMACIÓN DE QUINQUENIOS DE: "${data.tipo}" DEL NIVEL: "${data.nivel}"`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);

        await querysql(
            `UPDATE ${nameTable} SET ${setClause} WHERE nivel = ?`,
            [...values, nivel]
        );

        return res.json({ message: "Actualizado correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar el quinquenio" });
    }
}

sueldosController.newEstimulo = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id_employee, estimulo } = req.body.data;

        if (!id_employee || !estimulo) {
            return res.status(400).json({ message: "Información faltante que es requerida" });
        }

        const employee = await query("PLANTILLA", { _id: new ObjectId(id_employee) });

        if (employee.length === 0) {
            return res.status(404).json({ message: "Empleado no encontrado" });
        }

        const existingEstimulo = await query("PERSONAL_ESTIMULO", {
            id_employee: new ObjectId(id_employee),
        });

        if (existingEstimulo.length > 0) {
            return res.status(409).json({ message: "Empleado con estimulo ya registrado" });
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `AGREGÓ AL EMPLEADO CON ID: "${id_employee}" UN NUEVO ESTÍMULO DE: "${estimulo}"`,
            timestamp: currentDateTime,
        };

        const data = {
            id_employee: new ObjectId(id_employee),
            estimulo: estimulo
        }

        await insertOne("USER_ACTIONS", userAction);
        await insertOne("PERSONAL_ESTIMULO", data)

        return res.json({ message: "Estimulo registrado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al registrar el estímulo" });
    }
}

sueldosController.updateEstimulo = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id_employee, estimulo } = req.body.data;

        if (!id_employee || !estimulo) {
            return res.status(400).json({ message: "Información faltante que es requerida" });
        }

        const existingEstimulo = await query("PERSONAL_ESTIMULO", {
            id_employee: new ObjectId(id_employee),
        });

        if (existingEstimulo.length === 0) {
            return res.status(404).json({ message: "Personal con estimulo no encontrado" });
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `MODIFICÓ EL ESTÍMULO DEL EMPLEADO CON ID: "${id_employee}"`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);
        await updateOne(
            "PERSONAL_ESTIMULO",
            { id_employee: new ObjectId(id_employee) },
            { $set: { estimulo: estimulo } }
        );
        return res.json({ message: "Estimulo actualizado correctamente" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error al actualizar el estímulo" });
    }
}

sueldosController.deleteEstimulo = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id, id_employee } = req.body;

        const existingEstimulo = await query("PERSONAL_ESTIMULO", {
            id_employee: new ObjectId(id_employee),
        });

        if (existingEstimulo.length === 0) {
            return res.status(404).json({ message: "Personal con estimulo no encontrado" });
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `ELIMINÓ EL ESTÍMULO DEL EMPLEADO CON ID: "${id_employee}"`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);

        await deleteOne("PERSONAL_ESTIMULO", {
            id_employee: new ObjectId(id_employee),
        });
        return res.json({ message: "Estimulo eliminado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al eliminar el estímulo" });
    }
}

sueldosController.newGasadmi = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id_employee, gasadmi } = req.body.data;

        if (!id_employee || !gasadmi) {
            return res.status(400).json({ message: "Información faltante que es requerida" });
        }

        const employee = await query("PLANTILLA", { _id: new ObjectId(id_employee) });

        if (employee.length === 0) {
            return res.status(404).json({ message: "Empleado no encontrado" });
        }

        const existingGasadmi = await query("PERSONAL_GASADMI", {
            id_employee: new ObjectId(id_employee),
        });

        if (existingGasadmi.length > 0) {
            return res.status(409).json({ message: "Empleado con gasadmi ya registrado" });
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `AGREGÓ AL EMPLEADO CON ID: "${id_employee}" UN NUEVO GASADMI DE: "${gasadmi}"`,
            timestamp: currentDateTime,
        };

        const data = {
            id_employee: new ObjectId(id_employee),
            gasadmi: gasadmi
        }

        await insertOne("USER_ACTIONS", userAction);
        await insertOne("PERSONAL_GASADMI", data)

        return res.json({ message: "Gasadmi registrado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al registrar el estímulo" });
    }
}

sueldosController.updateGasadmi = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id_employee, gasadmi } = req.body.data;

        if (!id_employee || !gasadmi) {
            return res.status(400).json({ message: "Información faltante que es requerida" });
        }

        const existingGasadmi = await query("PERSONAL_GASADMI", {
            id_employee: new ObjectId(id_employee),
        });

        if (existingGasadmi.length === 0) {
            return res.status(404).json({ message: "Personal con gasadmi no encontrado" });
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `MODIFICÓ EL GASADMI DEL EMPLEADO CON ID: "${id_employee}"`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);
        await updateOne(
            "PERSONAL_GASADMI",
            { id_employee: new ObjectId(id_employee) },
            { $set: { gasadmi: gasadmi } }
        );
        return res.json({ message: "Gasadmi actualizado correctamente" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error al actualizar el gasadmi" });
    }
}

sueldosController.deleteGasadmi = async (req, res) => {
    const { user } = req;
    const currentDateTime = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
    });

    try {
        const { id, id_employee } = req.body;

        const existingEstimulo = await query("PERSONAL_GASADMI", {
            id_employee: new ObjectId(id_employee),
        });

        if (existingEstimulo.length === 0) {
            return res.status(404).json({ message: "Personal con gasadmi no encontrado" });
        }

        const userAction = {
            username: user.username,
            module: "PSL-CE",
            action: `ELIMINÓ EL GASADMI DEL EMPLEADO CON ID: "${id_employee}"`,
            timestamp: currentDateTime,
        };

        await insertOne("USER_ACTIONS", userAction);

        await deleteOne("PERSONAL_GASADMI", {
            id_employee: new ObjectId(id_employee),
        });
        return res.json({ message: "Gasadmi eliminado correctamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al eliminar el gasadmi" });
    }
}

module.exports = sueldosController;
