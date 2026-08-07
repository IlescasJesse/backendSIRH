const { Router } = require("express");
const router = Router();
const reportesRetroactivosController = require("../../controllers/personal/reportesRetroactivos.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
  "/getBackupDatesAvailable",
  verifyToken,
  reportesRetroactivosController.getBackupDatesAvailable,
);

router.post(
  "/getPlantillaReportAreaRetroactivo",
  verifyToken,
  reportesRetroactivosController.getPlantillaReportAreaRetroactivo,
);

module.exports = router;
