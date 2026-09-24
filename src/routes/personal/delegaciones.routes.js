const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const delegacionesController = require("../../controllers/personal/delegaciones.Controller");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener las delegaciones sindicales
router.get("/getDelegaciones", verifyToken, requirePermission(['PSL-AS']), delegacionesController.getDelegaciones);

module.exports = router;
