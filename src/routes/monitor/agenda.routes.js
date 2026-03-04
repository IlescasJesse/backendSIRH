const express = require("express");
const router = express.Router();
const monitorController = require("../../controllers/monitor/monitor.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { agenda } = require("../../config/agenda");
const { insertOne } = require("../../config/mongo");

const validTasks = [
  "bajasExtemporaneas",
  "altasExtemporaneas",
  "licenciasExtemporaneas",
  "crearTalones",
  "gestionarPeriodoVacacional",
];

router.get("/logs", monitorController.getAgendaLogs);
router.get("/stats", monitorController.getAgendaStats);

router.post("/run/:taskName", verifyToken, async (req, res) => {
  const { taskName } = req.params;

  try {
    if (!validTasks.includes(taskName)) {
      return res.status(400).json({
        success: false,
        message: "Tarea no válida",
      });
    }

    const payload =
      req.body && Object.keys(req.body).length > 0 ? req.body : {};
    await agenda.now(taskName, payload);

    await insertOne("MANUAL_EXECUTIONS", {
      tarea: taskName,
      ejecutadoPor: req.user?.username || "sistema",
      userId: req.user?.id || null,
      timestamp: new Date(),
      tipo: req.baseUrl.includes("/mobile/") ? "mobile" : "desktop",
      payload,
    });

    res.json({
      success: true,
      message: `Tarea "${taskName}" ejecutada correctamente`,
      taskName,
    });
  } catch (error) {
    console.error("Error al ejecutar tarea Agenda:", error);
    res.status(500).json({
      success: false,
      message: `Error al ejecutar tarea: ${error.message}`,
    });
  }
});

router.post("/run-all", verifyToken, async (req, res) => {
  const payload = req.body && Object.keys(req.body).length > 0 ? req.body : {};

  try {
    for (const taskName of validTasks) {
      await agenda.now(taskName, payload);
    }

    await insertOne("MANUAL_EXECUTIONS", {
      tarea: "run-all",
      tareas: validTasks,
      ejecutadoPor: req.user?.username || "sistema",
      userId: req.user?.id || null,
      timestamp: new Date(),
      tipo: req.baseUrl.includes("/mobile/") ? "mobile" : "desktop",
      payload,
    });

    res.json({
      success: true,
      message: "Todas las tareas de Agenda fueron encoladas correctamente",
      tareas: validTasks,
    });
  } catch (error) {
    console.error("Error al ejecutar run-all de Agenda:", error);
    res.status(500).json({
      success: false,
      message: `Error al ejecutar tareas: ${error.message}`,
    });
  }
});

module.exports = router;
