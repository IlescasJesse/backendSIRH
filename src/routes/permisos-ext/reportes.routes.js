const { Router } = require("express");
const router = Router();
const reportesPermisosExtController = require("../../controllers/permisos-ext/reportesPermisosExt.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.post("/printReportPermisosExt", verifyToken, reportesPermisosExtController.printReport);
router.post("/printReportPermisosExtType", verifyToken, reportesPermisosExtController.printReportType);
router.post("/printReportPermisosExtQuincena", verifyToken, reportesPermisosExtController.printReportQuincena);
router.post("/printReportPermisosExtQuincena", verifyToken, reportesPermisosExtController.printReportQuincena);
router.post("/printReportPermisosExtQuincenaAndType", verifyToken, reportesPermisosExtController.printReportQuincenaAndType);
module.exports = router;
