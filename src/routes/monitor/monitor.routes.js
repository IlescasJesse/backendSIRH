const express = require("express");
const router = express.Router();
const path = require("path");
const monitorController = require("../../controllers/monitor/monitor.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { agenda } = require("../../config/agenda");

// Ruta para servir la vista HTML
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../views/monitor.html"));
});

// Obtener estadísticas generales
router.get("/stats", monitorController.getStats);

// Obtener logs recientes
router.get("/recent", monitorController.getRecentLogs);

// Obtener logs por categoría (200, 300, 400, 500)
router.get("/logs/:category", monitorController.getLogsByCategory);

// Obtener estadísticas por endpoint
router.get("/endpoints", monitorController.getEndpointStats);

// Obtener estadísticas por rango de tiempo
router.get("/stats/range", monitorController.getStatsByTimeRange);

// Obtener logs de tareas de Agenda
router.get("/agenda/logs", monitorController.getAgendaLogs);

// Obtener estadísticas de tareas de Agenda
router.get("/agenda/stats", monitorController.getAgendaStats);

// Limpiar todos los logs (endpoint secreto)
router.delete("/clean", monitorController.cleanAllLogs);

// Ejecutar tarea de Agenda (unificado para web y mobile)
router.post("/agenda/run/:taskName", verifyToken, async (req, res) => {
  const { taskName } = req.params;
  try {
    // Validar que la tarea existe
    const validTasks = [
      "bajasExtemporaneas",
      "altasExtemporaneas",
      "licenciasExtemporaneas",
      "crearTalones",
      "gestionarPeriodoVacacional",
    ];
    if (!validTasks.includes(taskName)) {
      return res.status(400).json({
        success: false,
        message: "Tarea no válida",
      });
    }
    // Ejecutar tarea ahora
    await agenda.now(taskName);
    // Registrar ejecución manual
    await insertOne("MANUAL_EXECUTIONS", {
      tarea: taskName,
      ejecutadoPor: req.user.username,
      userId: req.user.id,
      timestamp: new Date(),
      tipo: "webapp",
    });
    res.json({
      success: true,
      message: `Tarea "${taskName}" ejecutada correctamente`,
    });
  } catch (error) {
    console.error("Error al ejecutar tarea Agenda:", error);
    res.status(500).json({
      success: false,
      message: `Error al ejecutar tarea: ${error.message}`,
    });
  }
});

module.exports = router;
