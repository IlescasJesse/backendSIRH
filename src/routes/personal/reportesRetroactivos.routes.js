const { Router } = require("express");
const router = Router();
const reportesRetroactivosController = require("../../controllers/personal/reportesRetroactivos.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener las fechas de los respaldos realizados en la BD
router.get("/getBackupDatesAvailable", verifyToken, requirePermission(['PSL-RP']), reportesRetroactivosController.getBackupDatesAvailable);

// Ruta para generar y descargar el reporte de área de acuerdo a una fecha anterior
router.post("/getPlantillaReportAreaRetroactivo", verifyToken, requirePermission(['PSL-RP']), reportesRetroactivosController.getPlantillaReportAreaRetroactivo);

module.exports = router;
