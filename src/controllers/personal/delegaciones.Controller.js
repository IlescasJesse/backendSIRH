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
const delegacionesController = {};

delegacionesController.getDelegaciones = async (req, res) => {
    try {

        const delegaciones = await querysql(
            `SELECT * FROM delegaciones ORDER BY delegacion;`
        );

        if (delegaciones.length === 0) {
            return res.status(404).json({ message: "No hay delegaciones" });
        }

        return res.status(200).json(delegaciones);
    } catch (error) {
        return res.status(500).json({ message: "Error en el servidor", error });
    }
};

delegacionesController.newDelegacion = async (req, res) => {
    try {
        const { delegacion, delegado } = req.body;

        if (!delegacion || !delegado) {
            return res.status(400).json({ message: "Falta información de datos" });
        }

        const existingDelegacion = await querysql(
            `SELECT * FROM delegaciones WHERE delegacion = ?`,
            [delegacion]
        );

        if (existingDelegacion.length > 0) {
            return res.status(409).json({ message: "La delegación ya existe" });
        }

        const result = await querysql(
            `INSERT INTO delegaciones (delegacion, delegado) VALUES (?, ?)`,
            [delegacion, delegado]
        );

        return res.status(202).json({ message: "Delegación creada", result });

    } catch (error) {
        return res.status(500).json({ message: "Error en el servidor", error });
    }
};


module.exports = delegacionesController;
