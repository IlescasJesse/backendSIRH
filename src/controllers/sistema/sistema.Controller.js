const mongoose = require("mongoose");
const AvisoSistema = require("../../models/avisoSistema.model");
const { recargar, estadoActual, serializar } = require("../../utils/avisosSistema");

const TIPOS = ["version", "info", "alerta"];
const NIVELES = ["info", "warning", "critical"];
let timerInicio = null;

function texto(valor, max) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

// Acepta fecha ISO o minutos desde ahora (ej. { finEnMinutos: 30 }).
function fecha(valor, minutos) {
  if (minutos !== undefined && minutos !== null && minutos !== "") {
    const n = Number(minutos);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return new Date(Date.now() + n * 60 * 1000);
  }
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function emitirEstado(req, evento, payload) {
  const io = req.app.get("io");
  const estado = await estadoActual();
  if (io) {
    io.emit(evento, payload);
    io.emit("sistema:estado", estado);
  }
  return estado;
}

// GET /api/sistema/estado (público) — el front lo consulta al cargar y al reconectar.
exports.getEstado = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await estadoActual());
  } catch (err) {
    console.error("Error obteniendo estado del sistema:", err);
    res.status(500).json({ message: "Error obteniendo estado del sistema" });
  }
};

// GET /api/sistema/avisos?todos=1 (monitor) — historial reciente.
exports.listarAvisos = async (req, res) => {
  try {
    const filtro = req.query.todos ? {} : { activo: true };
    const avisos = await AvisoSistema.find(filtro).sort({ createdAt: -1 }).limit(50).lean();
    res.json(avisos.map((a) => ({ ...serializar(a), activo: a.activo, retiradoEn: a.retiradoEn })));
  } catch (err) {
    res.status(500).json({ message: "Error listando avisos" });
  }
};

// POST /api/sistema/avisos (monitor) — nueva versión, info o alerta.
exports.crearAviso = async (req, res) => {
  try {
    const tipo = req.body.tipo || "info";
    const nivel = req.body.nivel || (tipo === "alerta" ? "warning" : "info");
    const titulo = texto(req.body.titulo, 120);
    const mensaje = texto(req.body.mensaje, 2000);
    const fin = fecha(req.body.fin, req.body.finEnMinutos);

    if (!TIPOS.includes(tipo)) return res.status(400).json({ message: `tipo debe ser: ${TIPOS.join(", ")}` });
    if (!NIVELES.includes(nivel)) return res.status(400).json({ message: `nivel debe ser: ${NIVELES.join(", ")}` });
    if (!titulo || !mensaje) return res.status(400).json({ message: "titulo y mensaje son obligatorios" });
    if (fin === undefined) return res.status(400).json({ message: "fin inválido" });

    const aviso = await AvisoSistema.create({
      tipo,
      nivel,
      titulo,
      mensaje,
      version: tipo === "version" ? texto(req.body.version, 30) || null : null,
      fin,
      creadoPor: texto(req.body.creadoPor, 60) || "monitor",
    });

    await recargar();
    await emitirEstado(req, "sistema:aviso", serializar(aviso.toObject()));
    res.status(201).json(serializar(aviso.toObject()));
  } catch (err) {
    console.error("Error creando aviso de sistema:", err);
    res.status(500).json({ message: "Error creando aviso" });
  }
};

// DELETE /api/sistema/avisos/:id (monitor) — retira un aviso de las pantallas.
exports.retirarAviso = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "id inválido" });

    const aviso = await AvisoSistema.findOneAndUpdate(
      { _id: req.params.id, activo: true },
      { activo: false, retiradoEn: new Date() },
      { new: true }
    ).lean();
    if (!aviso) return res.status(404).json({ message: "Aviso no encontrado o ya retirado" });

    await recargar();
    await emitirEstado(req, "sistema:aviso-retirado", { id: String(aviso._id) });
    res.json({ ok: true, id: String(aviso._id) });
  } catch (err) {
    res.status(500).json({ message: "Error retirando aviso" });
  }
};

// POST /api/sistema/mantenimiento (monitor) — anuncia o inicia mantenimiento.
// Body: { titulo?, mensaje?, inicio? | inicioEnMinutos?, fin? | finEnMinutos?, bloquear? }
// Reemplaza cualquier mantenimiento anterior.
exports.iniciarMantenimiento = async (req, res) => {
  try {
    const inicio = fecha(req.body.inicio, req.body.inicioEnMinutos) || new Date();
    const fin = fecha(req.body.fin, req.body.finEnMinutos);

    if (inicio === undefined || fin === undefined) return res.status(400).json({ message: "inicio o fin inválido" });
    if (fin && fin <= inicio) return res.status(400).json({ message: "fin debe ser posterior a inicio" });

    await AvisoSistema.updateMany(
      { tipo: "mantenimiento", activo: true },
      { activo: false, retiradoEn: new Date() }
    );

    const aviso = await AvisoSistema.create({
      tipo: "mantenimiento",
      nivel: "critical",
      titulo: texto(req.body.titulo, 120) || "Servidor en mantenimiento",
      mensaje:
        texto(req.body.mensaje, 2000) ||
        "SIRH estará fuera de servicio por mantenimiento. Guarda tu trabajo; el sistema volverá en breve.",
      inicio,
      fin,
      bloquear: req.body.bloquear !== false,
      creadoPor: texto(req.body.creadoPor, 60) || "monitor",
    });

    await recargar();
    const { mantenimiento } = await estadoActual();
    await emitirEstado(req, "sistema:mantenimiento", mantenimiento);

    // Mantenimiento programado: vuelve a avisar en el momento en que empieza el bloqueo.
    clearTimeout(timerInicio);
    const espera = inicio - Date.now();
    if (espera > 0 && espera < 24 * 60 * 60 * 1000) {
      timerInicio = setTimeout(async () => {
        try {
          const actual = (await estadoActual()).mantenimiento;
          if (actual && actual.id === String(aviso._id)) {
            await emitirEstado(req, "sistema:mantenimiento", actual);
          }
        } catch (err) {
          console.error("Error avisando inicio de mantenimiento:", err.message);
        }
      }, espera);
      timerInicio.unref();
    }

    res.status(201).json(mantenimiento);
  } catch (err) {
    console.error("Error iniciando mantenimiento:", err);
    res.status(500).json({ message: "Error iniciando mantenimiento" });
  }
};

// DELETE /api/sistema/mantenimiento (monitor) — termina el mantenimiento.
exports.terminarMantenimiento = async (req, res) => {
  try {
    const r = await AvisoSistema.updateMany(
      { tipo: "mantenimiento", activo: true },
      { activo: false, retiradoEn: new Date() }
    );

    clearTimeout(timerInicio);
    await recargar();
    await emitirEstado(req, "sistema:mantenimiento", null);
    res.json({ ok: true, retirados: r.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: "Error terminando mantenimiento" });
  }
};
