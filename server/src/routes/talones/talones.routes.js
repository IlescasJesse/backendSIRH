const { Router } = require("express");
const router = Router();
const talonesController = require("../../controllers/talones/talones.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/perfil-talon/:id", verifyToken, talonesController.getProfile);
module.exports = router;
