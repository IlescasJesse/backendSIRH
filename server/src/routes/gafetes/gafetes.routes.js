const { Router } = require("express");
const router = Router();
const gafetesController = require("../../controllers/gafetes/gafetes.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.post(
  "/createProvCredentials",
  verifyToken,
  gafetesController.createProvCredentials
);
router.get("/getEmployee/:id", verifyToken, gafetesController.getProfile);
router.put(
  "/updateEmployee/:id",
  verifyToken,
  gafetesController.updateEmployee
);

module.exports = router;
