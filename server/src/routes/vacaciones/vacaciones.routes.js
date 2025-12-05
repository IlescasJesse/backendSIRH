const { Router } = require("express");
const router = Router();
const vacacionesController = require("../../controllers/vacaciones/vacaciones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
  "/perfil-vacaciones/:id",
  verifyToken,
  vacacionesController.getProfile
);
router.put("/updateEmployee", verifyToken, vacacionesController.updateEmployee);
router.put(
  "/PeriodosBase",
  verifyToken,
  vacacionesController.updateVacacionesBase
);
router.put(
  "/PeriodosContrato",
  verifyToken,
  vacacionesController.updateVacacionesContrato
);
router.get(
  "/getPeriodosVacacionales",
  verifyToken,
  vacacionesController.getPeriodosVacacionales
);
router.put(
  "/savePeriodoVacacionalEmpleado",
  verifyToken,
  vacacionesController.savePeriodoVacacionalEmpleado
);
module.exports = router;
