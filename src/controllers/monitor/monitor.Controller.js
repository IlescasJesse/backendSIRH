const { query } = require("../../config/mongo");

const monitorController = {};

// Obtener estadísticas generales del servidor
monitorController.getStats = async (req, res) => {
  try {
    const [logs200, logs300, logs400, logs500] = await Promise.all([
      query("logs_200", {}),
      query("logs_300", {}),
      query("logs_400", {}),
      query("logs_500", {}),
    ]);

    const allLogs = [...logs200, ...logs300, ...logs400, ...logs500];

    // Contar por método HTTP
    const byMethod = {};
    allLogs.forEach((log) => {
      const method = log.method || "UNKNOWN";
      byMethod[method] = (byMethod[method] || 0) + 1;
    });

    // Contar endpoints más usados (top 10)
    const endpointCount = {};
    allLogs.forEach((log) => {
      const url = log.url || "unknown";
      endpointCount[url] = (endpointCount[url] || 0) + 1;
    });

    const topEndpoints = Object.entries(endpointCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    const stats = {
      total: allLogs.length,
      byStatus: {
        "2xx": logs200.length,
        "3xx": logs300.length,
        "4xx": logs400.length,
        "5xx": logs500.length,
      },
      byMethod,
      topEndpoints,
      successRate: ((logs200.length / (allLogs.length || 1)) * 100).toFixed(2),
    };

    res.json(stats);
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
};

// Obtener logs por categoría
monitorController.getLogsByCategory = async (req, res) => {
  const { category } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const skip = parseInt(req.query.skip) || 0;

  const validCategories = ["logs_200", "logs_300", "logs_400", "logs_500"];

  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: "Categoría inválida" });
  }

  try {
    const logs = await query(category, {});

    // Ordenar por timestamp descendente y aplicar paginación
    const sortedLogs = logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(skip, skip + limit);

    res.json({
      category,
      total: logs.length,
      returned: sortedLogs.length,
      logs: sortedLogs,
    });
  } catch (error) {
    console.error("Error obteniendo logs:", error);
    res.status(500).json({ error: "Error al obtener logs" });
  }
};

// Obtener logs recientes (últimos 100)
monitorController.getRecentLogs = async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;

  try {
    const [logs200, logs300, logs400, logs500] = await Promise.all([
      query("logs_200", {}),
      query("logs_300", {}),
      query("logs_400", {}),
      query("logs_500", {}),
    ]);

    // Combinar y agregar categoría
    const allLogs = [
      ...logs200.map((log) => ({
        ...log,
        category: "logs_200",
        status: "success",
      })),
      ...logs300.map((log) => ({
        ...log,
        category: "logs_300",
        status: "redirect",
      })),
      ...logs400.map((log) => ({
        ...log,
        category: "logs_400",
        status: "client-error",
      })),
      ...logs500.map((log) => ({
        ...log,
        category: "logs_500",
        status: "server-error",
      })),
    ];

    // Ordenar por timestamp descendente
    const sortedLogs = allLogs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json(sortedLogs);
  } catch (error) {
    console.error("Error obteniendo logs recientes:", error);
    res.status(500).json({ error: "Error al obtener logs recientes" });
  }
};

// Obtener estadísticas por endpoint
monitorController.getEndpointStats = async (req, res) => {
  try {
    const [logs200, logs300, logs400, logs500] = await Promise.all([
      query("logs_200", {}),
      query("logs_300", {}),
      query("logs_400", {}),
      query("logs_500", {}),
    ]);

    const allLogs = [...logs200, ...logs300, ...logs400, ...logs500];

    // Agrupar por URL
    const endpointStats = {};
    allLogs.forEach((log) => {
      const url = log.url || "unknown";
      if (!endpointStats[url]) {
        endpointStats[url] = {
          url,
          total: 0,
          success: 0,
          errors: 0,
          avgDuration: 0,
          durations: [],
        };
      }

      endpointStats[url].total++;
      if (log.statusCode >= 200 && log.statusCode < 400) {
        endpointStats[url].success++;
      } else {
        endpointStats[url].errors++;
      }

      if (log.duration) {
        endpointStats[url].durations.push(log.duration);
      }
    });

    // Calcular promedio de duración
    Object.values(endpointStats).forEach((stat) => {
      if (stat.durations.length > 0) {
        stat.avgDuration = (
          stat.durations.reduce((a, b) => a + b, 0) / stat.durations.length
        ).toFixed(2);
      }
      delete stat.durations;
    });

    // Convertir a array y ordenar por total descendente
    const statsArray = Object.values(endpointStats).sort(
      (a, b) => b.total - a.total
    );

    res.json({
      total: statsArray.length,
      endpoints: statsArray,
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas por endpoint:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
};

// Obtener estadísticas por rango de tiempo
monitorController.getStatsByTimeRange = async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: "Se requieren parámetros start y end (ISO dates)" });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate) || isNaN(endDate)) {
    return res.status(400).json({ error: "Fechas inválidas" });
  }

  try {
    const [logs200, logs300, logs400, logs500] = await Promise.all([
      query("logs_200", { timestamp: { $gte: startDate, $lte: endDate } }),
      query("logs_300", { timestamp: { $gte: startDate, $lte: endDate } }),
      query("logs_400", { timestamp: { $gte: startDate, $lte: endDate } }),
      query("logs_500", { timestamp: { $gte: startDate, $lte: endDate } }),
    ]);

    const stats = {
      start: startDate,
      end: endDate,
      total: logs200.length + logs300.length + logs400.length + logs500.length,
      success: logs200.length,
      redirects: logs300.length,
      clientErrors: logs400.length,
      serverErrors: logs500.length,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error obteniendo estadísticas por rango:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
};

module.exports = monitorController;
