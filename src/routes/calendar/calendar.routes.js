const { Router } = require("express");
const router = Router();
const calendarController = require("../../controllers/calendar/calendar.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requireAnyPermission, requirePermission } = require("../../middleware/permissionsMiddleware");

// Ruta para obtener el calendario hasta la quincena actual del año de la base de datos
router.get("/getCalendar", verifyToken, requireAnyPermission(), calendarController.getCalendar);

// Ruta para habilitar o inhabilitar un día del calendario
router.put("/changeStatus", verifyToken, requirePermission(['AEI-EC']), calendarController.changeStatus);

// Ruta para obtener todo el calendario del año de la base de datos
router.get("/getFullCalendar", verifyToken, requireAnyPermission(), calendarController.getFullCalendar);

module.exports = router;
