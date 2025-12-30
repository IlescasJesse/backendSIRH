const { Router } = require("express");
const router = Router();
const talonesController = require("../../controllers/talones/talones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/perfil-talon/:id", verifyToken, talonesController.getProfile);
router.get(
  "/talones-pendientes-entregar",
  verifyToken,
  talonesController.getAllTalonesPendintesEntregar
);
router.get(
  "/talones-pendientes-regresar",
  verifyToken,
  talonesController.getAllTalonesPendientesRegresar
);
router.post("/entregar-talon", verifyToken, talonesController.uploadTalonImage);
module.exports = router;
