const AvisoSistema = require("../models/avisoSistema.model");

// Caché en memoria de los avisos activos. El backend corre en un solo proceso
// (pm2 fork), así que basta con recargarla en cada cambio y cada minuto.
let cache = [];
let cargado = false;

async function recargar() {
  cache = await AvisoSistema.find({ activo: true }).sort({ createdAt: -1 }).lean();
  cargado = true;
  return cache;
}

async function asegurarCarga() {
  if (!cargado) await recargar();
}

setInterval(() => {
  recargar().catch((err) => console.error("Error recargando avisos de sistema:", err.message));
}, 60 * 1000).unref();

function vigente(aviso, ahora = new Date()) {
  return !aviso.fin || new Date(aviso.fin) > ahora;
}

// Formato que recibe el front (REST y Socket.IO).
function serializar(aviso) {
  return {
    id: String(aviso._id),
    tipo: aviso.tipo,
    nivel: aviso.nivel,
    titulo: aviso.titulo,
    mensaje: aviso.mensaje,
    version: aviso.version || null,
    inicio: aviso.inicio,
    fin: aviso.fin,
    bloquear: !!aviso.bloquear,
    creadoEn: aviso.createdAt,
  };
}

// Estado público: mantenimiento (el más reciente) + demás avisos vigentes.
async function estadoActual() {
  await asegurarCarga();
  const ahora = new Date();
  const activos = cache.filter((a) => vigente(a, ahora));
  const mant = activos.find((a) => a.tipo === "mantenimiento");

  return {
    servidorHora: ahora,
    mantenimiento: mant
      ? { ...serializar(mant), enCurso: new Date(mant.inicio) <= ahora }
      : null,
    avisos: activos.filter((a) => a.tipo !== "mantenimiento").map(serializar),
  };
}

// Mantenimiento que debe bloquear la API en este momento (o null).
function bloqueoActivo() {
  const ahora = new Date();
  return (
    cache.find(
      (a) => a.tipo === "mantenimiento" && a.bloquear && new Date(a.inicio) <= ahora && vigente(a, ahora)
    ) || null
  );
}

module.exports = { recargar, asegurarCarga, estadoActual, bloqueoActivo, serializar };
