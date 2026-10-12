// Catálogo de firmantes del Portal de Documentos Digitales y configuración de
// quién firma (titular / suplente / ausencia del titular). Permiso PRT-FIR.
const fs = require("fs");
const { connect, query, insertOne, updateOne } = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const { ubicarFirma } = require("../../utils/portalFirmas");
const {
  COLECCION_FIRMANTES,
  COLECCION_CONFIG,
  ID_CONFIG,
  obtenerConfiguracion,
} = require("../../utils/portalFirmantes");

const GENEROS = ["F", "M"];

const firmantesController = {};

const esIdValido = (id) => typeof id === "string" && ObjectId.isValid(id);

// POST /api/portal-admin/firmantes  { nombre, cargo, genero }
// nombre incluye el título tal como se imprime (p. ej. "L.F.C.P. PAOLA PORRAS PÉREZ").
// cargo tal como se escribe en la leyenda (p. ej. "Jefa del Departamento de Recursos Humanos").
// genero: "F" | "M" (define "la"/"el" en la leyenda de suplencia).
firmantesController.crear = async (req, res) => {
  const { nombre, cargo, genero } = req.body || {};

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ message: "nombre es requerido" });
  }
  if (!cargo || !String(cargo).trim()) {
    return res.status(400).json({ message: "cargo es requerido" });
  }
  if (!GENEROS.includes(genero)) {
    return res.status(400).json({ message: "genero debe ser 'F' o 'M'" });
  }

  try {
    const doc = {
      nombre: String(nombre).trim(),
      cargo: String(cargo).trim(),
      genero,
      activo: true,
      creadoPor: { id: req.user?.id, username: req.user?.username },
      createdAt: new Date(),
    };
    const result = await insertOne(COLECCION_FIRMANTES, doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (error) {
    res.status(500).json({ message: "Error creando firmante", error: error.message });
  }
};

// GET /api/portal-admin/firmantes?activo=true
firmantesController.listar = async (req, res) => {
  const { activo } = req.query;

  try {
    const filtro = {};
    if (activo !== undefined) {
      filtro.activo = activo === "true";
    }
    res.status(200).json(await query(COLECCION_FIRMANTES, filtro));
  } catch (error) {
    res.status(500).json({ message: "Error consultando firmantes", error: error.message });
  }
};

// PATCH /api/portal-admin/firmantes/:id  { nombre?, cargo?, genero?, activo? }
firmantesController.actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre, cargo, genero, activo } = req.body || {};

  if (!esIdValido(id)) {
    return res.status(400).json({ message: "id inválido" });
  }
  if (genero !== undefined && !GENEROS.includes(genero)) {
    return res.status(400).json({ message: "genero debe ser 'F' o 'M'" });
  }
  if ((nombre !== undefined && !String(nombre).trim()) || (cargo !== undefined && !String(cargo).trim())) {
    return res.status(400).json({ message: "nombre y cargo no pueden ir vacíos" });
  }

  const campos = {};
  if (nombre !== undefined) campos.nombre = String(nombre).trim();
  if (cargo !== undefined) campos.cargo = String(cargo).trim();
  if (genero !== undefined) campos.genero = genero;
  if (activo !== undefined) campos.activo = Boolean(activo);

  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ message: "No hay campos para actualizar" });
  }

  try {
    if (campos.activo === false) {
      const enUso = await enUsoComoFirmante(id);
      if (enUso) return res.status(409).json({ message: enUso });
    }
    const result = await updateOne(COLECCION_FIRMANTES, { _id: new ObjectId(id) }, { $set: campos });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Firmante no encontrado" });
    }
    res.status(200).json({ message: "Firmante actualizado" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando firmante", error: error.message });
  }
};

