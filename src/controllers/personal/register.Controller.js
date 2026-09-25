const { querysql } = require("../../config/mysql");
const {
  query,
  updateOne,
  insertOne,
  deleteOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const bodyParser = require("body-parser");

const registerController = {};

registerController.getAllUsers = async (req, res) => {
  try {
    const data = await query("USUARIOS", {});
    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).send("Error en la consulta");
  }
};

registerController.addUser = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const userAction = {
    username: user.username,
    module: "USR",
    action: `AGREGÓ AL USUARIO: "${data.username}"`,
    timestamp: currentDateTime,
  };
  try {
    const existingUser = await query("USUARIOS", {
      $or: [{ username: data.username }, { email: data.email }],
    });

    if (existingUser.length > 0) {
      return res.status(400).send("El usuario o el correo ya existen");
    }

    const newUser = {
      ...data,
      password: null,
      status: 1
    };

    await insertOne("USUARIOS", newUser);

    await insertOne("USER_ACTIONS", userAction);
    return res.status(201).json({ message: "Usuario agregado correctamente" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al agregar el usuario" });
  }
};

registerController.sendHistory = async (req, res) => {
  const username = req.params.username;

  try {
    const data = await query("USER_ACTIONS", { username: username });

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error en la consulta");
  }
};

registerController.updateUser = async (req, res) => {
  const data = req.body;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  try {
    const existingUser = await query("USUARIOS", {
      _id: new ObjectId(data._id)
    });

    if (existingUser.length === 0) {
      return res.status(404).json({
        message: "El usuario no existe"
      });
    }

    if (data.username !== existingUser[0].username) {
      const usernameExists = await query("USUARIOS", {
        username: data.username
      });

      if (usernameExists.length > 0) {
        return res.status(400).json({
          message: "El nombre de usuario ya existe"
        });
      }
    }

    const { _id, ...userData } = data;

    await updateOne(
      "USUARIOS",
      { _id: new ObjectId(_id) },
      {
        $set: userData
      }
    );

    const userAction = {
      username: user.username,
      module: "USR",
      action: `EDITÓ AL USUARIO: "${data.username}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);
    return res.status(200).json({ message: "Usuario editado" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al editar el usuario" });
  }
};

registerController.inhabilityUser = async (req, res) => {
  const username = req.params.username;
  const user = req.user;
  if (username === user.username) {
    return res
      .status(404)
      .send("No puedes eliminar tu propio usuario desde la misma sesión");
  }
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const userAction = {
    username: user.username,
    module: "USR",
    action: `ELIMINÓ AL USUARIO: "${username}"`,
    timestamp: currentDateTime,
  };

  try {
    const existingUser = await query("USUARIOS", { username: username });
    if (existingUser.length === 0) {
      return res.status(404).send("El usuario no existe");
    }
    await updateOne(
      "USUARIOS",
      { username: username },
      { $set: { status: 2 } }
    );
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error al eliminar el usuario");
  }

  res.json({ message: "Usuario eliminado" });
};
registerController.habilityUser = async (req, res) => {
  const username = req.params.username;
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const userAction = {
    username: user.username,
    module: "USR",
    action: `HABILITÓ AL USUARIO: "${username}"`,
    timestamp: currentDateTime,
  };

  try {
    const existingUser = await query("USUARIOS", { username: username });
    if (existingUser.length === 0) {
      return res.status(404).send("El usuario no existe");
    }
    await updateOne(
      "USUARIOS",
      { username: username },
      { $set: { status: 1 } }
    );
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error al habilitar el usuario");
  }

  res.json({ message: "Usuario habilitado" });
};
module.exports = registerController;
