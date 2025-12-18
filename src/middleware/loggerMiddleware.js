const { insertOne } = require("../config/mongo");

// Intentar cargar chalk, si no está disponible usar función sin colores
let chalk;
try {
  chalk = require("chalk");
} catch (error) {
  // Si chalk no está disponible, crear un objeto mock
  chalk = {
    green: (text) => text,
    cyan: (text) => text,
    yellow: (text) => text,
    red: (text) => text,
    white: (text) => text,
    gray: (text) => text,
    bold: (text) => text,
  };
}

// Colores según código de estado
const getStatusColor = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return chalk.green;
  if (statusCode >= 300 && statusCode < 400) return chalk.cyan;
  if (statusCode >= 400 && statusCode < 500) return chalk.yellow;
  if (statusCode >= 500) return chalk.red;
  return chalk.white;
};

// Obtener categoría de log según código HTTP
const getLogCategory = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return "logs_200";
  if (statusCode >= 300 && statusCode < 400) return "logs_300";
  if (statusCode >= 400 && statusCode < 500) return "logs_400";
  if (statusCode >= 500) return "logs_500";
  return "logs_otros";
};

// Middleware para logging de solicitudes HTTP
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  // Capturar información de la solicitud
  const requestData = {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("user-agent"),
    timestamp: new Date(),
  };

  // Sobrescribir res.send para capturar el código de estado
  res.send = function (data) {
    res.send = originalSend;
    const statusCode = res.statusCode;
    const duration = Date.now() - startTime;

    try {
      // Log en consola con colores
      const colorFn = getStatusColor(statusCode);
      const statusText =
        typeof colorFn === "function" && colorFn.bold
          ? colorFn.bold(`[${statusCode}]`)
          : `[${statusCode}]`;
      const methodText =
        typeof chalk.bold === "function" ? chalk.bold(req.method) : req.method;
      const durationText =
        typeof chalk.gray === "function"
          ? chalk.gray(`${duration}ms`)
          : `${duration}ms`;

      console.log(
        `${statusText} ${methodText} ${req.originalUrl} - ${durationText}`
      );
    } catch (logError) {
      // Fallback sin colores si hay error
      console.log(
        `[${statusCode}] ${req.method} ${req.originalUrl} - ${duration}ms`
      );
    }

    // Guardar en MongoDB de forma asíncrona (no bloquear respuesta)
    const logData = {
      ...requestData,
      statusCode,
      duration,
      responseSize: data ? JSON.stringify(data).length : 0,
    };

    const collection = getLogCategory(statusCode);

    // Insertar en MongoDB sin await para no bloquear
    insertOne(collection, logData).catch((err) => {
      const errorMsg =
        typeof chalk.red === "function"
          ? chalk.red("Error guardando log en MongoDB:")
          : "Error guardando log en MongoDB:";
      console.error(errorMsg, err.message);
    });

    return originalSend.call(this, data);
  };

  next();
};

// Middleware para capturar errores no manejados
const errorLogger = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const errorData = {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    statusCode,
    error: err.message,
    stack: err.stack,
    timestamp: new Date(),
  };

  const collection = getLogCategory(statusCode);

  insertOne(collection, errorData).catch((logErr) => {
    const errorMsg =
      typeof chalk.red === "function"
        ? chalk.red("Error guardando error log:")
        : "Error guardando error log:";
    console.error(errorMsg, logErr.message);
  });

  const errorText =
    typeof chalk.red === "function" && typeof chalk.red.bold === "function"
      ? chalk.red.bold(`[ERROR ${statusCode}]`)
      : `[ERROR ${statusCode}]`;

  console.error(errorText, err.message);

  res.status(statusCode).json({
    error: err.message || "Error interno del servidor",
  });
};

module.exports = { requestLogger, errorLogger };
