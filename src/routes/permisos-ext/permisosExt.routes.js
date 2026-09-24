const { Router } = require("express");
const router = Router();
const permisosExtController = require("../../controllers/permisos-ext/permisos-ext.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtene la información de un empleado
router.get("/getEmployee/:id", verifyToken, requirePermission(['PEX-PI', 'PEX-PEX', 'PEX-VE']), permisosExtController.getProfile);

// Ruta para crear un permiso extraordinario
router.post("/newExtPermit", verifyToken, requirePermission(['PEX-PEX']), permisosExtController.newExtPermit);

// Ruta para modificar un permiso extraordinario
router.put("/updateExtPermit", verifyToken, requirePermission(['PEX-PEX']), permisosExtController.updateExtPermit);

// Ruta para eliminar un permiso extraordinario
router.delete("/deleteExtPermit/:id", verifyToken, requirePermission(['PEX-PEX']), permisosExtController.deleteExtPermit);

// Ruta para obtener a los empleados con cierto tipo de permiso y en cierta quincena
router.get("/getEmployeeWithExtPermits/:type/:quincena", verifyToken, requirePermission(['PEX-GR']), permisosExtController.getEmployeeWithExtPermits);

module.exports = router;
