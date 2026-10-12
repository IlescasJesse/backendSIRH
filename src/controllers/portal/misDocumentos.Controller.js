// "Mis documentos firmados": el firmante (permiso PRT-PF) consulta lo que el
// sistema firmó a su nombre. Es de solo lectura — la firma se estampa sola al
// expedir (ver utils/portalFirmas.js). El registro encadenado con hash permite
// demostrar qué firmó y que cualquier otro documento no consta en el sistema.
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { connect, query } = require("../../config/mongo");
const { COLECCION_REGISTRO, sha256, verificarCadena } = require("../../utils/portalFirmas");

const COLECCION_FIRMANTES = "FIRMANTES";
const COLECCION_EMITIDAS = "CONSTANCIAS_EMITIDAS";
const OUTPUT_DIR_BASE = path.join("./pdfs", "portal");
const MAX_PDF_BASE64 = 14 * 1024 * 1024; // ~10MB de PDF
const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 200;

const misDocumentosController = {};

async function firmanteDelUsuario(req) {
  const [firmante] = await query(COLECCION_FIRMANTES, { username: req.user?.username });
  return firmante || null;
}

function sinFirmante(res) {
  return res.status(404).json({
    message: "Tu usuario no está ligado a un firmante; pide a RH que lo registre en el catálogo de Firmantes",
  });
}

const aRespuesta = (a) => ({
  seq: a.seq,
  folio: a.folio,
  tipoDocumento: a.tipoDocumento,
  nombreTipoDocumento: a.nombreTipoDocumento,
  empleadoNombre: a.empleadoNombre,
  empleadoRFC: a.empleadoRFC,
  fechaFirma: a.fechaFirma,
  suplencia: a.suplencia,
  conFirmaImagen: Boolean(a.firmaImagenSha256),
  pdfSha256: a.pdfSha256,
});

// GET /api/portal-admin/mis-documentos?tipo=CAD|CNI&limit=50&skip=0
// Documentos firmados a nombre del firmante logueado, el más reciente primero.
misDocumentosController.listar = async (req, res) => {
  const { tipo } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || LIMITE_DEFAULT, 1), LIMITE_MAX);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

  if (tipo !== undefined && !["CAD", "CNI"].includes(tipo)) {
    return res.status(400).json({ message: "tipo debe ser CAD o CNI" });
  }

  try {
    const firmante = await firmanteDelUsuario(req);
    if (!firmante) return sinFirmante(res);

    const filtro = { firmanteId: firmante._id };
    if (tipo) filtro.tipoDocumento = tipo;

    const db = await connect();
    const coleccion = db.collection(COLECCION_REGISTRO);
    const [total, items] = await Promise.all([
      coleccion.countDocuments(filtro),
      coleccion.find(filtro).sort({ seq: -1 }).skip(skip).limit(limit).toArray(),
    ]);

    res.status(200).json({ total, limit, skip, items: items.map(aRespuesta) });
  } catch (error) {
    console.error("Error listando mis documentos:", error);
    res.status(500).json({ message: "Error al obtener tus documentos firmados" });
  }
};

// Datos del resumen (compartidos por el JSON y el PDF).
async function calcularResumen(firmante) {
  const db = await connect();
  const coleccion = db.collection(COLECCION_REGISTRO);
  const [porTipoCrudo, primera, ultima, cadena] = await Promise.all([
    coleccion.aggregate([
      { $match: { firmanteId: firmante._id } },
      { $group: { _id: "$tipoDocumento", total: { $sum: 1 } } },
    ]).toArray(),
    coleccion.find({ firmanteId: firmante._id }).sort({ seq: 1 }).limit(1).toArray(),
    coleccion.find({ firmanteId: firmante._id }).sort({ seq: -1 }).limit(1).toArray(),
    verificarCadena(firmante._id),
  ]);

  const porTipo = {};
  for (const t of porTipoCrudo) porTipo[t._id] = t.total;

  return {
    firmante: { nombre: firmante.nombre, cargo: firmante.cargo },
    total: cadena.total,
    porTipo,
    primeraFirma: primera[0]?.fechaFirma || null,
    ultimaFirma: ultima[0]?.fechaFirma || null,
    cadenaIntegra: cadena.integra,
    selloRegistro: cadena.ultimoHash, // hash del último asiento: huella de todo el registro
    falla: cadena.falla || null,
  };
}

