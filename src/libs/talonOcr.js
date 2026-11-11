// Lectura de una hoja escaneada del talón de pago (formato del Gobierno del
// Estado de Oaxaca).
//
// Datos que lee: copia (PAGADOR o EMPLEADO), No. único de empleado, fecha de
// pago, periodo DESDE/HASTA, NETO y si hay tinta de firma.
//
// Un talón puede tener hasta 4 hojas. Las hojas intermedias traen NETO .00;
// la hoja que trae el NETO real es la última.
//
// Cómo ubica los datos:
// - El escáner de hoja (Brother DS-640) entrega una página casi en blanco con
//   el talón arriba. Primero se recorta al contenido.
// - Se buscan dos etiquetas impresas fijas, FOLIO y HASTA. Con ellas se calcula
//   cuánto se movió, giró o cambió de escala la hoja respecto a la PLANTILLA.
// - Después se lee cada recuadro por separado.
// La PLANTILLA está medida a 300 dpi sobre un talón real.
const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.resolve(__dirname, "../..");   // ahí está spa.traineddata

// Coordenadas en la plantilla (300 dpi). Cajas: [x0, y0, x1, y1].
const PLANTILLA = {
  ancla: { FOLIO: [124, 130], HASTA: [1289, 222] },
  cajas: {
    NUMEMP: [285, 150, 500, 215],
    NOMBRE: [1440, 148, 2560, 215],
    FECHA_PAGO: [485, 150, 815, 212],
    DESDE: [660, 295, 1000, 360],
    HASTA: [1080, 295, 1420, 360],
    NETO: [2190, 870, 2560, 950],
    COPIA: [340, 1030, 660, 1105],
    FIRMA: [1930, 930, 2400, 1125],
  },
};

// Tres lectores de OCR: los recuadros de una hoja se leen en paralelo.
const lectores = [];
function worker(i = 0) {
  if (!lectores[i]) {
    lectores[i] = Tesseract.createWorker("spa", 1, { langPath: RAIZ, cachePath: RAIZ, gzip: false })
      .catch((e) => { lectores[i] = null; throw e; });
  }
  return lectores[i];
}

// Una hoja a la vez (los lectores se reparten sus recuadros).
let cola = Promise.resolve();
function enCola(fn) {
  const r = cola.then(fn, fn);
  cola = r.catch(() => {});
  return r;
}

const normalizar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Alto del contenido: filas con suficientes píxeles no blancos.
async function recortarContenido(buffer) {
  const meta = await sharp(buffer).metadata();
  const ancho = 600;
  const { data, info } = await sharp(buffer).rotate().grayscale().resize({ width: ancho }).raw().toBuffer({ resolveWithObject: true });
  const esc = meta.width / info.width;
  const filaOcupada = (y) => {
    let n = 0;
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 200) n++;
    return n / info.width >= 0.02;
  };
  let y1 = info.height - 1;
  while (y1 > 0 && !filaOcupada(y1)) y1--;
  let y0 = 0;
  while (y0 < y1 && !filaOcupada(y0)) y0++;
  const top = Math.max(0, Math.floor(y0 * esc) - 10);
  const alto = Math.min(meta.height - top, Math.ceil((y1 - y0 + 1) * esc) + 20);
  const recorte = await sharp(buffer).rotate().extract({ left: 0, top, width: meta.width, height: alto }).toBuffer();
  return { recorte, ancho: meta.width, alto };
}

// Ubica las etiquetas FOLIO y HASTA y regresa la función que pasa
// coordenadas de la plantilla a la imagen.
function transformacion(palabras) {
  const buscar = (re) => palabras.find((p) => re.test(normalizar(p.text)));
  const folio = buscar(/^FOLIO/);
  const hasta = buscar(/^HASTA/);
  if (!folio || !hasta) return null;
  const [ax, ay] = PLANTILLA.ancla.FOLIO;
  const [bx, by] = PLANTILLA.ancla.HASTA;
  const a2 = [folio.bbox.x0, folio.bbox.y0];
  const b2 = [hasta.bbox.x0, hasta.bbox.y0];
  const vt = [bx - ax, by - ay];
  const vi = [b2[0] - a2[0], b2[1] - a2[1]];
  const s = Math.hypot(...vi) / Math.hypot(...vt);
  // Escala fuera de 120-450 dpi: las etiquetas no son las del talón.
  if (s < 0.4 || s > 1.5) return null;
  const ang = Math.atan2(vi[1], vi[0]) - Math.atan2(vt[1], vt[0]);
  const cos = Math.cos(ang) * s;
  const sin = Math.sin(ang) * s;
  const punto = (x, y) => [a2[0] + cos * (x - ax) - sin * (y - ay), a2[1] + sin * (x - ax) + cos * (y - ay)];
  return { punto, angulo: (ang * 180) / Math.PI, escala: s };
}

