const express = require("express");
const router = express.Router();
const loginController = require("../../controllers/personal/login.Controller");
const { loginLimiter } = require("../../middleware/rateLimitMiddleware");
const verifyToken = require("../../middleware/authMiddleware");

// Ruta para checar si el nombre de usuario existe
router.post("/login/username", loginLimiter, loginController.checkUsername);

// Ruta para registrar la contraseña del usuario por primera vez
router.post("/login/createPassword", loginController.createPassword);

// Ruta para iniciar sesión
router.post("/login", loginLimiter, loginController.loginUser);

// Ruta para cerrar sesión
router.post("/logout", verifyToken, loginController.logoutUser);

module.exports = router;
