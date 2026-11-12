const jwt = require("jsonwebtoken");
const { asegurarCarga, bloqueoActivo } = require("../utils/avisosSistema");

// Rutas que siguen respondiendo durante el mantenimiento: el estado del sistema
// (para que el front muestre la pantalla), la versión, el monitor y el inicio
// de sesión (para que un administrador pueda entrar; a los demás el resto de
// la API les sigue respondiendo 503).
const EXENTAS = ["/api/sistema", "/api/version", "/api/monitor", "/api/personal/login"];

// Los administradores (permiso "*") siguen trabajando durante el mantenimiento.
// Aquí solo se lee el token; la sesión la revisa después verifyToken como siempre.
function esAdministrador(req) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET);
    return Array.isArray(datos.permissions) && datos.permissions.includes("*");
  } catch {
    return false;
  }
}

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
  if (esAdministrador(req)) return next();

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
