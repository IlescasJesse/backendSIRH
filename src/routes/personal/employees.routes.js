const { Router } = require("express");
const router = Router();
const employeeController = require("../../controllers/personal/employees.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const incidenciasController = require("../../controllers/incidencias/incidencias.Controller");
const { requirePermission, requireAnyPermission } = require("../../middleware/permissionsMiddleware");

// Ruta para realizar la búsqueda del empleado
router.get("/getemployee/:queryParam", verifyToken, requirePermission(
  [
    'PSL-BE',
    'PSL-IP',
    'PSL-VE',
    'PSL-EI',
    'PSL-CA',
    'PSL-CPE',
    'PSL-REC',
    'PSL-AS',
    'PSL-ASQ',
    'PSL-RPE',
    'AEI-CL',
    'AEI-PI',
    'AEI-VE',
    'AEI-EE',
    'AEI-PEF',
    'AEI-PEP',
    'AEI-JT',
    'AEI-IP',
    'AEI-CM',
    'PEX-PI',
    'PEX-PEX',
    'PEX-VE',
    'VA-PI',
    'GF-IP'
  ]), incidenciasController.getEmployee);

// Ruta para consulta la información de un empleado ya sea activo o de licencia
router.post("/getemployee/profile/:id", verifyToken, requirePermission(
  [
    'PSL-RE',
    'PSL-IP',
    'PSL-VE',
    'PSL-EI',
    'PSL-CA',
    'PSL-CPE',
    'PSL-REC',
    'PSL-AS'
  ]), employeeController.getProfileData);

// Ruta para obtener el total de empleados activos por tipo de nombramiento y por sexo
router.get("/getEmployeeCount", verifyToken, requireAnyPermission(), employeeController.getEmployeeCount);

// Ruta para obtener toda la información del empleado tanto personal como de incidencias para el perfil unificado
router.post("/getemployee/unifiedProfile/:id", verifyToken, requirePermission(['PSL-RPE']), employeeController.getUnifiedProfileData);

// Ruta para realizar el cambio de área de un empleado
router.put("/updateArea", verifyToken, requirePermission(['PSL-CA']), employeeController.updateArea);

// Ruta para realizar el cambio de proyecto de un empleado
router.put("/updateProyect", verifyToken, requirePermission(['PSL-CPE']), employeeController.updateProyect);

// Ruta para realizar el cambio de nivel de un empleado
router.put("/recategorizeEmployee", verifyToken, requirePermission(['PSL-REC']), employeeController.recategorizeEmployee);

// Ruta para afiliar o desafiliar a un empleado del sindicato
router.post("/afiliarSindicato", verifyToken, requirePermission(['PSL-AS']), employeeController.afiliarSindicato);

// Ruta para obtener las acciones de usuarios dentro del módulo de personal
router.get("/getUserActionsPersonal", verifyToken, requireAnyPermission(), employeeController.getUserActionsPersonal);


module.exports = router;
