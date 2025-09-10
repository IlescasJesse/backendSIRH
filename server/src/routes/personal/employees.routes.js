const { Router } = require("express");
const router = Router();
const employeeController = require("../../controllers/personal/employees.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const incidenciasController = require("../../controllers/incidencias/incidencias.Controller");

router.get(
  "/getemployee/:queryParam",
  verifyToken,
  incidenciasController.getEmployee
);
router.get("/getemployees", verifyToken, employeeController.getEmployees);
router.post(
  "/getemployee/profile/:id",
  verifyToken,
  employeeController.getProfileData
);
// router.post(
//     "/getemployee/:query",
//     verifyToken,
//     incidenciasController.getEmployee
//   );
router.put("/updateProyect", verifyToken, employeeController.updateProyect);
router.put("/recategorizeEmployee", verifyToken, employeeController.recategorizeEmployee);
router.get("/getUserActions", verifyToken, employeeController.getUserActions);

module.exports = router;
