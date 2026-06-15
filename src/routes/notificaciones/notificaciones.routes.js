const { Router } = require("express");
const router = Router();
const notificacionesController = require("../../controllers/notificaciones/notificaciones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/", verifyToken, notificacionesController.getNotificaciones);
router.patch("/read-all", verifyToken, async (req, res) => {
    try {
        const username = req.user.username;

        const Notification = require("../../models/notification.model");

        await Notification.updateMany(
            { readBy: { $ne: username } },
            { $addToSet: { readBy: username } }
        );

        res.json({ message: "Notificaciones marcadas como leídas" });

    } catch (error) {
        res.status(500).json({ error: "Error al marcar como leídas" });
    }
});
module.exports = router;
