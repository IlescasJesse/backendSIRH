const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const sueldosController = require("../../controllers/personal/sueldos.Controller");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener los sueldos y quinquenios de los diferentes niveles y modalidades
router.get("/getSueldosYQuinquenios", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.getSueldosAndQuin);

// Ruta para modificar un sueldo
router.put("/updateSueldos", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.putSueldos);

// Ruta para modificar un quinquenio
router.put("/updateQuinquenios", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.putQuinquenios);

// Ruta para agregar un empleado que tiene un estimulo diferente a los demas
router.post("/newEstimulo", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.newEstimulo);

// Ruta para modificar el estimulo de un empleado 
router.put("/updateEstimulo", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.updateEstimulo);

// Ruta para eliminar el empleado que tiene un estimulo diferente a los demas
router.delete("/deleteEstimulo", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.deleteEstimulo);

// Ruta para agregar un empleado que tiene la percepción gasadmi
router.post("/newGasadmi", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.newGasadmi);

// Ruta para modificar la cantidad gasadmi de un empleado
router.put("/updateGasadmi", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.updateGasadmi);

// Ruta para eliminar un empleado que tiene la percepción gasadmi
router.delete("/deleteGasadmi", verifyToken, requirePermission(['PSL-ASQ']), sueldosController.deleteGasadmi);

module.exports = router;
