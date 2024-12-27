const express = require("express");
const registerController = require("../controllers/register.Controller");
const router = express.Router();

router.get("/users", registerController.getAllUsers);

module.exports = router;