// Caja de la plantilla → región en la imagen (con margen por el giro).
function region(t, caja, ancho, alto) {
  const [x0, y0, x1, y1] = caja;
  const esquinas = [t.punto(x0, y0), t.punto(x1, y0), t.punto(x0, y1), t.punto(x1, y1)];
  const xs = esquinas.map((p) => p[0]);
  const ys = esquinas.map((p) => p[1]);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(ancho, Math.ceil(Math.max(...xs)));
  const bottom = Math.min(alto, Math.ceil(Math.max(...ys)));
  if (right - left < 10 || bottom - top < 10) return null;
  return { left, top, width: right - left, height: bottom - top };
}

// Pone en blanco lo impreso en verde (fondo, líneas y barras del formato)
// para que el OCR solo vea el texto de la impresora.
async function quitarVerde(img, reg) {
  const { data, info } = await sharp(img).extract(reg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const gris = Buffer.alloc(info.width * info.height);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    gris[j] = g > r + 20 && g > b + 10 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return sharp(gris, { raw: { width: info.width, height: info.height, channels: 1 } });
}

// Lee un recuadro de dos formas: tal cual en gris (mejor para números) y sin
// el verde del formato (mejor cuando el texto toca líneas o barras). Se usa
// la primera lectura que pase la validación del campo.
async function leerCaja(img, reg, whitelist, valido = () => true, primeroSinVerde = false, lector = 0) {
  if (!reg) return "";
  const w = await worker(lector);
  await w.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: whitelist });
  const formas = [
    () => sharp(img).extract(reg).grayscale(),
    () => quitarVerde(img, reg),
  ];
  if (primeroSinVerde) formas.reverse();
  let primera = null;
  for (const forma of formas) {
    const buf = await (await forma())
      .normalize()
      .resize({ height: Math.max(reg.height, 80) })
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();
    const texto = ((await w.recognize(buf)).data.text || "").trim();
    if (primera === null) primera = texto;
    if (valido(texto)) return texto;
  }
  return primera;
}

// Impresión de matriz de puntos tenue: la tinta es translúcida y sobre el
// fondo verde se ve verdosa, solo más oscura. Se toma como tinta el `corte`%
// más oscuro del recuadro (sin las barras de verde intenso) y se engruesa cada
// punto `radio` píxeles para que los números queden continuos.
async function oscurecer(img, reg, corte, radio) {
  const { data, info } = await sharp(img).extract(reg).resize({ height: reg.height * 2 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const lum = new Float32Array(W * H);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    lum[j] = g - r > 70 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const umbral = Float32Array.from(lum).sort()[Math.floor((corte / 100) * lum.length)];
  const out = Buffer.alloc(W * H, 255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (lum[y * W + x] > umbral) continue;
      for (let dy = -radio; dy <= radio; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -radio; dx <= radio; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < W) out[yy * W + xx] = 0;
        }
      }
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 1 } });
}

// Formas de preparar un recuadro antes del OCR, de la más útil a la menos.
const FORMAS = [
  (img, reg) => sharp(img).extract(reg).grayscale().normalize().resize({ height: Math.max(reg.height, 80) }),
  (img, reg) => oscurecer(img, reg, 13, 2),
  async (img, reg) => sharp(await sharp(img).extract(reg).grayscale().resize({ height: Math.max(reg.height, 80) * 2 })
    .blur(3.2).normalize().png().toBuffer()),
  (img, reg) => oscurecer(img, reg, 9, 2),
  async (img, reg) => (await quitarVerde(img, reg)).normalize().resize({ height: Math.max(reg.height, 80) }),
  (img, reg) => oscurecer(img, reg, 13, 1),
];

