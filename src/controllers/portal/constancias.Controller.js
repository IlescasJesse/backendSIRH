// Portal de Documentos Digitales — Fase 1
// Solo RH solicita/expide constancias a nombre de empleados (permiso PRT-DOC).
// El self-service de empleados (login RFC) queda codeado en fases
// posteriores del módulo pero NO se monta en app.js todavía.
// Spec completa: memoria "project-portal-documentos-digitales".
const path = require("path");
const fs = require("fs");
const { connect, query, insertOne } = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const {
  generarFolio,
  generarCodigoVerificacion,
  hashCodigoVerificacion,
} = require("../../utils/folio");
const { generarPdfCedula, generarPdfConstancia } = require("../../utils/portalPdf");
const { datosCedula, datosConstancia } = require("../../utils/portalDatosEmpleado");
const { resolverFirmantes } = require("../../utils/portalFirmantes");
const {
  cargarFirmaImagen,
  registrarFirma,
  COLECCION_REGISTRO: COLECCION_FIRMAS_REGISTRO,
} = require("../../utils/portalFirmas");

const COLECCION_EMITIDAS = "CONSTANCIAS_EMITIDAS";
const COLECCION_DESTINATARIOS = "DESTINATARIOS";
const COLECCION_CONTADORES = "CONTADORES_PORTAL";
const OUTPUT_DIR_BASE = path.join("./pdfs", "portal");

const TIPOS_DOCUMENTO = {
  // CAD sirve tanto para sindicato como para administración: es el mismo
  // documento, solo cambia el destinatario (catálogo DESTINATARIOS). No
  // existe un tipo "CAS" separado — corrección del usuario, 2026-09-22.
  CAD: "Cédula de Adscripción",
  CNI: "Constancia de No Incidencias",
};

const constanciasController = {};

const nombreCompletoEmpleado = (e) =>
  [e.NOMBRES, e.APE_PAT, e.APE_MAT].filter(Boolean).join(" ").trim().toUpperCase();

// Delegación sindical del empleado; null si está vacía o es la captura basura
// "SIN DELEGADO" (mismo criterio que delegacionSindical.Controller.js).
const delegacionEmpleado = (e) => {
  const clave = String(e?.SINDICATO?.DELEGACION ?? "").trim();
  return clave && clave.toUpperCase() !== "SIN DELEGADO" ? clave : null;
};

// Identificador con el que el front agrupa los documentos de un mismo "Generar".
const LOTE_ID_REGEX = /^[A-Za-z0-9-]{1,64}$/;

// Contador atómico por tipo+año: $inc evita folios repetidos si RH expide
// dos constancias al mismo tiempo. La primera vez se siembra con lo ya
// emitido para continuar la numeración existente.
async function siguienteConsecutivo(tipoDocumento, anio) {
  const db = await connect();
  const contadores = db.collection(COLECCION_CONTADORES);
  const _id = `${tipoDocumento}-${anio}`;

  const yaEmitidas = await db
    .collection(COLECCION_EMITIDAS)
    .countDocuments({ tipoDocumento, anio });
  try {
    await contadores.updateOne(
      { _id },
      { $setOnInsert: { seq: yaEmitidas } },
      { upsert: true }
    );
  } catch (error) {
    // Carrera entre dos primeras emisiones: el otro request ya sembró.
    if (error.code !== 11000) throw error;
  }

  const contador = await contadores.findOneAndUpdate(
    { _id },
    { $inc: { seq: 1 } },
    { returnDocument: "after" }
  );
  return contador.seq;
}

