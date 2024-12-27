const { query } = require("../config/mongo");

employeeController = {};

employeeController.getVacants = async (req, res) => {
  try {
    const vacants = await query("plantilla_humanos", { status: 2 });
    res.status(200).json(vacants);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

module.exports = employeeController;
