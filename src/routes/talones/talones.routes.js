const { Router } = require("express");
const router = Router();
const talonesController = require("../../controllers/talones/talones.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Permisos del módulo Talón de Pago (TP), los mismos que usa el front.
const TP_CONSULTAR = ["TP-IP", "TP-RT", "TP-ET", "TP-PT", "TP-RG"];
const TP_ENTREGAR = ["TP-ET", "TP-PT"];
const TP_PRESTAR = ["TP-PT"];

router.get("/perfil-talon/:id", verifyToken, requirePermission(TP_CONSULTAR), talonesController.getProfile);
router.get("/talones-pendientes-entregar", verifyToken, requirePermission(TP_CONSULTAR), talonesController.getAllTalonesPendintesEntregar);
router.get("/talones-pendientes-regresar", verifyToken, requirePermission(TP_CONSULTAR), talonesController.getAllTalonesPendientesRegresar);
router.post("/entregar-talon", verifyToken, requirePermission(TP_ENTREGAR), talonesController.uploadTalonImage);
// Escaneo por hojas: leer una hoja (sin guardar) y entrega automática por escaneo.
router.post("/analizar-hoja", verifyToken, requirePermission(TP_ENTREGAR), talonesController.analizarHoja);
router.post("/entregar-escaneo", verifyToken, requirePermission(TP_ENTREGAR), talonesController.entregarEscaneo);
// Retroactivo: no tiene fecha fija, se genera a mano (mismo permiso que préstamos).
router.post("/generar-retroactivo", verifyToken, requirePermission(TP_PRESTAR), talonesController.generarRetroactivo);
router.post("/prestar-talon", verifyToken, requirePermission(TP_PRESTAR), talonesController.prestarTalon);
router.post("/regresar-talon", verifyToken, requirePermission(TP_PRESTAR), talonesController.regresarTalon);

router.get("/years-quincenas", verifyToken, requirePermission(TP_CONSULTAR), talonesController.getYearsAndPeriods);
router.get("/agremiados-delegacion/:delegacion", verifyToken, requirePermission(TP_CONSULTAR), talonesController.getEmployeesByDelegation);
module.exports = router;
