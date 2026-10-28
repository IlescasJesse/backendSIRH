const { Router } = require("express");
const router = Router();
const monitorKey = require("../../middleware/monitorKey");
const ctrl = require("../../controllers/sistema/sistema.Controller");

// Público: estado de mantenimiento y avisos vigentes (también para el login).
router.get("/estado", ctrl.getEstado);

// Solo monitor (encabezado X-Monitor-Key).
router.get("/avisos", monitorKey, ctrl.listarAvisos);
router.post("/avisos", monitorKey, ctrl.crearAviso);
router.delete("/avisos/:id", monitorKey, ctrl.retirarAviso);
router.post("/mantenimiento", monitorKey, ctrl.iniciarMantenimiento);
router.delete("/mantenimiento", monitorKey, ctrl.terminarMantenimiento);

module.exports = router;
