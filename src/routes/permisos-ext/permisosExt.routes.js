const { Router } = require("express");
const router = Router();
const permisosExtController = require("../../controllers/permisos-ext/permisos-ext.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/getEmployee/:id", verifyToken, permisosExtController.getProfile);
module.exports = router;
