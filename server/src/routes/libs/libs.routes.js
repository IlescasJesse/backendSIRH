const { Router } = require("express");
const router = Router();
const dependenciesExterior = require("../../libs/exterior");
const verifyToken = require("../../middleware/authMiddleware");

// Ruta para obtener dependencias
router.get(
  "/getDependencies",
  verifyToken,
  dependenciesExterior.getDependencies
);
router.post(
  "/postDependencie",
  verifyToken,
  dependenciesExterior.postDependencie
);
module.exports = router;
