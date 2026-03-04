const express = require("express");
const router = express.Router();
const path = require("path");
const monitorController = require("../../controllers/monitor/monitor.Controller");

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

// Rutas centralizadas de Agenda (desktop + mobile)
router.use("/agenda", require("./agenda.routes"));

// Limpiar todos los logs (endpoint secreto)
router.delete("/clean", monitorController.cleanAllLogs);

module.exports = router;
