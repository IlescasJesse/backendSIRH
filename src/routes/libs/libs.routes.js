const { Router } = require("express");
const router = Router();
const dependenciesExterior = require("../../libs/exterior");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener dependencias de donde vienen los empleados comisionados
router.get("/getDependencies", verifyToken, requirePermission(['AEI-CL', 'AEI-EE']), dependenciesExterior.getDependencies);

// Ruta para registrar una nueva dependencia de donde viene el empleado comisionado
router.post("/postDependencie", verifyToken, requirePermission(['AEI-CL', 'AEI-EE']), dependenciesExterior.postDependencie);

module.exports = router;
