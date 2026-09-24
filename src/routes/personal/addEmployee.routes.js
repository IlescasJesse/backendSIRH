const { Router } = require("express");
const router = Router();
const addEmployeeController = require("../../controllers/personal/addEmployee.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission, requireAnyPermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener la información de las categorías de puesto y adscripciones
router.get("/getinternalInformation", verifyToken, requirePermission(
    [
        'PSL-PE',
        'PSL-AE',
        'PSL-RE',
        'PSL-CA',
        'PSL-CPE',
        'PSL-REC',
        'PSL-RP',
        'PSL-NP',
        'PSL-RPV',
        'AEI-CL',
        'AEI-EE',
        'GF-RG'
    ]), addEmployeeController.internalInformation);

// Ruta para obtener la información de un municipio de acuerdo a su código postal
router.post("/getMpios", verifyToken, requirePermission(
    [
        'PSL-PE',
        'PSL-AE',
        'PSL-BE',
        'PSL-RE',
        'PSL-IP',
        'PSL-VE',
        'PSL-EI',
        'PSL-CA',
        'PSL-CPE',
        'PSL-REC',
        'PSL-AS',
        'GF-RG',
        'GF-IP'
    ]), addEmployeeController.getMpio);

// Ruta para guardar una colonia que no exista en la BD
router.post("/saveColonia", verifyToken, requirePermission(
    [
        'PSL-PE',
        'PSL-AE',
        'PSL-BE',
        'PSL-RE',
        'PSL-EI',
        'GF-RG',
        'GF-IP'
    ]), addEmployeeController.saveColonia);

// Ruta para crear una nueva categoria
router.post("/addCategory", verifyToken, requirePermission(['PSL-NC']), addEmployeeController.addCategory);

// Ruta para crear una nueva plaza
router.post("/addPlaza", verifyToken, requirePermission(['PSL-NP']), addEmployeeController.newPlaza);

// Ruta para obtener las vacantes de la plantilla
router.get("/getvacants", verifyToken, requirePermission(['PSL-PE', 'PSL-AE']), addEmployeeController.getVacants);

// Ruta para obtener la información de una plaza
router.post("/getdataPlaza", verifyToken, requirePermission(['PSL-PE']), addEmployeeController.dataPlaza);

// Ruta para realizar la propuesta de un empleado
router.post("/makeProposal", verifyToken, requirePermission(['PSL-PE']), addEmployeeController.makeProposal);

// Ruta para obtener la información de la propuesta generada para realizar la alta
router.post("/getDataTemplate", verifyToken, requirePermission(['PSL-AE']), addEmployeeController.getDataTemplate);

// Ruta para realizar la alta del empleado
router.post("/saveEmployee", verifyToken, requirePermission(['PSL-AE']), addEmployeeController.saveEmployee);

// Ruta para modificar la información de un empleado
router.post("/updateEmployee", verifyToken, requirePermission(['PSL-BE', 'PSL-EI']), addEmployeeController.updateEmployee);

// Ruta para culminar la licencia de un empleado y darlo de alta en la plantilla nuevamente
router.post("/reinstallEmployee", verifyToken, requirePermission(['PSL-RE']), addEmployeeController.reinstallEmployee);

// Ruta para descargar la propuesta de un empleado
router.post("/download-alta/:curp", verifyToken, requirePermission(['PSL-PE', 'PSL-AE']), addEmployeeController.downloadAlta);

// Ruta para agregar un comentario al empleado
router.post("/addCommit", verifyToken, requireAnyPermission(), addEmployeeController.addCommit);

// Ruta para modificar un comentario del empleado
router.put("/updateCommit", verifyToken, requireAnyPermission(), addEmployeeController.updateCommit);

// Ruta para eliminar un comentario del empleado
router.put("/deleteCommit", verifyToken, requireAnyPermission(), addEmployeeController.deleteCommit);

module.exports = router;