// Los PDF replican las plantillas oficiales CÉDULA CME2 / CONSTANCIA CME2
// (ver utils/portalPdf.js). Ambas traen fijo a quién van dirigidas, por lo
// que el "dirigido a" del catálogo DESTINATARIOS se guarda en el registro
// pero no se imprime.
//
// CNI: mientras no exista la spec de qué cuenta como incidencia, se expide
// "sin incidencias" a TODO el personal, sin validación (decisión del usuario,
// 2026-09-22). Cuando llegue la spec, validar aquí antes de generar el PDF.
//
// Cada tipo separa la preparación de datos (valida al empleado, puede lanzar
// error 422) de la generación del PDF, para no gastar un folio en una
// expedición que iba a fallar.
const TIPOS = {
  CAD: {
    prepararDatos: datosCedula,
    generarPdf: ({ datos, folio, firmantes, firmaImagen }) => generarPdfCedula({ datos, folio, firmantes, firmaImagen }),
  },
  CNI: {
    prepararDatos: async (empleado) => datosConstancia(empleado),
    generarPdf: ({ datos, folio, consecutivo, firmantes, firmaImagen }) =>
      generarPdfConstancia({ datos, folio, firmantes, firmaImagen, oficio: String(consecutivo).padStart(4, "0") }),
  },
};

// Núcleo de la emisión: valida datos, folio, consecutivo, PDF en disco y
// registro en CONSTANCIAS_EMITIDAS con hash del código de verificación. Lo
// usan tanto la expedición directa de RH como la aceptación de una solicitud
// por parte del firmante (solicitudes.Controller.js). Puede lanzar errores con
// `.status = 422` (datos del empleado / configuración de firma incompletos).
async function expedirDocumento({ tipoDocumento, empleado, destinatario, titularAusente, expedidoPor, loteId = null }) {
  const { prepararDatos, generarPdf } = TIPOS[tipoDocumento];

  const datos = await prepararDatos(empleado);
  // titularAusente (opcional) fuerza la situación para este documento; si no
  // viene, se usa la de la configuración de firma.
  const firmantes = await resolverFirmantes({ titularAusente });

  const anio = new Date().getFullYear();
  const consecutivo = await siguienteConsecutivo(tipoDocumento, anio);
  const folio = generarFolio(tipoDocumento, consecutivo, anio);

  // Firma automática: quien suscribe es el suplente si el titular está ausente.
  const suscriptor = firmantes.suplencia ? firmantes.suplente : firmantes.titular;
  const firmaImagen = await cargarFirmaImagen(suscriptor);

  const pdfBytes = await generarPdf({ datos, folio, consecutivo, firmantes, firmaImagen });

  const outputDir = path.join(OUTPUT_DIR_BASE, tipoDocumento.toLowerCase());
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const nombreArchivo = `${folio}.pdf`;
  fs.writeFileSync(path.join(outputDir, nombreArchivo), pdfBytes);

  const codigoVerificacion = generarCodigoVerificacion();

  await insertOne(COLECCION_EMITIDAS, {
    folio,
    tipoDocumento,
    nombreTipoDocumento: TIPOS_DOCUMENTO[tipoDocumento],
    anio,
    consecutivo,
    empleadoId: empleado._id,
    empleadoNombre: nombreCompletoEmpleado(empleado),
    empleadoRFC: empleado.RFC,
    delegacion: delegacionEmpleado(empleado),
    loteId,
    destinatarioId: destinatario?._id || null,
    destinatarioNombre: destinatario?.nombre || null,
    codigoVerificacionHash: hashCodigoVerificacion(codigoVerificacion),
    archivo: path.join(outputDir, nombreArchivo),
    firmante: {
      titularId: firmantes.titular._id,
      titularNombre: firmantes.titular.nombre,
      suplenteId: firmantes.suplente?._id || null,
      suplenteNombre: firmantes.suplente?.nombre || null,
      suplencia: firmantes.suplencia,
    },
    expedidoPor,
    fechaExpedicion: new Date(),
  });

  // Asiento en el registro de firmas del suscriptor (hash del PDF entregado).
  await registrarFirma({
    firmante: suscriptor,
    suplencia: firmantes.suplencia,
    titular: firmantes.titular,
    folio,
    tipoDocumento,
    nombreTipoDocumento: TIPOS_DOCUMENTO[tipoDocumento],
    empleado: { nombre: nombreCompletoEmpleado(empleado), rfc: String(empleado.RFC || "").trim().toUpperCase() },
    pdfBytes,
    firmaImagenSha256: firmaImagen?.sha256,
  });

  return { folio, codigoVerificacion, pdfBytes, conFirmaImagen: Boolean(firmaImagen) };
}