// GET /api/portal-admin/mis-documentos/resumen
misDocumentosController.resumen = async (req, res) => {
  try {
    const firmante = await firmanteDelUsuario(req);
    if (!firmante) return sinFirmante(res);
    res.status(200).json(await calcularResumen(firmante));
  } catch (error) {
    console.error("Error calculando resumen de firmas:", error);
    res.status(500).json({ message: "Error al calcular el resumen de tus firmas" });
  }
};

// GET /api/portal-admin/mis-documentos/:folio/pdf — el PDF que se firmó.
misDocumentosController.descargarPdf = async (req, res) => {
  const { folio } = req.params;

  try {
    const firmante = await firmanteDelUsuario(req);
    if (!firmante) return sinFirmante(res);

    const db = await connect();
    const asiento = await db.collection(COLECCION_REGISTRO).findOne({ firmanteId: firmante._id, folio });
    // 404 también si el folio es de otro firmante: no revelar que existe.
    if (!asiento) {
      return res.status(404).json({ message: "Ese folio no consta en tu registro de firmas" });
    }

    const [emitida] = await query(COLECCION_EMITIDAS, { folio });
    const base = path.resolve(OUTPUT_DIR_BASE);
    const archivo = emitida ? path.resolve(emitida.archivo) : null;
    if (!archivo || !archivo.startsWith(base + path.sep) || !fs.existsSync(archivo)) {
      return res.status(404).json({ message: "Archivo PDF no disponible" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${folio}.pdf"`);
    fs.createReadStream(archivo).pipe(res);
  } catch (error) {
    console.error("Error descargando documento firmado:", error);
    res.status(500).json({ message: "Error al descargar el documento" });
  }
};

// POST /api/portal-admin/mis-documentos/validar  { pdfBase64 }
// "¿Firmé yo este documento?": se calcula el SHA-256 del PDF recibido y se
// busca en el registro del firmante. Cualquier documento que no coincida
// byte por byte (alterado, o que nunca salió del sistema) no consta como firmado.
misDocumentosController.validar = async (req, res) => {
  const { pdfBase64 } = req.body || {};

  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return res.status(400).json({ message: "pdfBase64 es requerido" });
  }
  const crudo = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
  if (crudo.length > MAX_PDF_BASE64) {
    return res.status(400).json({ message: "El PDF no debe pasar de 10MB" });
  }

  try {
    const firmante = await firmanteDelUsuario(req);
    if (!firmante) return sinFirmante(res);

    const buffer = Buffer.from(crudo, "base64");
    if (buffer.length === 0) {
      return res.status(400).json({ message: "El archivo está vacío" });
    }

    const db = await connect();
    const asiento = await db
      .collection(COLECCION_REGISTRO)
      .findOne({ firmanteId: firmante._id, pdfSha256: sha256(buffer) });

    if (!asiento) {
      return res.status(200).json({
        valido: false,
        message:
          "Este documento NO consta en tu registro de firmas: no fue firmado a tu nombre por el SIRH, o fue alterado después de firmarse. No es válido.",
      });
    }

    res.status(200).json({
      valido: true,
      message: "Este documento fue firmado a tu nombre por el SIRH y no ha sido alterado.",
      documento: aRespuesta(asiento),
    });
  } catch (error) {
    console.error("Error validando documento:", error);
    res.status(500).json({ message: "Error al validar el documento" });
  }
};

// ───────────── Constancia de registro (PDF) ─────────────

// WinAnsi (las fuentes estándar de PDF) no admite todos los caracteres.
const seguro = (t) => String(t ?? "").replace(/[^\x20-\x7E¡-ÿ]/g, "?");

// GET /api/portal-admin/mis-documentos/resumen/pdf
// Constancia descargable: lista de lo firmado a su nombre + sello del registro.
misDocumentosController.resumenPdf = async (req, res) => {
  try {
    const firmante = await firmanteDelUsuario(req);
    if (!firmante) return sinFirmante(res);

    const resumen = await calcularResumen(firmante);
    const db = await connect();
    const asientos = await db
      .collection(COLECCION_REGISTRO)
      .find({ firmanteId: firmante._id })
      .sort({ seq: 1 })
      .toArray();

    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const negro = rgb(0, 0, 0);
    const W = 612;
    const H = 792;
    const M = 50;

    let page = pdf.addPage([W, H]);
    let y = H - M;
    const texto = (t, { x = M, size = 9, font = regular } = {}) => {
      page.drawText(seguro(t), { x, y, size, font, color: negro });
    };
    const parrafo = (t, { size = 9, font = regular, interlineado = 12 } = {}) => {
      const palabras = seguro(t).split(/\s+/);
      let linea = "";
      for (const p of palabras) {
        const prueba = linea ? `${linea} ${p}` : p;
        if (font.widthOfTextAtSize(prueba, size) > W - 2 * M) {
          texto(linea, { size, font });
          y -= interlineado;
          linea = p;
        } else {
          linea = prueba;
        }
      }
      if (linea) {
        texto(linea, { size, font });
        y -= interlineado;
      }
    };
    const nuevaPagina = () => {
      page = pdf.addPage([W, H]);
      y = H - M;
    };

    texto("SECRETARIA DE FINANZAS - SIRH", { size: 10, font: bold });
    y -= 16;
    texto("CONSTANCIA DE REGISTRO DE FIRMAS", { size: 13, font: bold });
    y -= 22;
    texto(`Firmante: ${firmante.nombre}`, { font: bold });
    y -= 12;
    texto(`Cargo: ${firmante.cargo}`);
    y -= 12;
    texto(`Generada el: ${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`);
    y -= 12;
    texto(`Documentos firmados: ${resumen.total}  |  Registro integro: ${resumen.cadenaIntegra ? "SI" : "NO"}`);
    y -= 12;
    texto(`Sello del registro (SHA-256): ${resumen.selloRegistro || "-"}`, { size: 7 });
    y -= 20;

    parrafo(
      "Este registro lista los documentos firmados a nombre del firmante mediante el sistema SIRH. La firma se estampa de forma automatica al expedir cada documento y se asienta con la huella SHA-256 del PDF entregado. Cualquier documento con su nombre o firma que no conste en esta lista, o cuya huella no coincida, no fue emitido por el sistema y no es valido."
    );
    y -= 10;

    const columnas = [
      ["#", M],
      ["Folio", M + 28],
      ["Empleado", M + 175],
      ["Fecha", M + 345],
      ["Huella PDF", M + 420],
    ];
    const encabezado = () => {
      for (const [titulo, x] of columnas) texto(titulo, { x, size: 8, font: bold });
      y -= 12;
    };
    encabezado();

    for (const a of asientos) {
      if (y < M + 20) {
        nuevaPagina();
        encabezado();
      }
      texto(String(a.seq), { x: columnas[0][1], size: 7 });
      texto(a.folio, { x: columnas[1][1], size: 7 });
      texto(a.empleadoNombre.slice(0, 36), { x: columnas[2][1], size: 7 });
      texto(new Date(a.fechaFirma).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" }), {
        x: columnas[3][1],
        size: 7,
      });
      texto(a.pdfSha256.slice(0, 16), { x: columnas[4][1], size: 7 });
      y -= 10;
    }

    const bytes = await pdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="registro-de-firmas.pdf"');
    res.status(200).send(Buffer.from(bytes));
  } catch (error) {
    console.error("Error generando constancia de registro:", error);
    res.status(500).json({ message: "Error al generar la constancia de registro" });
  }
};

module.exports = misDocumentosController;
