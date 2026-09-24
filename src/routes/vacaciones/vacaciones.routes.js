const { Router } = require("express");
const router = Router();
const vacacionesController = require("../../controllers/vacaciones/vacaciones.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener los periodos vacacionales 
router.get("/getPeriodosVacacionales", verifyToken, requirePermission(['VA-RP']), vacacionesController.getPeriodosVacacionales);

// Ruta para modificar los periodos vacacionales de base
router.put("/PeriodosBase", verifyToken, requirePermission(['VA-RP']), vacacionesController.updateVacacionesBase);

// Ruta para modificar los periodos vacacionales de contrato
router.put("/PeriodosContrato", verifyToken, requirePermission(['VA-RP']), vacacionesController.updateVacacionesContrato);

// Ruta para consultar la información de un emleado
router.get("/perfil-vacaciones/:id", verifyToken, requirePermission(['VA-PI']), vacacionesController.getProfile);

// Ruta para modificar la fecha de vacaciones del empleado
router.put("/updateEmployee", verifyToken, requirePermission(['VA-PI']), vacacionesController.updateEmployee);

// Ruta para guardar el periodo vacacional a un empleado
router.put("/savePeriodoVacacionalEmpleado", verifyToken, requirePermission(['VA-PI']), vacacionesController.savePeriodoVacacionalEmpleado);

module.exports = router;
