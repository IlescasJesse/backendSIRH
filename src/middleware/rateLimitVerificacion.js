// Límite de intentos para la verificación pública de folios: el código de
// 8 caracteres no debe poder adivinarse por fuerza bruta. En memoria y por
// IP, suficiente para una sola instancia en intranet. Si Isidro agrega un
// rate limit global en la Fase 0, este puede reemplazarse por ese.
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;

const intentos = new Map(); // ip -> { cuenta, expira }

// Limpieza periódica para que el mapa no crezca sin fin.
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, registro] of intentos) {
    if (registro.expira <= ahora) intentos.delete(ip);
  }
}, VENTANA_MS).unref();

const rateLimitVerificacion = (req, res, next) => {
  const ip = req.ip;
  const ahora = Date.now();
  let registro = intentos.get(ip);

  if (!registro || registro.expira <= ahora) {
    registro = { cuenta: 0, expira: ahora + VENTANA_MS };
    intentos.set(ip, registro);
  }

  registro.cuenta += 1;

  if (registro.cuenta > MAX_INTENTOS) {
    const reintentarEn = Math.ceil((registro.expira - ahora) / 1000);
    res.setHeader("Retry-After", reintentarEn);
    return res.status(429).json({
      valido: false,
      message: "Demasiados intentos, intenta de nuevo más tarde",
    });
  }

  next();
};

module.exports = rateLimitVerificacion;