// Lógica de la expedición directa de RH (PRT-DOC): arma el request y delega
// en expedirDocumento.
async function emitirConstancia({ req, res, tipoDocumento }) {
  const { employeeId, destinatarioId, titularAusente } = req.body || {};
  const loteId = req.body?.loteId ?? null;

  if (!employeeId) {
    return res.status(400).json({ message: "employeeId es requerido" });
  }
  if (titularAusente !== undefined && typeof titularAusente !== "boolean") {
    return res.status(400).json({ message: "titularAusente debe ser true o false" });
  }
  if (loteId !== null && !(typeof loteId === "string" && LOTE_ID_REGEX.test(loteId))) {
    return res.status(400).json({ message: "loteId debe ser texto de hasta 64 caracteres (letras, números y guiones)" });
  }

  try {
    const empleados = await query("PLANTILLA", { _id: new ObjectId(employeeId) });
    const empleado = empleados[0];

    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    let destinatario = null;
    if (destinatarioId) {
      const destinatarios = await query(COLECCION_DESTINATARIOS, {
        _id: new ObjectId(destinatarioId),
      });
      destinatario = destinatarios[0] || null;
      if (!destinatario) {
        return res.status(404).json({ message: "Destinatario no encontrado" });
      }
    }

    const { folio, codigoVerificacion, pdfBytes } = await expedirDocumento({
      tipoDocumento,
      empleado,
      destinatario,
      titularAusente,
      loteId,
      expedidoPor: {
        id: req.user?.id,
        username: req.user?.username,
        name: req.user?.name,
      },
    });

    // El código de verificación se devuelve una sola vez, igual que la
    // contraseña temporal del portal empleado — el front debe mostrarlo
    // y no se puede recuperar después.
    res.status(201).json({
      folio,
      codigoVerificacion,
      pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    });
  } catch (error) {
    if (error.status === 422) {
      return res.status(422).json({ message: error.message });
    }
    console.error(`Error generando ${tipoDocumento}:`, error);
    res.status(500).json({ message: "Error generando la constancia", error: error.message });
  }
}

// POST /api/portal-admin/constancias/cad  { employeeId, destinatarioId?, titularAusente?, loteId? }
// Requiere permiso PRT-DOC. RH solicita/expide de una sola vez (pre-autorizada).
constanciasController.generarCAD = (req, res) =>
  emitirConstancia({ req, res, tipoDocumento: "CAD" });

// POST /api/portal-admin/constancias/cni  { employeeId, destinatarioId?, titularAusente?, loteId? }
// Requiere permiso PRT-DOC. SIN validación de incidencias (ver nota sobre
// CNI arriba de TIPOS): se expide "sin incidencias" a cualquier empleado que
// RH solicite, decisión explícita del usuario mientras no exista la
// spec de qué cuenta como incidencia.
constanciasController.generarCNI = (req, res) =>
  emitirConstancia({ req, res, tipoDocumento: "CNI" });

