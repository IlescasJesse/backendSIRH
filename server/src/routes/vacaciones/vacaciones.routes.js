const { Router } = require("express");
const router = Router();
const vacacionesController = require("../../controllers/vacaciones/vacaciones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
    "/perfil-vacaciones/:id",
    verifyToken,
    vacacionesController.getProfile
);

module.exports = router;
