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
  "/printAsistenceCards/:quincena",
  asistenceCards.printAsistenceCards
);
router.get(
  "/printInasistencias/:id",
  verifyToken,
  reportesIncidenciasController.printInasistenciasCentral
);
// router.get(
//   "/printInasistenciasCentral/:id",
//   verifyToken,
//   asistenceCards.printAsistenceCardsById
// );
module.exports = router;
