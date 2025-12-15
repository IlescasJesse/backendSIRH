const { Router } = require("express");
const router = Router();
const addEmployeeController = require("../../controllers/personal/addEmployee.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/getvacants", verifyToken, addEmployeeController.getVacants);
router.get(
  "/getinternalInformation",
  addEmployeeController.internalInformation
);
router.post("/getMpios", addEmployeeController.getMpio);
router.post("/getdataPlaza", addEmployeeController.dataPlaza);
router.post("/makeProposal", verifyToken, addEmployeeController.makeProposal);
router.post(
  "/getDataTemplate",
  verifyToken,
  addEmployeeController.getDataTemplate
);
router.post("/saveEmployee", verifyToken, addEmployeeController.saveEmployee);
router.post(
  "/updateEmployee",
  verifyToken,
  addEmployeeController.updateEmployee
);
router.post("/download-alta/:curp", addEmployeeController.downloadAlta);
router.post("/addPlaza", verifyToken, addEmployeeController.newPlaza);
router.post("/addCommit", verifyToken, addEmployeeController.addCommit);
router.put("/updateCommit", verifyToken, addEmployeeController.updateCommit);
router.put("/deleteCommit", verifyToken, addEmployeeController.deleteCommit);
router.post(
  "/reinstallEmployee",
  verifyToken,
  addEmployeeController.reinstallEmployee
);

module.exports = router;