// Lee un recuadro con varias formas y vota. `valor(texto)` regresa el dato
// normalizado o null si no es válido. Se detiene cuando dos lecturas coinciden.
async function leerVotado(img, reg, whitelist, valor, { lector = 0, minimo = 1 } = {}) {
  if (!reg) return { valor: null, votos: {} };
  const w = await worker(lector);
  await w.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: whitelist });
  const conteo = {};
  for (const forma of FORMAS) {
    const buf = await (await forma(img, reg)).withMetadata({ density: 300 }).png().toBuffer();
    const v = valor(((await w.recognize(buf)).data.text || "").trim());
    if (v === null || v === undefined) continue;
    conteo[v] = (conteo[v] || 0) + 1;
    if (conteo[v] >= 2) break;
  }
  const ganador = masVotado(conteo);
  // minimo = cuántas lecturas deben coincidir para darlo por leído.
  return { valor: ganador && conteo[ganador] >= minimo ? ganador : null, votos: conteo };
}

// Cuenta votos: { valor: veces }.
const masVotado = (conteo) => Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

const leerFecha = (texto) => {
  const m = String(texto).replace(/\s/g, "").match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const [, d, mes, a] = m;
  if (+d < 1 || +d > 31 || +mes < 1 || +mes > 12 || +a < 2015 || +a > 2040) return null;
  return `${a}-${mes}-${d}`;
};

const leerImporte = (texto) => {
  const limpio = String(texto).replace(/[^\d.,]/g, "");
  // ".00" de las hojas intermedias: solo ceros.
  if (/\d/.test(limpio) && !/[1-9]/.test(limpio)) return 0;
  const m = limpio.match(/(\d[\d,]*)?\.(\d{2})/);
  if (!m) return null;
  return Number(`${(m[1] || "0").replace(/,/g, "")}.${m[2]}`);
};

// Tinta de la firma sin contar lo impreso en verde ("FIRMA DE RECIBIDO").
async function medirFirma(img, reg) {
  if (!reg) return { porcentaje: 0, azul: 0 };
  const { data, info } = await sharp(img).extract(reg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let tinta = 0;
  let azul = 0;
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const verde = g > r + 25 && g > b + 15;
    if (verde) continue;
    const oscuro = (r + g + b) / 3 < 140;
    const esAzul = b > r + 35 && b > g + 10 && b < 230;
    if (oscuro || esAzul) tinta++;
    if (esAzul) azul++;
  }
  return { porcentaje: (tinta / total) * 100, azul: tinta ? (azul / tinta) * 100 : 0 };
}

// Caché corto: la misma hoja se lee al revisarla (analizar-hoja) y al entregar.
const CACHE_MAX = 40;
const CACHE_MS = 15 * 60 * 1000;
const cache = new Map();

// Analiza una hoja (data URI o Buffer). La resolución se mide con las etiquetas.
async function analizarHojaTalon(imagen) {
  const buffer = Buffer.isBuffer(imagen)
    ? imagen
    : Buffer.from(String(imagen).replace(/^data:[^,]*,/, ""), "base64");
  const clave = crypto.createHash("sha1").update(buffer).digest("hex");
  const previo = cache.get(clave);
  if (previo && Date.now() - previo.t < CACHE_MS) return previo.r;
  const r = await analizarSinCache(buffer);
  cache.set(clave, { t: Date.now(), r });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return r;
}

