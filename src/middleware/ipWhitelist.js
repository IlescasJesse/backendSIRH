const ipWhitelistMiddleware = (req, res, next) => {
  const allowedIPs = (process.env.ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip);

  // Obtener la IP real del cliente (considerando proxies)
  const clientIP =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress;

  // Limpiar formato IPv6 a IPv4
  const cleanIP = clientIP ? clientIP.replace(/^::ffff:/, "") : "unknown";

  console.log(`🔒 IP Request: ${cleanIP}`);

  // Si no hay IPs configuradas, permitir todas (modo desarrollo)
  if (allowedIPs.length === 0 || !process.env.ALLOWED_IPS) {
    console.log("⚠️  Modo desarrollo: IP Whitelist desactivada");
    return next();
  }

  // Verificar si la IP está en la whitelist o si se permite cualquier IP
  if (allowedIPs.includes(cleanIP) || allowedIPs.includes("*")) {
    console.log(`✅ IP autorizada: ${cleanIP}`);
    return next();
  }

  console.log(`❌ IP bloqueada: ${cleanIP}`);
  return res.status(403).json({
    success: false,
    message: "Acceso denegado. IP no autorizada.",
    blockedIP: cleanIP,
  });
};

module.exports = ipWhitelistMiddleware;
