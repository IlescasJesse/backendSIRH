const { querysql } = require("../config/mysql");
const bodyParser = require("body-parser");

const registerController = {};

registerController.getAllUsers = async (req, res) => {
  try {
    const data = await querysql("SELECT * FROM usuarios");
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error en la consulta");
  }
};

registerController.addUser = async (req, res) => {
  const data = req.body;

  console.log(data);
  res.json({ message: "Usuario agregado" });
};

module.exports = registerController;
