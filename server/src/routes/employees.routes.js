const { Router } = require("express");
const router = Router();
const employeeController = require("../controllers/EmployeeControleer");

router.get("/employees", employeeController.getEmployees);

module.exports = router;
