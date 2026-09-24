const { Router } = require("express");
const router = Router();
const gafetesController = require("../../controllers/gafetes/gafetes.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para imprimir los gafetes de personal de estructura
router.post("/printCredentialsEstructure", verifyToken, requirePermission(['GF-IG', 'GF-IP']), gafetesController.printCredentialsEstructure);

// Ruta para imprimir los gafetes de personal de honorarios
router.post("/printCredentialsHonorarios", verifyToken, requirePermission(['GF-IG', 'GF-IP']), gafetesController.printCredentialsHonorarios);

// Ruta para imprimir los gafetes de servicio social
router.post("/printCredentialsServicios", verifyToken, requirePermission(['GF-IG', 'GF-IP']), gafetesController.printCredentialsServicios);

// Ruta para registrar un personal solamente para generar su gafete
router.post("/createProvCredentials", verifyToken, requirePermission(['GF-RG']), gafetesController.createProvCredentials);

// Ruta para consultar la información de un empleado
router.get("/getEmployee/:id", verifyToken, requirePermission(['GF-IP']), gafetesController.getProfile);

// Ruta para modificar la información de un empleado
router.put("/updateEmployee", verifyToken, requirePermission(['GF-IP']), gafetesController.updateEmployee);

module.exports = router;
