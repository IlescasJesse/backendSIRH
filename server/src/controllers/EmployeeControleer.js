const employeeController = {};

const Employee = require("../models/Employee");

employeeController.getEmployees = async (req, res) => {
  const employees = await Employee.find();
  res.json(employees);
};
module.exports = employeeController;
