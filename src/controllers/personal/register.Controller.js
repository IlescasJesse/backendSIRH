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

// Liga el catálogo FIRMANTES (Portal de Documentos Digitales) con el usuario
// recién creado/editado cuando tiene el permiso PRT-PF, para no capturar dos
// veces a la misma persona. Se guarda "apagado" (activo: false) porque el
// texto de la firma ("cargo") no se puede derivar del puesto burocrático de
// PLANTILLA (ej. "AUXILIAR, NIVEL 01...") — RH lo escribe y activa a mano en
// la pantalla de Firmantes (PRT-FIR), esto solo evita recapturar el nombre.
// OJO con el género: PLANTILLA.SEXO usa "M" = mujer / "H" = hombre; FIRMANTES
// usa "F" = femenino / "M" = masculino. Si no coincide se omite el enlace.
async function sincronizarFirmante(usuarioId, data) {
  const permisos = Array.isArray(data.permissions) ? data.permissions : [];
  if (!permisos.includes("PRT-PF")) return;

  const nombre = String(data.name || "").trim();
  if (!nombre) return;

  const generoPlantilla = data.sex; // "M" (mujer) | "H" (hombre), como lo captura PSL
  const genero = generoPlantilla === "M" ? "F" : generoPlantilla === "H" ? "M" : null;
  if (!genero) return;

  await updateOne(
    "FIRMANTES",
    { usuarioId },
    {
      $set: {
        usuarioId,
        username: data.username,
        nombre,
        genero,
      },
      $setOnInsert: {
        cargo: "",
        activo: false,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

// Campos que el formulario de usuarios puede modificar en updateUser.
const CAMPOS_EDITABLES_USUARIO = [
  "name",
  "sex",
  "phone",
  "username",
  "email",
  "rol",
  "module",
  "permissions",
  "adscripcionACargo",
];

// Adscripción que el firmante (PRT-PF) tendrá a su cargo. El front manda solo
// { idAdscripcion }; aquí se valida contra `adscripciones` y se guarda con
// clave y nombre ya resueltos (`clave` se repite, por eso el id es la llave).
// Devuelve null si no aplica (sin PRT-PF o sin valor) y lanza si el id no existe.
async function resolverAdscripcionACargo(valor, permisos) {
  const id = Number(valor?.idAdscripcion);
  const aplica = Array.isArray(permisos) && permisos.includes("PRT-PF");
  if (!aplica || !Number.isInteger(id) || id <= 0) return null;

  const [nodo] = await querysql(
    "SELECT id_adscripcion, clave, nombre FROM adscripciones WHERE id_adscripcion = ? LIMIT 1",
    [id]
  );
  if (!nodo) {
    const error = new Error("La adscripción a cargo no existe");
    error.status = 400;
    throw error;
  }
  return { idAdscripcion: nodo.id_adscripcion, clave: nodo.clave, nombre: nodo.nombre };
}

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
      adscripcionACargo: await resolverAdscripcionACargo(data.adscripcionACargo, data.permissions),
      password: null,
      status: 1
    };

    const inserted = await insertOne("USUARIOS", newUser);
    await sincronizarFirmante(inserted.insertedId, data);

    await insertOne("USER_ACTIONS", userAction);
    return res.status(201).json({ message: "Usuario agregado correctamente" });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
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
    // Se identifica por _id si viene y es válido; si no, por username (como lo
    // manda el formulario del front, que no incluye _id). Ambos deben ser
    // string/ObjectId válido para no aceptar operadores tipo { $ne: null }.
    let filter;
    if (typeof data._id === "string" && ObjectId.isValid(data._id)) {
      filter = { _id: new ObjectId(data._id) };
    } else if (typeof data.username === "string" && data.username) {
      filter = { username: data.username };
    } else {
      return res.status(400).json({ message: "Falta identificar al usuario" });
    }

    const existingUser = await query("USUARIOS", filter);

    if (existingUser.length === 0) {
      return res.status(404).json({
        message: "El usuario no existe"
      });
    }

    if (
      typeof data.username === "string" &&
      data.username !== existingUser[0].username
    ) {
      const usernameExists = await query("USUARIOS", {
        username: data.username
      });

      if (usernameExists.length > 0) {
        return res.status(400).json({
          message: "El nombre de usuario ya existe"
        });
      }
    }

    // Solo se actualizan los campos que edita el formulario. Antes se hacía
    // $set con todo el body, lo que permitía escribir password (sin hash),
    // status, lastSesion u otros campos internos.
    const userData = {};
    for (const campo of CAMPOS_EDITABLES_USUARIO) {
      if (data[campo] !== undefined) userData[campo] = data[campo];
    }
    // Se resuelve con los permisos finales (los nuevos o, si no vinieron, los que ya tenía)
    if (data.adscripcionACargo !== undefined || data.permissions !== undefined) {
      userData.adscripcionACargo = await resolverAdscripcionACargo(
        data.adscripcionACargo !== undefined ? data.adscripcionACargo : existingUser[0].adscripcionACargo,
        data.permissions !== undefined ? data.permissions : existingUser[0].permissions
      );
    }

    await updateOne(
      "USUARIOS",
      { _id: existingUser[0]._id },
      {
        $set: userData
      }
    );

    // Combinado con lo que ya tenía, por si solo se editó un campo (ej. solo
    // permissions) y name/sex no vinieron en este request.
    await sincronizarFirmante(existingUser[0]._id, { ...existingUser[0], ...userData });

    const userAction = {
      username: user.username,
      module: "USR",
      action: `EDITÓ AL USUARIO: "${data.username}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);
    return res.status(200).json({ message: "Usuario editado" });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
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
