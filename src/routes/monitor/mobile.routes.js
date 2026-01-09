const express = require("express");
const router = express.Router();
const verifyToken = require("../../middleware/authMiddleware");
const ipWhitelistMiddleware = require("../../middleware/ipWhitelist");
const { query, insertOne } = require("../../config/mongo");
const { agenda } = require("../../config/agenda");

// Aplicar IP whitelist a TODAS las rutas móviles
router.use(ipWhitelistMiddleware);

// Login específico para app móvil
router.post("/login", async (req, res) => {
  const { username, password, deviceId } = req.body;

  try {
    // Buscar usuario en MongoDB
    const users = await query("USERS", { username });

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    const user = users[0];

    // Verificar contraseña (ajustar según tu método de encriptación)
    const bcrypt = require("bcrypt");
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // Generar token JWT
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role || "user",
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    // Registrar login móvil
    await insertOne("MOBILE_LOGINS", {
      userId: user._id,
      username: user.username,
      deviceId,
      timestamp: new Date(),
      ip: req.connection.remoteAddress || req.socket.remoteAddress,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
        fullName: user.fullName,
      },
    });
  } catch (error) {
    console.error("Error en login móvil:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
});

// Rutas protegidas con token JWT
router.use(verifyToken);

// Dashboard principal
router.get("/dashboard", async (req, res) => {
  try {
    const logs = await query("AGENDA_LOGS", {}, { limit: 100 });

    const totalLogs = logs.length;
    const completedTasks = logs.filter(
      (log) => log.estado === "completado"
    ).length;
    const failedTasks = logs.filter((log) => log.estado === "error").length;
    const successRate = totalLogs > 0 ? (completedTasks / totalLogs) * 100 : 0;

    const recentActivities = logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)
      .map((log) => ({
        tarea: log.tarea,
        estado: log.estado,
        mensaje: log.mensaje,
        timestamp: log.timestamp,
      }));

    res.json({
      totalLogs,
      completedTasks,
      failedTasks,
      successRate: Math.round(successRate * 10) / 10,
      recentActivities,
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener dashboard",
    });
  }
});

// Logs de Agenda
router.get("/agenda/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await query(
      "AGENDA_LOGS",
      {},
      { sort: { timestamp: -1 }, limit }
    );

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Error al obtener logs:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logs",
    });
  }
});

// Estadísticas de Agenda
router.get("/agenda/stats", async (req, res) => {
  try {
    const logs = await query("AGENDA_LOGS", {});

    const totalTasks = logs.length;
    const successfulTasks = logs.filter(
      (log) => log.estado === "completado"
    ).length;
    const failedTasks = logs.filter((log) => log.estado === "error").length;

    const taskStats = {};
    logs.forEach((log) => {
      if (!taskStats[log.tarea]) {
        taskStats[log.tarea] = {
          total: 0,
          completados: 0,
          errores: 0,
        };
      }
      taskStats[log.tarea].total++;
      if (log.estado === "completado") taskStats[log.tarea].completados++;
      if (log.estado === "error") taskStats[log.tarea].errores++;
    });

    res.json({
      success: true,
      totalTasks,
      successfulTasks,
      failedTasks,
      taskStats,
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
    });
  }
});

// Ejecutar tarea de Agenda
router.post("/agenda/run/:taskName", async (req, res) => {
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
      tipo: "mobile",
    });

    res.json({
      success: true,
      message: `Tarea "${taskName}" ejecutada correctamente`,
    });
  } catch (error) {
    console.error("Error al ejecutar tarea:", error);
    res.status(500).json({
      success: false,
      message: `Error al ejecutar tarea: ${error.message}`,
    });
  }
});

// Estado del servidor
router.get("/server/health", (req, res) => {
  const memoryUsage = process.memoryUsage();

  res.json({
    success: true,
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    },
    timestamp: new Date(),
    version: process.version,
  });
});

// Logs recientes (general)
router.get("/logs/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = await query(
      "AGENDA_LOGS",
      {},
      { sort: { timestamp: -1 }, limit }
    );

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Error al obtener logs recientes:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logs",
    });
  }
});

module.exports = router;
