const crypto = require("crypto");

// Autoriza las peticiones del monitor (app Electron en la PC de administración)
// con la llave compartida MONITOR_API_KEY, enviada en el encabezado X-Monitor-Key.
function monitorKey(req, res, next) {
  const esperada = process.env.MONITOR_API_KEY || "";
  if (esperada.length < 24) {
    return res.status(503).json({ message: "MONITOR_API_KEY no configurada en el servidor" });
  }

  const recibida = String(req.headers["x-monitor-key"] || "");
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: "Llave de monitor inválida" });
  }

  next();
}

module.exports = monitorKey;
