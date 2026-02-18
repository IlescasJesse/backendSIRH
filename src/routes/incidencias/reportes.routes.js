const { Router } = require("express");
const router = Router();
const reportesIncidenciasController = require("../../controllers/incidencias/reportesIncidencias.Controller");
const asistenceCards = require("../../controllers/incidencias/asistenceCards.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.post(
  "/printEconomicDays",
  verifyToken,
  reportesIncidenciasController.printEconomicDays,
);
router.post(
  "/printEconomicDaysDbf",
  verifyToken,
  reportesIncidenciasController.printEconomicDaysDbf,
);
router.post(
  "/printIndividualEconomicDays",
  verifyToken,
  reportesIncidenciasController.printIndividualEconomicDays,
);
router.get(
  "/printIncidenciasCentral/:quincena",
  verifyToken,
  reportesIncidenciasController.printIncidenciasCentral,
);

// Auditoria Reportes
router.get(
  "/printIncidenciasAuditoria/:quincena",
  verifyToken,
  reportesIncidenciasController.printIncidenciasAuditoria,
);
router.get(
  "/printInasistenciasAuditoria/:quincena",
  verifyToken,
  reportesIncidenciasController.printInasistenciasAuditoria,
);
router.get(
  "/printInasistenciasCentral/:quincena",
  verifyToken,
  reportesIncidenciasController.printInasistenciasCentral,
);
router.get(
  "/printIncidenciasPlaneacion/:quincena",
  reportesIncidenciasController.printIncidenciasPlaneacion,
);
router.get(
  "/printInasistenciasPlaneacion/:quincena",
  reportesIncidenciasController.printInasistenciasPlaneacion,
);
router.post(
  "/printRetardosDbf",
  reportesIncidenciasController.printRetardosDbf,
);

// router.get(
//   "/printSingleAsistenceCard/:area_resp",
//   asistenceCards.printSingleAsistenceCard
// );
router.post(
  "/getReportStatus/:status",
  verifyToken,
  reportesIncidenciasController.getReportStatus,
);
router.get(
  "/printReporteVisitaDom/:quincena",
  verifyToken,
  reportesIncidenciasController.generateReporteVisitaDom,
);
module.exports = router;
