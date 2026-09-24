const ipWhitelistMiddleware = (req, res, next) => {
  const allowedIPs = (process.env.ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip);

  const clientIP =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress;

  const cleanIP = clientIP ? clientIP.replace(/^::ffff:/, "") : "unknown";

  console.log(`🔒 IP Request: ${cleanIP}`);

  if (allowedIPs.length === 0 || !process.env.ALLOWED_IPS) {
    console.log("⚠️  Modo desarrollo: IP Whitelist desactivada");
    return next();
  }

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