// DELETE /api/portal-admin/firmantes/:id — baja lógica (activo: false); las
// constancias ya emitidas conservan el nombre con el que se firmaron.
firmantesController.desactivar = async (req, res) => {
  const { id } = req.params;

  if (!esIdValido(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const enUso = await enUsoComoFirmante(id);
    if (enUso) return res.status(409).json({ message: enUso });

    const result = await updateOne(COLECCION_FIRMANTES, { _id: new ObjectId(id) }, { $set: { activo: false } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Firmante no encontrado" });
    }
    res.status(200).json({ message: "Firmante desactivado" });
  } catch (error) {
    res.status(500).json({ message: "Error desactivando firmante", error: error.message });
  }
};

async function enUsoComoFirmante(id) {
  const config = await obtenerConfiguracion();
  if (config.titularId && String(config.titularId) === String(id)) {
    return "Este firmante es el titular configurado; asigna otro titular antes de desactivarlo";
  }
  if (config.suplenteId && String(config.suplenteId) === String(id)) {
    return "Este firmante es el suplente configurado; asigna otro suplente antes de desactivarlo";
  }
  return null;
}

// GET /api/portal-admin/configuracion-firma
// -> { titularId, suplenteId, titularAusente, titular: {…}|null, suplente: {…}|null }
firmantesController.obtenerConfiguracion = async (req, res) => {
  try {
    const config = await obtenerConfiguracion();
    const cargar = async (id) => {
      if (!id) return null;
      const [firmante] = await query(COLECCION_FIRMANTES, { _id: new ObjectId(String(id)) });
      if (!firmante) return null;
      // Si ya registró su firma digitalizada (Perfil de Firmante); sin ella el documento sale sin imagen
      const firma = await ubicarFirma(firmante);
      return { ...firmante, tieneFirma: Boolean(firma), firmaActualizadaEn: firma?.actualizadaEn || null };
    };
    res.status(200).json({
      ...config,
      titular: await cargar(config.titularId),
      suplente: await cargar(config.suplenteId),
    });
  } catch (error) {
    res.status(500).json({ message: "Error consultando la configuración de firma", error: error.message });
  }
};

// GET /api/portal-admin/firmantes/:id/firma — imagen de la firma registrada del
// firmante (para la vista previa en Expedición). 404 si no la ha registrado.
firmantesController.firmaImagen = async (req, res) => {
  const { id } = req.params;
  if (!esIdValido(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const [firmante] = await query(COLECCION_FIRMANTES, { _id: new ObjectId(id) });
    const firma = firmante ? await ubicarFirma(firmante) : null;
    if (!firma) {
      return res.status(404).json({ message: "Este firmante aún no ha registrado su firma" });
    }
    res.setHeader("Content-Type", firma.tipo === "png" ? "image/png" : "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(firma.archivo).pipe(res);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo la firma", error: error.message });
  }
};

// PUT /api/portal-admin/configuracion-firma  { titularId, suplenteId?, titularAusente }
// titularAusente = true agrega la leyenda de suplencia a los documentos que
// se expidan a partir de ahora (se puede forzar por documento desde la
// expedición con el campo titularAusente).
firmantesController.guardarConfiguracion = async (req, res) => {
  const { titularId, suplenteId = null, titularAusente = false } = req.body || {};

  if (!esIdValido(titularId)) {
    return res.status(400).json({ message: "titularId es requerido" });
  }
  if (suplenteId !== null && !esIdValido(suplenteId)) {
    return res.status(400).json({ message: "suplenteId inválido" });
  }
  if (typeof titularAusente !== "boolean") {
    return res.status(400).json({ message: "titularAusente debe ser true o false" });
  }
  if (suplenteId && suplenteId === titularId) {
    return res.status(400).json({ message: "El titular y el suplente deben ser personas distintas" });
  }
  if (titularAusente && !suplenteId) {
    return res.status(400).json({ message: "Para marcar al titular como ausente debes asignar un suplente" });
  }

  try {
    for (const [id, etiqueta] of [[titularId, "titular"], [suplenteId, "suplente"]]) {
      if (!id) continue;
      const [firmante] = await query(COLECCION_FIRMANTES, { _id: new ObjectId(id) });
      if (!firmante || !firmante.activo) {
        return res.status(404).json({ message: `El firmante ${etiqueta} no existe o está inactivo` });
      }
    }

    const db = await connect();
    await db.collection(COLECCION_CONFIG).updateOne(
      { _id: ID_CONFIG },
      {
        $set: {
          titularId,
          suplenteId,
          titularAusente,
          actualizadoPor: { id: req.user?.id, username: req.user?.username },
          actualizadoEn: new Date(),
        },
      },
      { upsert: true }
    );
    res.status(200).json({ message: "Configuración de firma guardada", titularId, suplenteId, titularAusente });
  } catch (error) {
    res.status(500).json({ message: "Error guardando la configuración de firma", error: error.message });
  }
};

module.exports = firmantesController;
