const { Router } = require("express");
const router = Router();
const notificacionesController = require("../../controllers/notificaciones/notificaciones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/", verifyToken, notificacionesController.getNotificaciones);
module.exports = router;
