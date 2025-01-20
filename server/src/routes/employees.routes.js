const { Router } = require("express");
const router = Router();
const employeeController = require("../controllers/employees.Controller");

router.get("/getemployees", employeeController.getEmployees);
router.post("/getemployee/profile/:id", employeeController.getProfileData);
router.post("/getemployee/:query", employeeController.getEmployee);

module.exports = router;
