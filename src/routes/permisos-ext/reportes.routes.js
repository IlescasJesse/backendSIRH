const { Router } = require("express");
const router = Router();
const reportesPermisosExtController = require("../../controllers/permisos-ext/reportesPermisosExt.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para generar e imprimir el reporte de permisos extraordinarios de un solo empleado
router.post("/printReportPermisosExt", verifyToken, requirePermission(['PEX-PI', 'PEX-PEX']), reportesPermisosExtController.printReport);

// Ruta para generar e imprimir el reporte de permisos extraordinarios de acuerdo al tipo
router.post("/printReportPermisosExtType", verifyToken, requirePermission(['PEX-GR']), reportesPermisosExtController.printReportType);

// Ruta para generar e imprimir el reporte de permisos extraordinarios de acuerdo a la quincena
router.post("/printReportPermisosExtQuincena", verifyToken, requirePermission(['PEX-GR']), reportesPermisosExtController.printReportQuincena);

// Ruta para generar e imprimir el reporte de permisos extraordinarios de acuerdo al tipo y quicena
router.post("/printReportPermisosExtQuincenaAndType", verifyToken, requirePermission(['PEX-GR']), reportesPermisosExtController.printReportQuincenaAndType);


module.exports = router;
