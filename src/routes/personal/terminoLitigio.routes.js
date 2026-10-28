const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");
const ctrl = require("../../controllers/personal/terminoLitigio.Controller");

// Término de litigio: reactiva plazas con clave de adscripción 105 (permiso PSL-TL).
router.get("/terminoLitigio/:id", verifyToken, requirePermission(["PSL-TL"]), ctrl.getTerminoLitigio);
router.post("/terminoLitigio", verifyToken, requirePermission(["PSL-TL"]), ctrl.terminoLitigio);
router.post("/ponerEnLitigio", verifyToken, requirePermission(["PSL-TL"]), ctrl.ponerEnLitigio);

module.exports = router;
