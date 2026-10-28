const { asegurarCarga, bloqueoActivo } = require("../utils/avisosSistema");

// Rutas que siguen respondiendo durante el mantenimiento: el estado del sistema
// (para que el front muestre la pantalla), la versión y el monitor.
const EXENTAS = ["/api/sistema", "/api/version", "/api/monitor"];

async function mantenimientoMiddleware(req, res, next) {
  if (!req.path.startsWith("/api/") || EXENTAS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  try {
    await asegurarCarga();
  } catch (err) {
    // Si Mongo falla no bloqueamos la API por esto.
    console.error("Error leyendo mantenimiento:", err.message);
    return next();
  }

  const mant = bloqueoActivo();
  if (!mant) return next();

  if (mant.fin) {
    const segundos = Math.max(60, Math.ceil((new Date(mant.fin) - Date.now()) / 1000));
    res.setHeader("Retry-After", String(segundos));
  }

  return res.status(503).json({
    mantenimiento: true,
    titulo: mant.titulo,
    message: mant.mensaje,
    fin: mant.fin,
  });
}

module.exports = mantenimientoMiddleware;
