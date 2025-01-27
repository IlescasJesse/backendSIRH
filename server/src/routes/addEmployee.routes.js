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
router.post("/makeProposal", addEmployeeController.makeProposal);
router.post("/getDataTemplate", addEmployeeController.getDataTemplate);
router.post("/saveEmployee", addEmployeeController.saveEmployee);
router.post("/updateEmployee", addEmployeeController.updateEmployee);
router.post("/download-alta/:curp", addEmployeeController.downloadAlta);
module.exports = router;
