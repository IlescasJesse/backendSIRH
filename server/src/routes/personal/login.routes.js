const express = require("express");
const router = express.Router();
const loginController = require("../../controllers/personal/login.Controller");

router.post("/login", loginController.loginUser);
router.post("/logout", loginController.logoutUser);
router.post("/login/username", loginController.checkUsername);
router.post("/login/createPassword", loginController.createPassword);

module.exports = router;
