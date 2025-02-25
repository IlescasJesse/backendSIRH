const express = require("express");
const registerController = require("../controllers/register.Controller");
const router = express.Router();

router.get("/users", registerController.getAllUsers);
router.post("/addUser", registerController.addUser);
module.exports = router;
