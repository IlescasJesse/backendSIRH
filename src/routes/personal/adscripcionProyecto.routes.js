const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const adscripcionProyectoController = require("../../controllers/personal/adscripcionProyecto.Controller");

router.get("/getAdscripciones", verifyToken, adscripcionProyectoController.getAdscripciones);
router.put("/updateAdscripcion", verifyToken, adscripcionProyectoController.updateAdscripcion);
router.get("/getProyectos", verifyToken, adscripcionProyectoController.getProyectos);
router.put("/updateProyecto", verifyToken, adscripcionProyectoController.updateProyecto);
router.delete("/deleteProyecto", verifyToken, adscripcionProyectoController.deleteProyecto);

module.exports = router;