// GET /api/portal-admin/constancias?employeeId=
constanciasController.listarConstancias = async (req, res) => {
  const { employeeId } = req.query;

  try {
    const filtro = {};
    if (employeeId) {
      filtro.empleadoId = new ObjectId(employeeId);
    }

    const constancias = await query(COLECCION_EMITIDAS, filtro);
    const db = await connect();

    // Registros anteriores a este cambio no traen `delegacion` y guardaron solo
    // NOMBRES: se completan con UNA consulta a PLANTILLA por empleadoId.
    const idsViejos = [
      ...new Set(constancias.filter((c) => !("delegacion" in c) && c.empleadoId).map((c) => String(c.empleadoId))),
    ];
    const empleadosViejos = new Map();
    if (idsViejos.length > 0) {
      const empleados = await db
        .collection("PLANTILLA")
        .find({ _id: { $in: idsViejos.map((id) => new ObjectId(id)) } })
        .project({ NOMBRES: 1, APE_PAT: 1, APE_MAT: 1, SINDICATO: 1 })
        .toArray();
      for (const e of empleados) empleadosViejos.set(String(e._id), e);
    }

    // Datos de firma de todos los folios en una sola consulta.
    const folios = constancias.map((c) => c.folio);
    const asientos = await db
      .collection(COLECCION_FIRMAS_REGISTRO)
      .find({ folio: { $in: folios } })
      .project({ folio: 1, firmanteNombre: 1, suplencia: 1, firmaImagenSha256: 1 })
      .toArray();
    const asientoPorFolio = new Map(asientos.map((a) => [a.folio, a]));

    const respuesta = constancias.map(({ codigoVerificacionHash, ...resto }) => {
      const viejo = empleadosViejos.get(String(resto.empleadoId));
      const asiento = asientoPorFolio.get(resto.folio);
      const suplencia = Boolean(asiento ? asiento.suplencia : resto.firmante?.suplencia);
      return {
        ...resto,
        empleadoNombre: viejo ? nombreCompletoEmpleado(viejo) : resto.empleadoNombre,
        delegacion: "delegacion" in resto ? resto.delegacion : delegacionEmpleado(viejo),
        loteId: resto.loteId ?? null,
        firmaImagen: asiento?.firmaImagenSha256 != null,
        firmadoPor:
          asiento?.firmanteNombre ||
          (suplencia ? resto.firmante?.suplenteNombre : resto.firmante?.titularNombre) ||
          "",
        suplencia,
      };
    });
    res.status(200).json(respuesta);
  } catch (error) {
    res.status(500).json({ message: "Error consultando constancias", error: error.message });
  }
};

// GET /api/portal-admin/constancias/:folio/pdf
// Reimprime una constancia ya emitida (para el historial). Requiere PRT-DOC.
constanciasController.descargarPdf = async (req, res) => {
  const { folio } = req.params;

  try {
    const resultados = await query(COLECCION_EMITIDAS, { folio });
    const constancia = resultados[0];

    if (!constancia) {
      return res.status(404).json({ message: "Folio no encontrado" });
    }

    // El archivo debe quedar dentro de ./pdfs/portal, aunque la ruta
    // venga de BD.
    const base = path.resolve(OUTPUT_DIR_BASE);
    const archivo = path.resolve(constancia.archivo);
    if (!archivo.startsWith(base + path.sep) || !fs.existsSync(archivo)) {
      return res.status(404).json({ message: "Archivo PDF no disponible" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${folio}.pdf"`);
    fs.createReadStream(archivo).pipe(res);
  } catch (error) {
    res.status(500).json({ message: "Error descargando constancia", error: error.message });
  }
};

// GET /api/verificacion/:folio?codigo=XXXXXXXX  (público, sin auth)
constanciasController.verificar = async (req, res) => {
  const { folio } = req.params;
  const { codigo } = req.query;

  if (!codigo) {
    return res.status(400).json({ valido: false, message: "Falta el código de verificación" });
  }

  try {
    const resultados = await query(COLECCION_EMITIDAS, { folio });
    const constancia = resultados[0];

    if (!constancia) {
      return res.status(404).json({ valido: false, message: "Folio no encontrado" });
    }

    const esValido = constancia.codigoVerificacionHash === hashCodigoVerificacion(codigo);

    if (!esValido) {
      return res.status(200).json({ valido: false, message: "Código de verificación incorrecto" });
    }

    res.status(200).json({
      valido: true,
      folio: constancia.folio,
      tipoDocumento: constancia.nombreTipoDocumento,
      empleadoNombre: constancia.empleadoNombre,
      fechaExpedicion: constancia.fechaExpedicion,
    });
  } catch (error) {
    res.status(500).json({ message: "Error verificando folio", error: error.message });
  }
};

constanciasController.expedirDocumento = expedirDocumento;
constanciasController.TIPOS_DOCUMENTO = TIPOS_DOCUMENTO;

module.exports = constanciasController;
