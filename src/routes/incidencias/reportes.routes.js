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
  "/printIncidencias/:area/:quin",
  verifyToken,
  reportesIncidenciasController.printIncidencias,
);
router.get(
  "/printInasistencias/:area/:quin",
  verifyToken,
  reportesIncidenciasController.printInasistencias,
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
