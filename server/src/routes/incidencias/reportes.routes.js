const { Router } = require("express");
const router = Router();
const reportesIncidenciasController = require("../../controllers/incidencias/reportesIncidencias.Controller");
const asistenceCards = require("../../controllers/incidencias/asistenceCards.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
  "/printEconomicDays/:quincena",
  verifyToken,
  reportesIncidenciasController.printEconomicDays
);
router.get(
  "/printIncidenciasCentral/:quincena",
  verifyToken,
  reportesIncidenciasController.printIncidenciasCentral
);
router.get(
  "/printIncidenciasAuditoria/:quincena",
  verifyToken,
  reportesIncidenciasController.printIncidenciasAuditoria
);
router.get(
  "/printInasistenciasCentral/:quincena",
  verifyToken,
  reportesIncidenciasController.printInasistenciasCentral
);
router.get(
  "/printInasistenciasAuditoria/:quincena",
  verifyToken,
  reportesIncidenciasController.printInasistenciasAuditoria
);

router.post(
  "/printAsistenceCards/:area_resp",
  asistenceCards.printAsistenceCards
);
// router.get(
//   "/printSingleAsistenceCard/:area_resp",
//   asistenceCards.printSingleAsistenceCard
// );
router.post(
  "/getReportStatus/:status",
  verifyToken,
  reportesIncidenciasController.getReportStatus
);
module.exports = router;
