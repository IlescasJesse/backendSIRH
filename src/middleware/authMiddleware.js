const jwt = require("jsonwebtoken");
const { query } = require("../config/mongo");
const SECRET_KEY =
  "639ucb29m39h4vyfkn0j4a7fq45ib2fiaojoomon57bhr7t86wuybuj9tc4meqx4";

const verifyToken = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  console.log("🔐 Verificando token...");

  if (!token) {
    console.log("❌ No token provided");
    return res.status(403).json({ message: "No token provided" });
  }

  try {
    // Primero verificar el token JWT
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log("✓ Token JWT válido para:", decoded.username);

    // Verificar sesión en SESIONES (web) o SESIONES_MOBILE (móvil)
    const [sessionWeb, sessionMobile] = await Promise.all([
      query("SESIONES", { jwt: token }),
      query("SESIONES_MOBILE", { jwt: token }),
    ]);

    if (sessionWeb.length === 0 && sessionMobile.length === 0) {
      console.log("❌ No session found in database for token");
      return res
        .status(401)
        .json({ message: "Unauthorized - No session found" });
    }

    console.log("✓ Sesión encontrada en DB");

    // Verificar que el username en el token exista en la base de datos
    const users = await query("USUARIOS", { username: decoded.username });
    if (users.length === 0) {
      console.log("❌ Usuario no existe en DB:", decoded.username);
      return res.status(401).json({ message: "Unauthorized - User not found" });
    }

    console.log("✓ Token verified and user exists in the database");

    req.user = decoded;
    next();
  } catch (error) {
    console.error("❌ Error en authMiddleware:", error.message);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res
      .status(500)
      .json({ message: "Error en el servidor", error: error.message });
  }
};

module.exports = verifyToken;
