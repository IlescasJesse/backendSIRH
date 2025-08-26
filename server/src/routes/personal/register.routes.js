const express = require("express");
const registerController = require("../../controllers/personal/register.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const router = express.Router();

router.get("/users", registerController.getAllUsers);
router.post("/addUser", verifyToken, registerController.addUser);
router.get(
  "/historyUser/:username",
  verifyToken,
  registerController.sendHistory
);
router.put("/updateUser", verifyToken, registerController.updateUser);
router.delete(
  "/inhabiltyUser/:username",
  verifyToken,
  registerController.inhabilityUser
);
router.put(
  "/habiltyUser/:username",
  verifyToken,
  registerController.habilityUser
);

module.exports = router;
