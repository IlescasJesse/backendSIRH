const express = require("express");
const registerController = require("../../controllers/personal/register.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requireAdminPermission } = require("../../middleware/permissionsMiddleware");
const router = express.Router();

// Ruta para obtener los usuarios del sistema
router.get("/users", verifyToken, requireAdminPermission(), registerController.getAllUsers);

// Ruta para registrar un nuevo usuario
router.post("/addUser", verifyToken, requireAdminPermission(), registerController.addUser);

// Ruta para modificar un usuario
router.put("/updateUser", verifyToken, requireAdminPermission(), registerController.updateUser);

// Ruta para inhabilitar un usuario
router.delete("/inhabiltyUser/:username", verifyToken, requireAdminPermission(), registerController.inhabilityUser);

// Ruta para habilitar un usuario
router.put("/habiltyUser/:username", verifyToken, requireAdminPermission(), registerController.habilityUser);

// Ruta para visualizar las acciones de un usuario dentro del sistema
router.get("/historyUser/:username", verifyToken, requireAdminPermission(), registerController.sendHistory);

module.exports = router;
