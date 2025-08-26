const { Router } = require("express");
const router = Router();
const calendarController = require("../../controllers/calendar/calendar.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get("/getCalendar", verifyToken, calendarController.getCalendar);
router.put("/changeStatus", verifyToken, calendarController.changeStatus);

module.exports = router;
