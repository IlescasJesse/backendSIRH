const { Router } = require("express");
const router = Router();
const addEmployeeController = require("../controllers/addEmployee.Controller");

router.get("/getvacants", addEmployeeController.getVacants);
router.get(
  "/getinternalInformation",
  addEmployeeController.internalInformation
);
router.post("/getMpios", addEmployeeController.getMpio);
router.post("/getdataPlaza", addEmployeeController.dataPlaza);
router.post("/saveEmployee", addEmployeeController.saveEmployee);
module.exports = router;
