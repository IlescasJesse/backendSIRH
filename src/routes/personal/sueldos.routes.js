const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const sueldosController = require("../../controllers/personal/sueldos.Controller");

router.get("/getSueldosYQuinquenios", verifyToken, sueldosController.getSueldosAndQuin);
router.put("/updateSueldos", verifyToken, sueldosController.putSueldos);
router.put("/updateQuinquenios", verifyToken, sueldosController.putQuinquenios);
router.post("/newEstimulo", verifyToken, sueldosController.newEstimulo);
router.put("/updateEstimulo", verifyToken, sueldosController.updateEstimulo);
router.delete("/deleteEstimulo", verifyToken, sueldosController.deleteEstimulo);
router.post("/newGasadmi", verifyToken, sueldosController.newGasadmi);
router.put("/updateGasadmi", verifyToken, sueldosController.updateGasadmi);
router.delete("/deleteGasadmi", verifyToken, sueldosController.deleteGasadmi);

module.exports = router;
