const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const delegacionesController = require("../../controllers/personal/delegaciones.Controller");

router.get("/getDelegaciones", verifyToken, delegacionesController.getDelegaciones);

module.exports = router;
