const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const loginController = {};
const {
  query,
  updateOne,
  insertOne,
  deleteOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");

const SECRET_KEY =
  "639ucb29m39h4vyfkn0j4a7fq45ib2fiaojoomon57bhr7t86wuybuj9tc4meqx4";

loginController.loginUser = async (req, res) => {
  const data = req.body;

  try {
    const users = await query("USUARIOS", { username: data.username });

    const user = users[0];
    if (user && user.password) {
      const isPasswordValid = await bcrypt.compare(
        data.password,
        user.password
      );
      if (isPasswordValid) {
        // Crear el payload del JWT con la información del usuario
        const payload = {
          id: user._id,
          name: user.name,
          sex: user.sex,
          username: user.username,
          rol: user.rol,
          module: user.module,
          permissions: user.permissions,
        };

        // Firmar el JWT
        const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "6h" });
        const currentDateTime = new Date().toLocaleString("en-US", {
          timeZone: "America/Mexico_City",
        });
        await updateOne(
          "USUARIOS",
          { username: data.username },
          { $set: { lastSesion: currentDateTime } }
        );

        // Crear la sesión con la información del usuario
        req.session.user = {
          username: user.username,
          id: user._id,
          token: token,
        };

        // Insertar la sesión en la colección SESIONES
        await insertOne("SESIONES", {
          sessionID: req.session.id,
          userID: new ObjectId(req.session.user.id),
          user: req.session.user.username,
          jwt: req.session.user.token,
          expires: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 horas en milisegundos
        });

        // Enviar el token como respuesta
        return res
          .status(200)
          .json({ message: "Autenticación exitosa", token });
      } else {
        return res.status(404).json({ message: "Password incorrecto" });
      }
    } else {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Error en el servidor", error });
  }
};

loginController.logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Error al cerrar sesión", err });
    }
    res.clearCookie("connect.sid");
    return res.status(200).json({ message: "Sesión cerrada exitosamente" });
  });
};

loginController.checkUsername = async (req, res) => {
  const data = req.body;
  try {
    const users = await query("USUARIOS", { username: data.username });
    if (users.length > 0 && users[0].status === 2) {
      return res.status(403).json({ message: "El usuario está inhabilitado" });
    }
    if (users.length > 0) {
      const user = users[0];
      if (!user.password) {
        return res
          .status(200)
          .json({ message: "Username exists", isNew: true });
      } else {
        return res
          .status(200)
          .json({ message: "Username exists", isNew: false });
      }
    } else {
      return res.status(404).json({ message: "Username not found" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Error en el servidor", error });
  }
};

loginController.createPassword = async (req, res) => {
  const data = req.body;
  try {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await updateOne(
      "USUARIOS",
      { username: data.username },
      { $set: { password: hashedPassword } }
    );
    return res.status(200).json({ message: "Password created successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Error en el servidor", error });
  }
};

module.exports = loginController;
