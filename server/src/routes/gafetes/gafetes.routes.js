const { Router } = require("express");
const router = Router();
const gafetesController = require("../../controllers/vacaciones/vacaciones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
    "/perfil-gafetes/:id",
    verifyToken,
    gafetesController.getProfile
);

module.exports = router;
