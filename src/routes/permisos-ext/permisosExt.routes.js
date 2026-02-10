const { Router } = require("express");
const router = Router();
const permisosExtController = require("../../controllers/permisos-ext/permisos-ext.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/getEmployee/:id", verifyToken, permisosExtController.getProfile);
router.post("/newExtPermit", verifyToken, permisosExtController.newExtPermit);
router.put("/updateExtPermit", verifyToken, permisosExtController.updateExtPermit);
router.delete("/deleteExtPermit/:id", verifyToken, permisosExtController.deleteExtPermit);
router.post("/printReportPermisosExt", verifyToken, permisosExtController.printReport);
module.exports = router;