async function analizarSinCache(buffer) {
  return enCola(async () => {
    const { recorte, ancho, alto } = await recortarContenido(buffer);
    const w = await worker();
    await w.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
    // Solo la franja de arriba: ahí están FOLIO, HASTA, el nombre y las fechas.
    // Leer el talón completo tardaba más del doble.
    const franja = Math.min(alto, Math.round(ancho * 0.2));
    const gris = await sharp(recorte).extract({ left: 0, top: 0, width: ancho, height: franja }).grayscale().normalize().toBuffer();
    const res = await w.recognize(gris, {}, { blocks: true, text: true });
    const palabras = [];
    for (const b of res.data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) palabras.push(...l.words);

    const t = transformacion(palabras);
    if (!t) {
      return { reconocido: false, motivo: "No se reconoció el formato del talón (no se encontraron FOLIO y HASTA)." };
    }
    const reg = (n) => region(t, PLANTILLA.cajas[n], ancho, alto);
    const DIGITOS = "0123456789";
    const FECHA = "0123456789-";
    const IMPORTE = "0123456789.,$";

    const esCopia = (x) => /PAGAD|AGADOR|EMPLE|MPLEAD/.test(normalizar(x));
    const comoNumemp = (x) => {
      const n = x.replace(/\s/g, "");
      return /^\d{4,7}$/.test(n) ? n : null;
    };
    const comoImporte = (x) => {
      const n = leerImporte(x);
      return n === null ? null : n.toFixed(2);
    };
    // Nombre impreso (para confirmar al empleado): se lee aparte, oscurecido.
    const leerNombre = async (lector) => {
      const regNombre = reg("NOMBRE");
      if (!regNombre) return "";
      const wn = await worker(lector);
      await wn.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ " });
      let texto = "";
      for (const forma of [FORMAS[1], FORMAS[0]]) {
        const buf = await (await forma(recorte, regNombre)).withMetadata({ density: 300 }).png().toBuffer();
        texto += " " + ((await wn.recognize(buf)).data.text || "");
      }
      return texto;
    };
    // Cada lector lee sus recuadros en orden; los tres trabajan a la vez.
    // Las fechas solo cuentan si dos lecturas coinciden (mejor "no leída" que equivocada).
    const fecha = { minimo: 2 };
    const [[numempL, nombreTexto, copiaCruda], [fechaPagoL, netoL], [desdeL, hastaL]] = await Promise.all([
      (async () => [
        await leerVotado(recorte, reg("NUMEMP"), DIGITOS, comoNumemp, { lector: 0 }),
        await leerNombre(0),
        await leerCaja(recorte, reg("COPIA"), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", esCopia, true, 0),
      ])(),
      (async () => [
        await leerVotado(recorte, reg("FECHA_PAGO"), FECHA, leerFecha, { ...fecha, lector: 1 }),
        await leerVotado(recorte, reg("NETO"), IMPORTE, comoImporte, { lector: 1 }),
      ])(),
      (async () => [
        await leerVotado(recorte, reg("DESDE"), FECHA, leerFecha, { ...fecha, lector: 2 }),
        await leerVotado(recorte, reg("HASTA"), FECHA, leerFecha, { ...fecha, lector: 2 }),
      ])(),
    ]);
    const copiaTexto = normalizar(copiaCruda);
    const firma = await medirFirma(recorte, reg("FIRMA"));

    // Respaldo con el texto de la franja cuando un recuadro sale vacío.
    const textoCompleto = normalizar(`${res.data.text} ${nombreTexto}`);
    const numempVotos = numempL.votos;
    const numemp = numempL.valor;
    const neto = netoL.valor === null ? null : Number(netoL.valor);

    let copia = null;
    if (/PAGAD|AGADOR/.test(copiaTexto)) copia = "PAGADOR";
    else if (/EMPLE|MPLEAD/.test(copiaTexto)) copia = "EMPLEADO";

    return {
      reconocido: true,
      copia,
      numemp,
      // Todas las lecturas del número con sus votos (para cruzar entre hojas).
      numempVotos,
      // Texto completo de la hoja (para comparar el nombre impreso). Uso interno.
      texto: textoCompleto,
      fechaPago: fechaPagoL.valor,
      desde: desdeL.valor,
      hasta: hastaL.valor,
      neto,
      // Hoja final del talón: la que trae el NETO real (las demás traen .00).
      esUltimaHoja: neto !== null && neto > 0,
      firma: {
        detectada: firma.porcentaje > 0.8,
        porcentajeTinta: Number(firma.porcentaje.toFixed(2)),
        porcentajeAzul: Number(firma.azul.toFixed(1)),
      },
      giroGrados: Number(t.angulo.toFixed(2)),
      leido: { numemp: numempL.votos, fechaPago: fechaPagoL.votos, desde: desdeL.votos, hasta: hastaL.votos, neto: netoL.votos, copiaTexto, nombreTexto: normalizar(nombreTexto).trim() },
    };
  });
}

// ¿El nombre del empleado aparece en el texto de la hoja? Cada palabra del
// nombre (apellidos y nombres) se busca permitiendo un error de OCR por
// palabra. Regresa la fracción de palabras encontradas (0 a 1).
function coincidenciaNombre(texto, emp = {}) {
  const palabrasTexto = new Set(normalizar(texto).replace(/[^A-Z\s]/g, " ").split(/\s+/).filter((p) => p.length >= 2));
  const palabrasNombre = normalizar([emp.APE_PAT, emp.APE_MAT, emp.NOMBRES].filter(Boolean).join(" "))
    .replace(/[^A-Z\s]/g, " ").split(/\s+/).filter((p) => p.length >= 2);
  if (palabrasNombre.length === 0) return 0;
  const distancia = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  };
  const encontradas = palabrasNombre.filter((p) =>
    palabrasTexto.has(p) || [...palabrasTexto].some((t) => p.length >= 4 && distancia(p, t) <= 1));
  return encontradas.length / palabrasNombre.length;
}

module.exports = { analizarHojaTalon, recortarContenido, coincidenciaNombre, PLANTILLA };
