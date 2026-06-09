const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const adscripcionProyectoController = require("../../controllers/personal/adscripcionProyecto.Controller");

router.get("/getAdscripciones", verifyToken, adscripcionProyectoController.getAdscripciones);
router.post("/newAdscripcion", verifyToken, adscripcionProyectoController.newAdscripcion);
router.put("/updateAdscripcion", verifyToken, adscripcionProyectoController.updateAdscripcion);
router.delete("/deleteAdscripcion", verifyToken, adscripcionProyectoController.deleteAdscripcion);
router.get("/getCatalogosAds", verifyToken, adscripcionProyectoController.getCatalogoAdsc);


router.get("/getProyectos", verifyToken, adscripcionProyectoController.getProyectos);
router.post("/newProyecto", verifyToken, adscripcionProyectoController.newProyecto);
router.put("/updateProyecto", verifyToken, adscripcionProyectoController.updateProyecto);
router.delete("/deleteProyecto", verifyToken, adscripcionProyectoController.deleteProyecto);

module.exports = router;
