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
            `SELECT 
            d.delegacion,
            del.nombre AS delegado
            FROM delegaciones d
            LEFT JOIN delegados del ON d.id = del.id_delegacion
            ORDER BY d.delegacion, del.nombre;`
        );

        if (delegaciones.length === 0) {
            return res.status(404).json({ message: "No hay delegaciones" });
        }

        // Agrupar por delegación
        const resultado = [];
        const mapa = {};

        delegaciones.forEach(row => {
            if (!mapa[row.delegacion]) {
                mapa[row.delegacion] = {
                    delegacion: row.delegacion,
                    delegados: []
                };
                resultado.push(mapa[row.delegacion]);
            }

            if (row.delegado) {
                mapa[row.delegacion].delegados.push(row.delegado);
            }
        });

        // 🔥 Convertir array a string
        resultado.forEach(item => {
            item.delegados = item.delegados.join(" y ");
        });
        return res.status(200).json(resultado);
    } catch (error) {
        return res.status(500).json({ message: "Error en el servidor", error });
    }
};


module.exports = delegacionesController;
