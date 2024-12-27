const { query } = require("../config/mysql");

const registerController = {};

registerController.getAllUsers = async (req, res) => {
  try {
    const data = await query("SELECT * FROM usuarios");
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error en la consulta");
  }
};

module.exports = registerController;
