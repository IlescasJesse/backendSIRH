const { Router } = require("express");
const router = Router();
const offEmployeeController = require("../../controllers/personal/offEmployees.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener las bajas recientes
router.get("/getRecent-casualties", verifyToken, requirePermission(['PSL-BE']), offEmployeeController.getRecentCasualties);

// Ruta para obtener la información del empleado a dar de baja
router.post("/getDataOff/:_id", verifyToken, requirePermission(['PSL-BE']), offEmployeeController.getDatatoOff);

// Ruta para realizar la baja del empleado
router.post("/saveDataOff", verifyToken, requirePermission(['PSL-BE', 'PSL-RE']), offEmployeeController.saveDataOff);

// Ruta para descargar el documento de la baja del empleado
router.post("/download-baja/:curp", verifyToken, requirePermission(['PSL-BE']), offEmployeeController.downloadBaja);

// Ruta para obtener a todos los empleados que tienen una licencia activa 
router.get("/getLicenses", verifyToken, requirePermission(['PSL-RE']), offEmployeeController.getLicenses);

// Ruta para obtener la información del empleado en licencia y poder culminar la licencia
router.get("/getDataLicenses/:id", verifyToken, requirePermission(['PSL-RE']), offEmployeeController.getDataLicenses);

module.exports = router;
