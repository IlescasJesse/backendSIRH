const { Router } = require("express");
const router = Router();
const addEmployeeController = require("../controllers/addEmployee.Controller");

router.get("/vacants", addEmployeeController.getVacants);

module.exports = router;
