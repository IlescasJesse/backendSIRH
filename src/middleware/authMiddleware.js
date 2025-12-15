const jwt = require("jsonwebtoken");
const { query } = require("../config/mongo");
const SECRET_KEY =
  "639ucb29m39h4vyfkn0j4a7fq45ib2fiaojoomon57bhr7t86wuybuj9tc4meqx4";

const verifyToken = async (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    return res.status(403).json({ message: "No token provided" });
  }

  try {
    const session = await query("SESIONES", { jwt: token });
    if (session.length === 0) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verificar que el username en el token exista en la base de datos
      const users = await query("USUARIOS", { username: decoded.username });
      if (users.length === 0) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      console.log("Token verified and user exists in the database");

      req.user = decoded;
      next();
    });
  } catch (error) {
    return res.status(500).json({ message: "Error en el servidor", error });
  }
};

module.exports = verifyToken;
