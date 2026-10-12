// Perfil de Firmante: cuenta propia (permiso PRT-PF) para quien puede firmar
// documentos del Portal. Enriquecida por RFC desde PLANTILLA al crear el
// usuario, ve solo a su gente y registra su propia firma.
const fs = require("fs");
const path = require("path");
const { query } = require("../../config/mongo");
const { connect } = require("../../config/mongo");
const { querysql } = require("../../config/mysql");
const { datosCedula, ErrorDatosEmpleado, buscarNodoPorNombreClave } = require("../../utils/portalDatosEmpleado");

const firmantePerfilController = {};

const FIRMAS_DIR = path.resolve("./firmas/portal");
const COLECCION_FIRMAS = "FIRMAS_USUARIOS";
const TIPOS_PERMITIDOS = { "image/png": "png", "image/jpeg": "jpg" };
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

fs.mkdirSync(FIRMAS_DIR, { recursive: true });

const mayus = (v) => String(v ?? "").trim().toUpperCase();
const nombreCompleto = (e) =>
  [e.NOMBRES, e.APE_PAT, e.APE_MAT].filter(Boolean).join(" ").trim().toUpperCase();

async function buscarPorRfcEnPlantilla(rfc) {
  const [plantilla = [], foranea = []] = await Promise.all([
    query("PLANTILLA", { RFC: rfc, status: 1 }),
    query("PLANTILLA_FORANEA", { RFC: rfc, status: 1 }),
  ]);
  return plantilla[0] || foranea[0] || null;
}

// GET /api/portal-admin/firmantes/buscar-rfc/:rfc — usado al crear un usuario
// con el permiso PRT-PF, para autollenar sus datos desde PLANTILLA.
firmantePerfilController.buscarPorRfc = async (req, res) => {
  const rfc = mayus(req.params.rfc);

  if (!rfc) {
    return res.status(400).json({ message: "RFC es requerido" });
  }

  try {
    const empleado = await buscarPorRfcEnPlantilla(rfc);
    if (!empleado) {
      return res.status(404).json({ message: "No se encontró ningún empleado con ese RFC" });
    }

    const { nombre, puesto, jerarquia } = await datosCedula(empleado);

    res.status(200).json({
      plantillaId: empleado._id,
      rfc,
      curp: mayus(empleado.CURP),
      nombre,
      puesto,
      jerarquia,
      telefono: String(empleado.TEL_PERSONAL || empleado.TEL_CASA || "").trim(),
      correo: String(empleado.EMAIL_INSTITUCIONAL || empleado.EMAIL || "").trim().toLowerCase(),
    });
  } catch (error) {
    if (error instanceof ErrorDatosEmpleado) {
      return res.status(422).json({ message: error.message });
    }
    console.error("Error buscando empleado por RFC:", error);
    res.status(500).json({ message: "Error al buscar el empleado" });
  }
};

// GET /api/portal-admin/mi-personal — el firmante logueado ve solo a los
// empleados de su misma adscripción (match exacto; no baja por jerarquía).
// Supuesto a confirmar con Jesse si hace falta incluir sub-adscripciones.
firmantePerfilController.miPersonal = async (req, res) => {
  const rfc = mayus(req.user?.username);

  try {
    const yo = await buscarPorRfcEnPlantilla(rfc);
    if (!yo) {
      return res.status(404).json({ message: "No se encontró tu registro de empleado (RFC no coincide con PLANTILLA)" });
    }
    if (!yo.ADSCRIPCION) {
      return res.status(200).json([]);
    }

    const [plantilla = [], foranea = []] = await Promise.all([
      query("PLANTILLA", { status: 1, ADSCRIPCION: yo.ADSCRIPCION, RFC: { $ne: rfc } }),
      query("PLANTILLA_FORANEA", { status: 1, ADSCRIPCION: yo.ADSCRIPCION, RFC: { $ne: rfc } }),
    ]);

    const personal = [...plantilla, ...foranea].map((e) => ({
      nombre: [e.NOMBRES, e.APE_PAT, e.APE_MAT].filter(Boolean).join(" ").trim().toUpperCase(),
      rfc: mayus(e.RFC),
      nombramiento: (e.NOMCATE || "").trim().toUpperCase(),
    }));

    res.status(200).json(personal);
  } catch (error) {
    console.error("Error obteniendo mi personal:", error);
    res.status(500).json({ message: "Error al obtener tu personal" });
  }
};

