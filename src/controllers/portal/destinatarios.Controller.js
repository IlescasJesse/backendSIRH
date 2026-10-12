// Catálogo de destinatarios ("dirigido a") reutilizable por cualquier
// constancia del Portal de Documentos Digitales: persona directa o
// institución. No es información sindical — el destinatario de una CAS
// suele ser el sindicato/delegación, pero el catálogo sirve para
// cualquier documento (CAD, CNI, futuros).
const { query, insertOne, updateOne } = require("../../config/mongo");
const { ObjectId } = require("mongodb");

const COLECCION = "DESTINATARIOS";

const destinatariosController = {};

// Campos según el tipo de destinatario:
//   persona     -> nombre (obligatorio), cargo (obligatorio), institucion (opcional: dependencia donde trabaja)
//   institucion -> nombre (obligatorio); no lleva cargo ni institucion
const TIPOS = ["persona", "institucion"];

const texto = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

// Devuelve { error } o { campos } con solo los campos que aplican al tipo.
function normalizar({ tipo, nombre, cargo, institucion }) {
  if (tipo === "persona") {
    if (!nombre) return { error: "nombre es requerido" };
    if (!cargo) return { error: "cargo es requerido para una persona" };
    return { campos: { tipo, nombre, cargo, institucion: institucion || null } };
  }
  if (!nombre) return { error: "nombre es requerido" };
  return { campos: { tipo, nombre, cargo: null, institucion: null } };
}

// POST /api/portal-admin/destinatarios  { tipo, nombre, cargo?, institucion? }
// tipo: "persona" | "institucion" (ver campos arriba). Requiere permiso PRT-CFG.
destinatariosController.crear = async (req, res) => {
  const { tipo } = req.body || {};

  if (!TIPOS.includes(tipo)) {
    return res.status(400).json({ message: "tipo debe ser 'persona' o 'institucion'" });
  }
  const { error, campos } = normalizar({
    tipo,
    nombre: texto(req.body.nombre),
    cargo: texto(req.body.cargo),
    institucion: texto(req.body.institucion),
  });
  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    const doc = {
      ...campos,
      activo: true,
      creadoPor: {
        id: req.user?.id,
        username: req.user?.username,
      },
      createdAt: new Date(),
    };
    const result = await insertOne(COLECCION, doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (error) {
    res.status(500).json({ message: "Error creando destinatario", error: error.message });
  }
};

// GET /api/portal-admin/destinatarios?activo=true
destinatariosController.listar = async (req, res) => {
  const { activo } = req.query;

  try {
    const filtro = {};
    if (activo !== undefined) {
      filtro.activo = activo === "true";
    }
    const destinatarios = await query(COLECCION, filtro);
    res.status(200).json(destinatarios);
  } catch (error) {
    res.status(500).json({ message: "Error consultando destinatarios", error: error.message });
  }
};

// PATCH /api/portal-admin/destinatarios/:id  { tipo?, nombre?, cargo?, institucion?, activo? }
// Se valida el resultado completo según el tipo: al cambiar a "institucion" se
// borran cargo e institucion; al cambiar a "persona" se exige cargo.
destinatariosController.actualizar = async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body || {};

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "id inválido" });
  }
  if (req.body?.tipo !== undefined && !TIPOS.includes(req.body.tipo)) {
    return res.status(400).json({ message: "tipo debe ser 'persona' o 'institucion'" });
  }

  try {
    const [actual] = await query(COLECCION, { _id: new ObjectId(id) });
    if (!actual) {
      return res.status(404).json({ message: "Destinatario no encontrado" });
    }

    const mezcla = { ...actual, ...req.body };
    const { error, campos } = normalizar({
      tipo: mezcla.tipo,
      nombre: texto(mezcla.nombre),
      cargo: texto(mezcla.cargo),
      institucion: texto(mezcla.institucion),
    });
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (activo !== undefined) campos.activo = Boolean(activo);

    await updateOne(COLECCION, { _id: new ObjectId(id) }, { $set: campos });
    res.status(200).json({ message: "Destinatario actualizado" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando destinatario", error: error.message });
  }
};

// DELETE /api/portal-admin/destinatarios/:id — baja lógica (activo: false),
// no se elimina físicamente porque constancias ya emitidas referencian el id.
destinatariosController.desactivar = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await updateOne(
      COLECCION,
      { _id: new ObjectId(id) },
      { $set: { activo: false } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Destinatario no encontrado" });
    }
    res.status(200).json({ message: "Destinatario desactivado" });
  } catch (error) {
    res.status(500).json({ message: "Error desactivando destinatario", error: error.message });
  }
};

module.exports = destinatariosController;
