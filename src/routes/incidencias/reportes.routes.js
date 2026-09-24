const { Router } = require("express");
const router = Router();
const reportesIncidenciasController = require("../../controllers/incidencias/reportesIncidencias.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para generar y descargar el reporte de incidencias
router.get("/printIncidencias/:area/:quin", verifyToken, requirePermission(['AEI-CAIC', 'AEI-CAIA', 'AEI-CAIP']), reportesIncidenciasController.printIncidencias);

// Ruta para generar y descargar el reporte de inasistencias
router.get("/printInasistencias/:area/:quin", verifyToken, requirePermission(['AEI-CAIC', 'AEI-CAIA', 'AEI-CAIP']), reportesIncidenciasController.printInasistencias);

// Ruta para generar y descargar el archivo DBF de las inasistencias
router.post("/printRetardosDbf", verifyToken, requirePermission(['AEI-CAIC', 'AEI-CAIA', 'AEI-CAIP']), reportesIncidenciasController.printRetardosDbf);

// Ruta para generar y descargar el reporte de permisos económicos por quincena
router.post("/printEconomicDays", verifyToken, requirePermission(['AEI-PEF', 'AEI-PEP']), reportesIncidenciasController.printEconomicDays);

// Ruta para generar y descargar el reporte de permisos económicos por un rango de fechas
router.post("/printIndividualEconomicDays", verifyToken, requirePermission(['AEI-PEF', 'AEI-PEP']), reportesIncidenciasController.printIndividualEconomicDays,);

// Ruta para generar y descargar el archivo DBF de los permisos económicos por cierto rango de fechas
router.post("/printEconomicDaysDbf", verifyToken, requirePermission(['AEI-PEF', 'AEI-PEP']), reportesIncidenciasController.printEconomicDaysDbf);

// Ruta para generar y descargar el reporte de personal con algún status employee
router.post("/getReportStatus/:status", verifyToken, requirePermission(['AEI-EE']), reportesIncidenciasController.getReportStatus);

// Ruta para generar y descargar el reporte de visitas domiciliarias
router.get("/printReporteVisitaDom/:quincena", verifyToken, requirePermission(['AEI-VD']), reportesIncidenciasController.generateReporteVisitaDom,);

module.exports = router;
