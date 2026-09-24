const { Router } = require("express");
const router = Router();
const verifyToken = require("../../middleware/authMiddleware");
const adscripcionProyectoController = require("../../controllers/personal/adscripcionProyecto.Controller");
const { requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener todas las adscripciones 
router.get("/getAdscripciones", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.getAdscripciones);

// Ruta para obtener tipos de áreas para registrar una nueva adscripción
router.get("/getCatalogosAds", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.getCatalogoAdsc);

// Ruta para registrar una nueva adscripción
router.post("/newAdscripcion", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.newAdscripcion);

// Ruta para modificar la información de una adscripción
router.put("/updateAdscripcion", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.updateAdscripcion);

// Ruta para eliminar una adscripción
router.delete("/deleteAdscripcion", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.deleteAdscripcion);

// Ruta para obtener todos los proyectos
router.get("/getProyectos", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.getProyectos);

// Ruta para registrar un nuevo proyecto
router.post("/newProyecto", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.newProyecto);

// Ruta para modificar un proyecto
router.put("/updateProyecto", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.updateProyecto);

// Ruta para eliminar un proyecto
router.delete("/deleteProyecto", verifyToken, requirePermission(['PSL-AAP']), adscripcionProyectoController.deleteProyecto);

module.exports = router;
