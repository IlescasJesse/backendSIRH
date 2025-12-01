const { Router } = require("express");
const router = Router();
const gafetesController = require("../../controllers/gafetes/gafetes.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.post(
  "/createProvCredentials",
  verifyToken,
  gafetesController.createProvCredentials
);
router.get("/getEmployee/:id", verifyToken, gafetesController.getProfile);
router.put(
  "/updateEmployee",
  verifyToken,
  gafetesController.updateEmployee
);
router.post(
  "/printCredentialsEstructure",
  verifyToken,
  gafetesController.printCredentialsEstructure
);
router.post(
  "/printCredentialsHonorarios",
  verifyToken,
  gafetesController.printCredentialsHonorarios
);
router.post(
  "/printCredentialsServicios",
  verifyToken,
  gafetesController.printCredentialsServicios
);

module.exports = router;
