const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const loginController = {};
const {
  query,
  updateOne,
  insertOne
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const JWT_SECRET = process.env.JWT_SECRET;

loginController.loginUser = async (req, res) => {
  const data = req.body;

  try {
    const users = await query("USUARIOS", {
      username: data.username
    });

    const user = users[0];

    if (!user || user.status !== 1 || !user.password) {
      return res.status(401).json({
        message: "Usuario o contraseña incorrectos"
      });
    }

    const isPasswordValid = await bcryptjs.compare(
      data.password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Usuario o contraseña incorrectos"
      });
    }

    const payload = {
      id: user._id,
      name: user.name,
      sex: user.sex,
      username: user.username,
      rol: user.rol,
      module: user.module,
      permissions: user.permissions,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: "6h"
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 6 * 60 * 60 * 1000,
      path: "/"
    });

    const currentDateTime = new Date().toLocaleString("en-US", {
      timeZone: "America/Mexico_City",
    });

    await updateOne(
      "USUARIOS",
      { username: data.username },
      {
        $set: {
          lastSesion: currentDateTime
        }
      }
    );

    req.session.user = {
      username: user.username,
      id: user._id,
      token
    };

    await insertOne("SESIONES", {
      sessionID: req.session.id,
      userID: new ObjectId(req.session.user.id),
      user: req.session.user.username,
      jwt: req.session.user.token,
      expires: new Date(
        Date.now() + 6 * 60 * 60 * 1000
      )
    });

    return res.status(200).json({
      message: "Autenticación exitosa",
      token,
      user: {
        id: user._id,
        username: user.username,
        rol: user.rol,
        permissions: user.permissions || [],
      },
    });

  } catch (error) {
    return res.status(500).json({ message: "Error en el servidor" });
  }
};

loginController.logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Error al cerrar sesión", err });
    }
    res.clearCookie("connect.sid");
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
    return res.status(200).json({ message: "Sesión cerrada exitosamente" });
  });
};

loginController.checkUsername = async (req, res) => {
  const data = req.body;

  try {
    const users = await query("USUARIOS", {
      username: data.username
    });

    const user = users[0];

    // Usuario no existe o está inhabilitado
    if (!user || user.status !== 1) {
      return res.status(401).json({
        message: "Usuario o contraseña incorrectos"
      });
    }

    // Usuario existe pero todavía no tiene contraseña
    if (!user.password) {
      return res.status(200).json({
        message: "El usuario requiere crear una contraseña",
        isNew: true
      });
    }

    // Usuario existente con contraseña
    return res.status(200).json({
      message: "Usuario encontrado",
      isNew: false
    });

  } catch (error) {
    console.error("Error en checkUsername:", error);

    return res.status(500).json({
      message: "Error en el servidor"
    });
  }
};

loginController.createPassword = async (req, res) => {
  const data = req.body;

  try {
    const users = await query("USUARIOS", {
      username: data.username
    });

    const user = users[0];

    // Usuario no existe o está inhabilitado
    if (!user || user.status !== 1) {
      return res.status(401).json({
        message: "No fue posible crear la contraseña"
      });
    }

    // El usuario ya tiene contraseña
    if (user.password) {
      return res.status(400).json({
        message: "El usuario ya tiene una contraseña creada"
      });
    }

    // Generar contraseña cifrada
    const hashedPassword = await bcryptjs.hash(
      data.password,
      10
    );

    await updateOne(
      "USUARIOS",
      { username: data.username },
      {
        $set: {
          password: hashedPassword
        }
      }
    );

    return res.status(200).json({
      message: "Contraseña creada correctamente"
    });

  } catch (error) {
    console.error("Error en createPassword:", error);

    return res.status(500).json({
      message: "Error en el servidor"
    });
  }
};

module.exports = loginController;
