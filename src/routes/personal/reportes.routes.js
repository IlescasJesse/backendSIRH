const { Router } = require("express");
const router = Router();
const reportesPersonalController = require("../../controllers/personal/reportesPersonal.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener buscar a los empleados de acuerdo a filtros y la generación del reporte
router.post("/getDataPersonalizada", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getDataPersonalizada);

// Ruta para generar y descargar el reporte de la plantilla activa en excel
router.get("/getPlantillaXLSX/:status", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getPlantillaXLSX);

// Ruta para generar y descargar el reporte de área actualmente
router.post("/getPlantillaReportArea", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getPlantillaReportArea);

// Ruta para generar y descargar el reporte de las bajas entre un rango de fechas
router.post("/getBajasBetweenDates", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getBajasBetweenDates);

// Ruta para generar y descargar el reporte de las licencias activas
router.get("/getReportLicenses", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getReportLicenses);

// Ruta para generar y descargar el reporte de vacaciones de empleados por área
router.post("/getReportVacationsArea", verifyToken, requirePermission(['PSL-RPV']), reportesPersonalController.getReportVacationsArea);

module.exports = router;
