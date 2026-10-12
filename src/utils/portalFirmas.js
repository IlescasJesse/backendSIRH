// Firma automática y registro de firmas del Portal de Documentos Digitales.
//
// Al expedir un documento se estampa la firma digitalizada de quien suscribe
// (titular, o suplente si el titular está ausente) y se asienta en
// FIRMAS_REGISTRO, una bitácora de solo-agregar por firmante. Cada asiento
// guarda el SHA-256 del PDF exacto que se entregó y se encadena con el hash del
// asiento anterior del mismo firmante: alterar, borrar o reordenar un asiento
// rompe la cadena y `verificarCadena` lo detecta. Es el medio interno con el
// que el firmante demuestra QUÉ firmó; un PDF cuyo hash no consta en su
// registro no fue firmado a su nombre por el sistema.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { connect, query } = require("../config/mongo");

const FIRMAS_DIR = path.resolve("./firmas/portal");
const COLECCION_FIRMAS = "FIRMAS_USUARIOS";
const COLECCION_REGISTRO = "FIRMAS_REGISTRO";
const HASH_INICIAL = "0".repeat(64);

const sha256 = (datos) => crypto.createHash("sha256").update(datos).digest("hex");
const mayus = (v) => String(v ?? "").trim().toUpperCase();

// Firma digitalizada de quien suscribe: { bytes, tipo: "png"|"jpg", sha256 } o
// null si no tiene cuenta o aún no registra su firma (el documento se expide
// igual, sin imagen, pero el asiento queda registrado).
async function cargarFirmaImagen(firmante) {
  const firma = await ubicarFirma(firmante);
  if (!firma) return null;

  const bytes = fs.readFileSync(firma.archivo);
  return { bytes, tipo: firma.tipo, sha256: sha256(bytes) };
}

// Ubica la firma digitalizada de un firmante (sin leer los bytes) para saber si ya
// la registró y poder mostrarla. null si no tiene cuenta o no la ha registrado.
async function ubicarFirma(firmante) {
  if (!firmante?.username) return null;
  const [registro] = await query(COLECCION_FIRMAS, { username: mayus(firmante.username) });
  if (!registro) return null;

  const archivo = path.resolve(registro.archivo);
  // Mismo candado que firmantePerfil: el archivo debe estar dentro de la carpeta.
  if (!archivo.startsWith(FIRMAS_DIR + path.sep) || !fs.existsSync(archivo)) return null;
  return { archivo, tipo: registro.tipo, actualizadaEn: registro.actualizadaEn };
}

function hashAsiento(a) {
  return sha256(
    JSON.stringify([
      a.seq,
      String(a.firmanteId),
      a.folio,
      a.tipoDocumento,
      a.empleadoRFC,
      a.pdfSha256,
      a.firmaImagenSha256,
      new Date(a.fechaFirma).toISOString(),
      a.prevHash,
    ])
  );
}

// Serializa los asientos de este proceso: seq y prevHash dependen del último
// asiento, así que dos expediciones simultáneas no pueden calcularlos a la vez.
// El índice único {firmanteId, seq} cubre el caso de varios procesos.
let cola = Promise.resolve();
let indiceListo = false;

async function asegurarIndice(db) {
  if (indiceListo) return;
  await db.collection(COLECCION_REGISTRO).createIndex({ firmanteId: 1, seq: 1 }, { unique: true });
  await db.collection(COLECCION_REGISTRO).createIndex({ pdfSha256: 1 });
  indiceListo = true;
}

function registrarFirma(datos) {
  const tarea = cola.then(() => insertarAsiento(datos));
  cola = tarea.catch(() => {});
  return tarea;
}

async function insertarAsiento({ firmante, suplencia, titular, folio, tipoDocumento, nombreTipoDocumento, empleado, pdfBytes, firmaImagenSha256, fechaFirma = new Date() }) {
  const db = await connect();
  await asegurarIndice(db);
  const coleccion = db.collection(COLECCION_REGISTRO);

  for (let intento = 0; intento < 3; intento++) {
    const [ultimo] = await coleccion.find({ firmanteId: firmante._id }).sort({ seq: -1 }).limit(1).toArray();
    const asiento = {
      seq: (ultimo?.seq || 0) + 1,
      firmanteId: firmante._id,
      firmanteUsername: firmante.username || null,
      firmanteNombre: firmante.nombre,
      firmanteCargo: firmante.cargo,
      suplencia: Boolean(suplencia),
      titularNombre: titular.nombre,
      folio,
      tipoDocumento,
      nombreTipoDocumento,
      empleadoNombre: empleado.nombre,
      empleadoRFC: empleado.rfc,
      pdfSha256: sha256(pdfBytes),
      firmaImagenSha256: firmaImagenSha256 || null,
      fechaFirma,
      prevHash: ultimo?.hash || HASH_INICIAL,
    };
    asiento.hash = hashAsiento(asiento);

    try {
      await coleccion.insertOne(asiento);
      return asiento;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new Error("No se pudo asentar la firma en el registro");
}

// Recorre todos los asientos del firmante y confirma que la cadena está
// completa y sin alteraciones. Devuelve { integra, total, ultimoHash, falla? }.
async function verificarCadena(firmanteId) {
  const db = await connect();
  const asientos = await db
    .collection(COLECCION_REGISTRO)
    .find({ firmanteId })
    .sort({ seq: 1 })
    .toArray();

  let prev = HASH_INICIAL;
  for (let i = 0; i < asientos.length; i++) {
    const a = asientos[i];
    if (a.seq !== i + 1 || a.prevHash !== prev || a.hash !== hashAsiento(a)) {
      return { integra: false, total: asientos.length, ultimoHash: prev, falla: { seq: a.seq, folio: a.folio } };
    }
    prev = a.hash;
  }
  return { integra: true, total: asientos.length, ultimoHash: asientos.length ? prev : null };
}

module.exports = {
  FIRMAS_DIR,
  COLECCION_FIRMAS,
  COLECCION_REGISTRO,
  sha256,
  cargarFirmaImagen,
  ubicarFirma,
  registrarFirma,
  verificarCadena,
};
