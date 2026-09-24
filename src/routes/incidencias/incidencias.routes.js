const { Router } = require("express");
const router = Router();
const incidenciasController = require("../../controllers/incidencias/incidencias.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener a los empleados de acuerdo a su área responsable de incidencias
router.get("/getEmployeesByArea/:area/:queryParam", verifyToken, requirePermission(
  [
    'AEI-CAIC',
    'AEI-EIC',
    'AEI-CAIA',
    'AEI-EIA',
    'AEI-CAIP',
    'AEI-EIP'
  ]), incidenciasController.getEmployebyArea);

// Ruta para obtener las acciones de usuario dentro del módulo de incidencias
router.get("/getUserActionsIncidencias", verifyToken, requirePermission(
  [
    'AEI-IN',
    'AEI-CL',
    'AEI-CAIC',
    'AEI-TJC',
    'AEI-CAIA',
    'AEI-TJA',
    'AEI-CAIP',
    'AEI-TJP',
    'AEI-EC',
    'AEI-EE',
    'AEI-PEF',
    'AEI-PEP',
    'AEI-VD'
  ]), incidenciasController.getUserActionsIncidencias);

// Ruta para registrar a un nuevo empleado que viene comisionado
router.post("/newForeigner", verifyToken, requirePermission(['AEI-CL']), incidenciasController.newForeigner);

// Ruta para modificar la información de un empleado que viene comisionado 
router.put("/updateForeigner", verifyToken, requirePermission(['AEI-CL']), incidenciasController.updateForeigner);

// Ruta para inhabilitar a un empleado que viene comisionado
router.put("/deleteForeigner", verifyToken, requirePermission(['AEI-CL']), incidenciasController.deleteForeigner);

// Ruta para consultar la información de un empleado
router.get("/perfil-incidencia/:id", verifyToken, requirePermission(
  [
    'AEI-CL',
    'AEI-CAIC',
    'AEI-EIC',
    'AEI-CAIA',
    'AEI-EIA',
    'AEI-CAIP',
    'AEI-EIP',
    'AEI-PI',
    'AEI-VE',
    'AEI-EE',
    'AEI-PEF',
    'AEI-PEP',
    'AEI-JT',
    'AEI-IP',
    'AEI-CM'
  ]), incidenciasController.getProfile);

// Ruta para obtener las incidencias de un empleado
router.get("/getIncidencia/:id", verifyToken, requirePermission(
  [
    'AEI-CL',
    'AEI-CAIC',
    'AEI-EIC',
    'AEI-CAIA',
    'AEI-EIA',
    'AEI-CAIP',
    'AEI-EIP',
    'AEI-PI',
    'AEI-VE',
    'AEI-EE',
    'AEI-PEF',
    'AEI-PEP',
    'AEI-JT',
    'AEI-IP',
    'AEI-CM'
  ]), incidenciasController.getIncidencias);

// Ruta para guardas las incidencias de un empleado
router.post("/saveIncidencia", verifyToken, requirePermission(['AEI-CAIC', 'AEI-CAIA', 'AEI-CAIP']), incidenciasController.saveIncidencia);

// Ruta para eliminar las incidencias de un empleado
router.delete("/deleteIncidencia/:id", verifyToken, requirePermission(['AEI-CAIC', 'AEI-CAIA', 'AEI-CAIP']), incidenciasController.deleteIncidencia);

// Ruta para obtener el listado de personal por área de incidencias 
router.get("/getAllEmployeesByArea/:area", verifyToken, requirePermission(['AEI-TJC', 'AEI-TJA', 'AEI-TJP']), incidenciasController.getAllEmployeesByArea);

// Ruta para asignar número de tarjeta de asistencia
router.put("/assignCard", verifyToken, requirePermission(['AEI-EIC', 'AEI-EIA', 'AEI-EIP']), incidenciasController.asignarTarjeta);

// Ruta para modificar el número de tarjeta de asistencia
router.post("/updateCardInformation", verifyToken, requirePermission(['AEI-EIC', 'AEI-EIA', 'AEI-EIP']), incidenciasController.updateCardInformation);

// Ruta para realizar la impresión de tarjetas de acuerdo al área de incidencias
router.post("/printAsistenceCards", verifyToken, requirePermission(['AEI-TJC', 'AEI-TJA', 'AEI-TJP']), incidenciasController.printAsistenceCards);

// Ruta para modificar el status employee de un empleado
router.put("/updateStatusEmployee", verifyToken, requirePermission(['AEI-EE']), incidenciasController.updateStatusEmployee);

// Ruta para obtener todos los empleados que tienen un status employee
router.post("/getAllEmployeesByStatus", verifyToken, requirePermission(['AEI-EE']), incidenciasController.getAllEmployeesByStatus);

// Ruta para crear un permiso económico
router.post("/newPermit", verifyToken, requirePermission(['AEI-PEF', 'AEI-PEP']), incidenciasController.newEconomicPermit);

// Ruta para modificar un permiso económico
router.put("/updatePermit", verifyToken, requirePermission(['AEI-PEF', 'AEI-PEP']), incidenciasController.updateEconomicPermit);

// Ruta para eliminar un permiso económico
router.delete("/deletePermit/:id", verifyToken, requirePermission(['AEI-PEF', 'AEI-PEP']), incidenciasController.deleteEconomicPermit);

// Ruta para crear un justificante
router.post("/newProof", verifyToken, requirePermission(['AEI-JT']), incidenciasController.newJustification);

// Ruta para modificar un justificante
router.put("/updateProof", verifyToken, requirePermission(['AEI-JT']), incidenciasController.updateJustification);

// Ruta para eliminar un justificante
router.delete("/deleteProof/:id", verifyToken, requirePermission(['AEI-JT']), incidenciasController.deleteJustification);

// Ruta para crear una incapacidad
router.post("/newInability", verifyToken, requirePermission(['AEI-IP']), incidenciasController.newInability);

// Ruta para modificar una incapacidad
router.put("/updateInability", verifyToken, requirePermission(['AEI-IP']), incidenciasController.updateInability);

// Ruta para eliminar una incapacidad
router.delete("/deleteInability/:id", verifyToken, requirePermission(['AEI-IP']), incidenciasController.deleteInability);

// Ruta para crear una comisión de visitas domiciliarias
router.post("/newCommission", verifyToken, requirePermission(['AEI-CM']), incidenciasController.newCommission);

// Ruta para modificar una comisión de visitas domiciliarias 
router.put("/updateCommission", verifyToken, requirePermission(['AEI-CM']), incidenciasController.updateCommission);

// Ruta para eliminar una comisión de visitas domiciliarias
router.delete("/deleteCommission/:id", verifyToken, requirePermission(['AEI-CM']), incidenciasController.deleteCommission);

module.exports = router;
