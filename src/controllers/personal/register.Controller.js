const { querysql } = require("../../config/mysql");
const {
  query,
  updateOne,
  insertOne,
  deleteOne,
} = require("../../config/mongo");
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
  console.log(user);
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
    await insertOne("USUARIOS", { ...data, status: 1 });
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error al agregar el usuario");
  }

  res.json({ message: "Usuario agregado" });
};

registerController.sendHistory = async (req, res) => {
  const username = req.params.username;
  console.log(username);
  console.log(req.params);

  try {
    const data = await query("USER_ACTIONS", { username: username });
    console.log(data);

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error en la consulta");
  }
};
registerController.updateUser = async (req, res) => {
  const data = req.body;
  const user = req.user;
  console.log(user);
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const userAction = {
    username: user.username,
    module: "USR",
    action: `EDITÓ AL USUARIO: "${data.username}"`,
    timestamp: currentDateTime,
  };
  try {
    await updateOne("USUARIOS", { username: data.username }, { $set: data });
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error al editar el usuario");
  }

  res.json({ message: "Usuario editado" });
};

registerController.inhabilityUser = async (req, res) => {
  const username = req.params.username;
  const user = req.user;
  if (username === user.username) {
    return res
      .status(403)
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