// GET /api/portal-admin/mi-personal-a-cargo
// Empleados de la adscripción del firmante y de todas las que cuelgan de ella
// (sube por parent_id al revés), agrupados por adscripción. Excluye al propio
// firmante y omite adscripciones sin personal. `clave` NO es única en
// `adscripciones`, por eso cada grupo trae también `idAdscripcion`.
firmantePerfilController.miPersonalACargo = async (req, res) => {
  const rfc = mayus(req.user?.username);

  try {
    // Si el admin le asignó una adscripción al crear/editar su usuario, esa manda;
    // si no, se usa la de su propio registro en PLANTILLA (comportamiento anterior).
    const [usuario] = await query("USUARIOS", { username: req.user?.username });
    const idAsignado = Number(usuario?.adscripcionACargo?.idAdscripcion);

    let miNodo = null;
    if (Number.isInteger(idAsignado) && idAsignado > 0) {
      const [nodo] = await querysql("SELECT * FROM adscripciones WHERE id_adscripcion = ? LIMIT 1", [idAsignado]);
      miNodo = nodo || null;
    } else {
      const [[plantilla], [foranea]] = await Promise.all([
        query("PLANTILLA", { RFC: rfc, status: 1 }),
        query("PLANTILLA_FORANEA", { RFC: rfc, status: 1 }),
      ]).then((r) => r.map((x) => x || []));
      const yo = plantilla || foranea;

      if (!yo) {
        return res.status(404).json({ message: "No se encontró tu registro de empleado (RFC no coincide con PLANTILLA)" });
      }
      miNodo = await buscarNodoPorNombreClave(yo.ADSCRIPCION, yo.CLAVE);
    }

    if (!miNodo) {
      return res.status(200).json([]);
    }

    // La tabla completa es chica (~190 filas): el árbol se arma en memoria.
    const nodos = await querysql(
      "SELECT id_adscripcion, clave, nombre, nivel, parent_id FROM adscripciones"
    );
    const hijosDe = new Map();
    for (const n of nodos) {
      if (!hijosDe.has(n.parent_id)) hijosDe.set(n.parent_id, []);
      hijosDe.get(n.parent_id).push(n);
    }

    const dentro = [];
    const pendientes = [miNodo];
    const vistos = new Set();
    while (pendientes.length) {
      const nodo = pendientes.pop();
      if (vistos.has(nodo.id_adscripcion)) continue;
      vistos.add(nodo.id_adscripcion);
      dentro.push(nodo);
      pendientes.push(...(hijosDe.get(nodo.id_adscripcion) || []));
    }

    const nombres = [...new Set(dentro.map((n) => n.nombre))];
    const filtro = { status: 1, ADSCRIPCION: { $in: nombres }, RFC: { $ne: rfc } };
    const [p = [], f = []] = await Promise.all([
      query("PLANTILLA", filtro),
      query("PLANTILLA_FORANEA", filtro),
    ]);

    // Un empleado cae en el nodo con su mismo nombre; si hay varios con ese
    // nombre se desempata por clave.
    const grupos = new Map(dentro.map((n) => [n.id_adscripcion, { nodo: n, empleados: [] }]));
    for (const e of [...p, ...f]) {
      const candidatos = dentro.filter((n) => n.nombre === e.ADSCRIPCION);
      const nodo = candidatos.find((n) => Number(n.clave) === Number(e.CLAVE)) || candidatos[0];
      if (!nodo) continue;
      grupos.get(nodo.id_adscripcion).empleados.push({
        nombre: nombreCompleto(e),
        rfc: mayus(e.RFC),
        nombramiento: (e.NOMCATE || "").trim().toUpperCase(),
        tiponom: mayus(e.TIPONOM),
        numpla: String(e.NUMPLA ?? "").trim(),
      });
    }

    const respuesta = [...grupos.values()]
      .filter((g) => g.empleados.length > 0)
      .sort((a, b) => a.nodo.nivel - b.nodo.nivel || a.nodo.nombre.localeCompare(b.nodo.nombre, "es"))
      .map(({ nodo, empleados }) => ({
        idAdscripcion: nodo.id_adscripcion,
        clave: nodo.clave,
        adscripcion: nodo.nombre,
        nivel: nodo.nivel,
        empleados: empleados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      }));

    res.status(200).json(respuesta);
  } catch (error) {
    console.error("Error obteniendo mi personal a cargo:", error);
    res.status(500).json({ message: "Error al obtener tu personal a cargo" });
  }
};

