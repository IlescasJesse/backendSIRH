const { Router } = require("express");
const router = Router();
const incidenciasController = require("../../controllers/incidencias/incidencias.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
  "/getIncidencia/:id",
  verifyToken,
  incidenciasController.getIncidencias
);
router.get(
  "/getEmployee/:query",
  verifyToken,

  incidenciasController.getEmployee
);
router.get(
  "/perfil-incidencia/:id",
  verifyToken,
  incidenciasController.getProfile
);
router.get(
  "/getEmployeesByArea/:area/:queryParam",
  verifyToken,
  incidenciasController.getEmployebyArea
);
router.post(
  "/updateCardInformation",
  verifyToken,
  incidenciasController.updateCardInformation
);
router.put(
  "/updateStatusEmployee",
  verifyToken,
  incidenciasController.updateStatusEmployee
);
//CREAR
router.post("/newPermit", verifyToken, incidenciasController.newEconomicPermit);
router.post("/newProof", verifyToken, incidenciasController.newJustification);
router.post("/newInability", verifyToken, incidenciasController.newInability);
router.post("/newCommission", verifyToken, incidenciasController.newCommission);
router.post(
  "/saveIncidencia",
  verifyToken,
  incidenciasController.saveIncidencia
);
router.post("/newForeigner", verifyToken, incidenciasController.newForeigner);
router.put("/updateForeigner", verifyToken, incidenciasController.deleteForeigner);
//UPDATE
router.put("/assignCard", verifyToken, incidenciasController.asignarTarjeta);
router.put(
  "/updatePermit",
  verifyToken,
  incidenciasController.updateEconomicPermit
);
router.put(
  "/updateProof",
  verifyToken,
  incidenciasController.updateJustification
);
router.put(
  "/updateInability",
  verifyToken,
  incidenciasController.updateInability
);
router.put(
  "/updateCommission",
  verifyToken,
  incidenciasController.updateCommission
);
// router.put(
//   "/updateIncidencia",
//   verifyToken,
//   incidenciasController.updateIncidencia
// );
//DELETE
router.delete(
  "/deletePermit/:id",
  verifyToken,
  incidenciasController.deleteEconomicPermit
);
router.delete(
  "/deleteProof/:id",
  verifyToken,
  incidenciasController.deleteJustification
);
router.delete(
  "/deleteInability/:id",
  verifyToken,
  incidenciasController.deleteInability
);
router.delete(
  "/deleteIncidencia/:id",
  verifyToken,
  incidenciasController.deleteIncidencia
);
router.delete(
  "/deleteCommission/:id",
  verifyToken,
  incidenciasController.deleteCommission
);
router.get(
  "/getAllIncidencias",
  verifyToken,
  incidenciasController.getAllIncidencias
);
router.get(
  "/getUserActionsIncidencias",
  verifyToken,
  incidenciasController.getUserActionsIncidencias
);
router.get(
  "/getAllEmployeesByArea/:area",
  verifyToken,
  incidenciasController.getAllEmployeesByArea
);
router.post(
  "/printAsistenceCards",
  verifyToken,
  incidenciasController.printAsistenceCards
);
router.post(
  "/getAllEmployeesByStatus",
  verifyToken,
  incidenciasController.getAllEmployeesByStatus
);

module.exports = router;
