const { Router } = require("express");
const router = Router();
const employeeController = require("../controllers/employees.Controller");

router.get("/employees", employeeController.getEmployees);
router.post("/employee/profile/:id", employeeController.getProfileData);
router.post("/employee/:query", employeeController.getEmployee);

module.exports = router;