// GET /api/portal-admin/adscripciones-catalogo (solo admin "*")
// Catálogo plano para el buscador "Adscripción a cargo" del alta/edición de
// usuario. `clave` se repite, por eso se manda `idAdscripcion`.
firmantePerfilController.catalogoAdscripciones = async (req, res) => {
  try {
    const filas = await querysql(
      "SELECT id_adscripcion, clave, nombre, nivel FROM adscripciones ORDER BY nivel ASC, nombre ASC"
    );
    res.status(200).json(
      filas.map((f) => ({
        idAdscripcion: f.id_adscripcion,
        clave: f.clave,
        nombre: f.nombre,
        nivel: f.nivel,
      }))
    );
  } catch (error) {
    console.error("Error obteniendo catálogo de adscripciones:", error);
    res.status(500).json({ message: "Error al obtener el catálogo de adscripciones" });
  }
};

// ───────────── Mi firma ─────────────

function rutaFirma(username) {
  // El nombre de archivo se resuelve por el username autenticado (no por
  // datos del body), así nadie puede leer/pisar la firma de alguien más.
  const seguro = mayus(username).replace(/[^A-Z0-9]/g, "");
  return path.join(FIRMAS_DIR, `${seguro}.bin`);
}

// GET /api/portal-admin/mi-firma — metadata (para saber si ya tiene una).
firmantePerfilController.obtenerMiFirma = async (req, res) => {
  try {
    const registros = await query(COLECCION_FIRMAS, { username: mayus(req.user?.username) });
    const registro = registros[0];
    if (!registro) {
      return res.status(200).json({ existe: false });
    }
    res.status(200).json({ existe: true, actualizadaEn: registro.actualizadaEn, tipo: registro.tipo });
  } catch (error) {
    console.error("Error consultando mi firma:", error);
    res.status(500).json({ message: "Error al consultar tu firma" });
  }
};

// GET /api/portal-admin/mi-firma/imagen — sirve el archivo para un <img src>.
firmantePerfilController.obtenerMiFirmaImagen = async (req, res) => {
  try {
    const registros = await query(COLECCION_FIRMAS, { username: mayus(req.user?.username) });
    const registro = registros[0];
    const archivo = registro ? path.resolve(registro.archivo) : null;

    if (!registro || !archivo.startsWith(FIRMAS_DIR + path.sep) || !fs.existsSync(archivo)) {
      return res.status(404).json({ message: "No tienes una firma registrada" });
    }

    res.setHeader("Content-Type", registro.tipo === "png" ? "image/png" : "image/jpeg");
    fs.createReadStream(archivo).pipe(res);
  } catch (error) {
    console.error("Error sirviendo mi firma:", error);
    res.status(500).json({ message: "Error al obtener tu firma" });
  }
};

// POST /api/portal-admin/mi-firma  { firmaBase64: "data:image/png;base64,..." }
// Mismo patrón que el resto del Portal (PDFs en base64, sin multer).
firmantePerfilController.guardarMiFirma = async (req, res) => {
  const { firmaBase64 } = req.body || {};

  if (!firmaBase64 || typeof firmaBase64 !== "string") {
    return res.status(400).json({ message: "firmaBase64 es requerido" });
  }

  const match = /^data:(image\/png|image\/jpeg);base64,(.+)$/.exec(firmaBase64.trim());
  if (!match) {
    return res.status(400).json({ message: "La firma debe ser una imagen PNG o JPEG" });
  }

  const tipo = TIPOS_PERMITIDOS[match[1]];
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return res.status(400).json({ message: "La imagen debe pesar entre 1 byte y 2MB" });
  }

  const username = mayus(req.user?.username);
  const archivo = rutaFirma(username);

  try {
    fs.writeFileSync(archivo, buffer);

    const db = await connect();
    await db.collection(COLECCION_FIRMAS).updateOne(
      { username },
      {
        $set: {
          username,
          archivo,
          tipo,
          actualizadaEn: new Date(),
        },
      },
      { upsert: true }
    );

    res.status(200).json({ message: "Firma guardada correctamente" });
  } catch (error) {
    console.error("Error guardando mi firma:", error);
    res.status(500).json({ message: "Error al guardar tu firma" });
  }
};

module.exports = firmantePerfilController;
