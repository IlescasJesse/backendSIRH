const { querysql } = require("../config/mysql");

const dependenciesExterior = {};
dependenciesExterior.getDependencies = async (req, res) => {
  try {
    const dependencies = await querysql("SELECT nombre FROM lug_com_lab");
    res.json(dependencies);
  } catch (error) {
    res.status(500).json({ error: "Error fetching data" });
  }
};

dependenciesExterior.postDependencie = async (req, res) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "Nombre is required" });
  }

  try {
    const result = await querysql(
      "INSERT INTO lug_com_lab (nombre) VALUES (?)",
      [nombre]
    );
    res
      .status(201)
      .json({ message: "Dependencie added successfully", id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: "Error adding dependencie" });
  }
};
module.exports = dependenciesExterior;
