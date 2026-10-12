// Generación de los PDF del Portal de Documentos Digitales a partir de las
// plantillas oficiales (CÉDULA CME2 y CONSTANCIA CME2).
//
// Los PDF originales traen el texto como imágenes, así que no se pueden
// editar: se reconstruyen con los mismos gráficos (encabezado, franja lateral,
// pie de la cédula) extraídos a PNG y el texto fijo en Montserrat, en las
// mismas coordenadas (assets/portal/plantillas/layout_*.json). Solo los
// datos del empleado se dibujan aparte, en las funciones de abajo.
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, degrees } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const ASSETS = path.join(__dirname, "../assets");
const PLANTILLAS = path.join(ASSETS, "portal/plantillas");
const PAGE_H = 792;
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.4, 0.4, 0.4);

const leer = (ruta) => fs.readFileSync(ruta);
const layoutCompleto = (nombre) => JSON.parse(leer(path.join(PLANTILLAS, nombre)).toString("utf8"));

// Bloques de firma: en los originales están escritos a mano con Paola Porras
// (titular) y Laura Martínez (suplente). Aquí se quitan del layout fijo y se
// dibujan con los firmantes configurados (ver utils/portalFirmantes.js):
//  - titular: cargo y nombre, siempre.
//  - suplente: leyenda "Por ausencia y con fundamento en el artículo 128…" y
//    su nombre, solo cuando el titular está ausente.
const esBloqueFirma = (xMinLeyenda, yMinLeyenda, yMaxLeyenda) => (l) =>
  (l.x >= xMinLeyenda && l.y >= yMinLeyenda && l.y <= yMaxLeyenda) || // leyenda de suplencia
  /PAOLA PORRAS|Laura Concepción/.test(l.t) || // nombres
  (l.b && l.t === "DIRECTORA ADMINISTRATIVA"); // cargo del titular

const lineasCedula = layoutCompleto("layout_cedula.json");
const lineasConstancia = layoutCompleto("layout_constancia.json");
const esFirmaCedula = esBloqueFirma(311, 570, 650);
const esFirmaConstancia = esBloqueFirma(318, 549, 630);
const layoutCedula = lineasCedula.filter((l) => !esFirmaCedula(l));
const layoutConstancia = lineasConstancia.filter((l) => !esFirmaConstancia(l));

const buscar = (lineas, patron, extra = () => true) => lineas.find((l) => patron.test(l.t) && extra(l));
const POS_CEDULA = {
  titularNombre: buscar(lineasCedula, /PAOLA PORRAS/),
  titularCargo: buscar(lineasCedula, /^DIRECTORA ADMINISTRATIVA$/),
  leyenda: Math.min(...lineasCedula.filter((l) => l.x >= 311 && l.y >= 570 && l.y <= 650).map((l) => l.y)),
  suplenteNombre: buscar(lineasCedula, /Laura Concepción/),
};
const POS_CONSTANCIA = {
  titularNombre: buscar(lineasConstancia, /PAOLA PORRAS/),
  titularCargo: buscar(lineasConstancia, /^DIRECTORA ADMINISTRATIVA$/, (l) => l.x < 100),
  leyenda: Math.min(...lineasConstancia.filter((l) => l.x >= 318 && l.y >= 549 && l.y <= 630).map((l) => l.y)),
  suplenteNombre: buscar(lineasConstancia, /Laura Concepción/),
};

// Leyenda de suplencia; el cargo va como lo capturó RH ("Jefa del Departamento…").
const textoSuplencia = (suplente) =>
  `Por ausencia y con fundamento en el artículo 128 del Reglamento Interno de la Secretaría de Finanzas del Poder Ejecutivo del Estado vigente; suscribe ${suplente.genero === "M" ? "el" : "la"} ${suplente.cargo}.`;

// Largo (pt) que ocupa cada línea de la leyenda vertical de la constancia.
const LARGO_LEYENDA = [498, 413.5];

async function nuevoDocumento() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const regular = await pdfDoc.embedFont(leer(path.join(ASSETS, "fonts/Montserrat-Medium.ttf")), { subset: true });
  const bold = await pdfDoc.embedFont(leer(path.join(ASSETS, "fonts/Montserrat-SemiBold.woff")), { subset: true });
  const page = pdfDoc.addPage([612, PAGE_H]);

  // Coordenadas de las plantillas originales (origen arriba-izquierda).
  const encabezado = await pdfDoc.embedPng(leer(path.join(PLANTILLAS, "encabezado.png")));
  page.drawImage(encabezado, { x: 63, y: PAGE_H - 92, width: 419, height: 87 });
  const franja = await pdfDoc.embedPng(leer(path.join(PLANTILLAS, "franja.png")));
  page.drawImage(franja, { x: 506, y: PAGE_H - 787, width: 105, height: 787 });

  return { pdfDoc, page, regular, bold, embedPng: (nombre) => pdfDoc.embedPng(leer(path.join(PLANTILLAS, nombre))) };
}

// separarEtiquetas: en la cédula, los valores fijos (p. ej. "SECRETARÍA DE
// FINANZAS") no deben pegarse a su etiqueta en negritas.
function dibujarTextoFijo(page, layout, { regular, bold }, { separarEtiquetas = false } = {}) {
  let vertical = 0;
  for (const linea of layout) {
    const font = linea.b ? bold : regular;
    if (separarEtiquetas && !linea.b) {
      const etiqueta = layout.find((l) => l.b && Math.abs(l.y - linea.y) < 0.5 && l.x < linea.x);
      if (etiqueta) {
        linea.x = Math.max(linea.x, etiqueta.x + bold.widthOfTextAtSize(etiqueta.t, etiqueta.sz) + 3);
      }
    }
    if (linea.dir && linea.dir[1] === -1) {
      // Leyenda vertical de la constancia: lee de abajo hacia arriba y se
      // ajusta el tamaño para que ocupe el mismo largo que en el original.
      const size = (linea.sz * LARGO_LEYENDA[vertical++]) / font.widthOfTextAtSize(linea.t, linea.sz);
      page.drawText(linea.t, {
        x: linea.x1 - 0.247 * size,
        y: PAGE_H - linea.y,
        size,
        font,
        color: NEGRO,
        rotate: degrees(90),
      });
    } else {
      page.drawText(linea.t, { x: linea.x, y: PAGE_H - linea.y, size: linea.sz, font, color: NEGRO });
    }
  }
}

// Texto de un campo de la cédula: se parte en líneas si no cabe hasta el
// margen derecho (antes de la franja lateral) y se reduce la letra si aún así
// son demasiadas.
function dibujarCampo(page, texto, { x, y, font, size = 9, maxX = 498, maxLineas = 2, interlineado = 11 }) {
  if (!texto) return;
  const ancho = maxX - x;
  let tam = size;
  let lineas = partirLineas(texto, font, tam, ancho);
  while (lineas.length > maxLineas && tam > 6) {
    tam -= 0.5;
    lineas = partirLineas(texto, font, tam, ancho);
  }
  lineas.forEach((linea, i) => {
    page.drawText(linea, { x, y: PAGE_H - y - i * interlineado, size: tam, font, color: NEGRO });
  });
}

function partirLineas(texto, font, size, ancho) {
  const lineas = [];
  let actual = "";
  for (const palabra of String(texto).split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && font.widthOfTextAtSize(prueba, size) > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Párrafo justificado con tramos en negritas. `segmentos` = [{ t, b }]; los
// tramos pegados (sin espacio entre ellos) forman una sola palabra.
// Devuelve la línea base (arriba-izquierda) de la última línea dibujada.
function dibujarParrafo(page, segmentos, { x, y, ancho, size = 9, interlineado = 13.9, regular, bold }) {
  const palabras = [];
  let actual = [];
  for (const seg of segmentos) {
    const partes = seg.t.split(/(\s+)/);
    for (const parte of partes) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) {
        if (actual.length) palabras.push(actual);
        actual = [];
      } else {
        actual.push({ t: parte, font: seg.b ? bold : regular });
      }
    }
  }
  if (actual.length) palabras.push(actual);

  const anchoPalabra = (p) => p.reduce((s, parte) => s + parte.font.widthOfTextAtSize(parte.t, size), 0);
  const espacio = regular.widthOfTextAtSize(" ", size);

  const lineas = [];
  let linea = [];
  let usado = 0;
  for (const palabra of palabras) {
    const w = anchoPalabra(palabra);
    const necesario = linea.length ? usado + espacio + w : w;
    if (linea.length && necesario > ancho) {
      lineas.push({ palabras: linea, usado });
      linea = [palabra];
      usado = w;
    } else {
      linea.push(palabra);
      usado = necesario;
    }
  }
  if (linea.length) lineas.push({ palabras: linea, usado });

  lineas.forEach(({ palabras: ps, usado: u }, i) => {
    const esUltima = i === lineas.length - 1;
    const gaps = ps.length - 1;
    const sep = !esUltima && gaps > 0 ? espacio + (ancho - u) / gaps : espacio;
    let cursor = x;
    for (const p of ps) {
      for (const parte of p) {
        page.drawText(parte.t, { x: cursor, y: PAGE_H - (y + i * interlineado), size, font: parte.font, color: NEGRO });
        cursor += parte.font.widthOfTextAtSize(parte.t, size);
      }
      cursor += sep;
    }
  });

  return y + (lineas.length - 1) * interlineado;
}

function dibujarTextoCentrado(page, texto, { font, size, centroX, y }) {
  page.drawText(texto, {
    x: centroX - font.widthOfTextAtSize(texto, size) / 2,
    y: PAGE_H - y,
    size,
    font,
    color: NEGRO,
  });
}

// Leyenda de suplencia + nombre de quien suscribe (bloque derecho de ambos formatos).
function dibujarSuplente(page, suplente, { x, ancho, pos, regular, bold }) {
  dibujarParrafo(page, [{ t: textoSuplencia(suplente) }], {
    x, y: pos.leyenda, ancho, size: 10, interlineado: 15.45, regular, bold,
  });
  page.drawText(suplente.nombre, { x, y: PAGE_H - pos.suplenteNombre.y, size: 10, font: bold, color: NEGRO });
}

// Firma digitalizada de quien suscribe, centrada sobre su nombre. La imagen
// se escala a una caja máxima sin deformarse; el PNG con fondo transparente es
// lo ideal. `nombreY` es la línea base del nombre (coordenada del layout).
async function dibujarFirmaImagen(pdfDoc, page, firma, { centroX, nombreY, maxW = 130, maxH = 42 }) {
  if (!firma) return;
  const imagen = firma.tipo === "png" ? await pdfDoc.embedPng(firma.bytes) : await pdfDoc.embedJpg(firma.bytes);
  const { width, height } = imagen.scaleToFit(maxW, maxH);
  page.drawImage(imagen, { x: centroX - width / 2, y: PAGE_H - nombreY + 8, width, height });
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function partesFecha(fecha = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(fecha);
  const get = (tipo) => Number(f.find((p) => p.type === tipo).value);
  return { dia: get("day"), mes: MESES[get("month") - 1], anio: get("year") };
}

// Sustantivos de adscripción masculinos ("al DEPARTAMENTO"); el resto de las
// unidades (dirección, coordinación, subsecretaría, unidad, oficina,
// tesorería...) son femeninos ("a la DIRECCIÓN").
const PRIMERA_PALABRA_MASCULINA = new Set(["DEPARTAMENTO", "CENTRO", "INSTITUTO", "ÓRGANO", "ORGANO", "SERVICIO", "AREA", "ÁREA", "SECTOR", "DESPACHO", "MODULO", "MÓDULO", "ARCHIVO"]);

function adscritoA(adscripcion, esMujer) {
  const nombre = (adscripcion || "").trim();
  if (!nombre) return "";
  const masculino = PRIMERA_PALABRA_MASCULINA.has(nombre.split(/\s+/)[0].toUpperCase());
  const prefijo = esMujer ? "adscrita" : "adscrito";
  return `${prefijo} ${masculino ? "al" : "a la"} ${nombre}`;
}

function pieFolio(page, folio, font, x, y) {
  page.drawText(`Folio de verificación: ${folio}`, { x, y: PAGE_H - y, size: 7, font, color: GRIS });
}

// firmantes: { titular: {nombre, cargo}, suplente: {nombre, cargo, genero} | null }
// datos: { nombre, puesto, jerarquia: {subsecretaria, organoAuxiliar,
//          organoDesconcentrado, direccion, unidad, departamento, area} }
async function generarPdfCedula({ datos, folio, firmantes, firmaImagen = null, fecha = new Date() }) {
  const { pdfDoc, page, regular, bold, embedPng } = await nuevoDocumento();
  const pie = await embedPng("pie_cedula.png");
  page.drawImage(pie, { x: 0, y: PAGE_H - 789, width: 452, height: 69 });

  dibujarTextoFijo(page, layoutCedula, { regular, bold }, { separarEtiquetas: true });

  const j = datos.jerarquia || {};
  const campo = (texto, x, y, extra = {}) => {
    // El valor nunca se pega a la etiqueta en negritas de su renglón.
    const etiqueta = layoutCedula.find((l) => l.b && Math.abs(l.y - y) < 0.5 && l.x < x);
    const minX = etiqueta ? etiqueta.x + bold.widthOfTextAtSize(etiqueta.t, etiqueta.sz) + 3 : x;
    dibujarCampo(page, texto, { x: Math.max(x, minX), y, font: regular, ...extra });
  };
  campo(`C. ${datos.nombre}`, 207.6, 139.58);
  campo(datos.puesto, 226.9, 181.34);
  campo(j.subsecretaria, 168.6, 264.77);
  campo(j.organoAuxiliar, 179.1, 306.53);
  campo(j.organoDesconcentrado, 226.2, 348.17);
  campo(j.direccion, 142.0, 389.95);
  campo(j.unidad, 214.6, 431.59);
  campo(j.departamento, 169.1, 459.43, { maxLineas: 1 });
  campo(j.area, 167.5, 487.27, { maxLineas: 1 });

  const { dia, mes, anio } = partesFecha(fecha);
  campo(`${dia} DE ${mes.toUpperCase()} DEL ${anio}.`, 247.1, 515.14);

  // Titular centrado sobre la línea de firma (centro del original: x ≈ 186).
  const { titular, suplente } = firmantes;
  dibujarTextoCentrado(page, titular.nombre.toUpperCase(), { font: bold, size: 9, centroX: 186, y: POS_CEDULA.titularNombre.y });
  dibujarTextoCentrado(page, titular.cargo.toUpperCase(), { font: bold, size: 9, centroX: 186, y: POS_CEDULA.titularCargo.y });
  if (suplente) dibujarSuplente(page, suplente, { x: 311.5, ancho: 230.5, pos: POS_CEDULA, regular, bold });

  // Firma automática de quien suscribe (suplente si el titular está ausente).
  await dibujarFirmaImagen(pdfDoc, page, firmaImagen, suplente
    ? { centroX: 311.5 + bold.widthOfTextAtSize(suplente.nombre, 10) / 2, nombreY: POS_CEDULA.suplenteNombre.y, maxH: 44 }
    : { centroX: 186, nombreY: POS_CEDULA.titularNombre.y, maxH: 44 });

  pieFolio(page, folio, regular, 85, 710);
  return pdfDoc.save();
}

// datos: { apellidosNombre, rfc, puesto, adscripcion, esMujer }
async function generarPdfConstancia({ datos, folio, oficio, firmantes, firmaImagen = null, fecha = new Date() }) {
  const { pdfDoc, page, regular, bold } = await nuevoDocumento();

  dibujarTextoFijo(page, layoutConstancia, { regular, bold });

  const { dia, mes, anio } = partesFecha(fecha);
  page.drawText(`SF/DA/${oficio}/${anio}`, { x: 309.8, y: PAGE_H - 137.3, size: 9, font: regular, color: NEGRO });

  const lugarFecha = `Reyes Mantecón, San Bartolo Coyotepec, Oaxaca, a ${dia} de ${mes} del ${anio}`;
  page.drawText(lugarFecha, {
    x: 539 - regular.widthOfTextAtSize(lugarFecha, 9),
    y: PAGE_H - 174.26,
    size: 9,
    font: regular,
    color: NEGRO,
  });

  const { esMujer } = datos;
  const opciones = { x: 63.7, ancho: 475.3, regular, bold };
  const ultimaLinea = dibujarParrafo(
    page,
    [
      { t: `Que ${esMujer ? "la" : "el"} ` },
      { t: `C. ${datos.apellidosNombre}`, b: true },
      { t: " con " },
      { t: `R.F.C. ${datos.rfc}`, b: true },
      { t: ", puesto, nivel y categoría " },
      { t: datos.puesto, b: true },
      { t: ` ${adscritoA(datos.adscripcion, esMujer)} de esta Dependencia, NO HA SIDO ${esMujer ? "SANCIONADA" : "SANCIONADO"} a una incidencia administrativa (llamada de atención, amonestación, sanción económica o acta administrativa) NI HA SOLICITADO licencia a su plaza de base en el transcurso de un año anterior a la fecha.` },
    ],
    { ...opciones, y: 349.13 }
  );

  dibujarParrafo(
    page,
    [
      {
        t: `Se extiende la presente a petición ${esMujer ? "de la interesada" : "del interesado"} para efectos del movimiento escalafonario ante la Comisión Mixta de Escalafón del Gobierno del Estado, en Reyes Mantecón, San Bartolo Coyotepec, Centro, Oaxaca.`,
      },
    ],
    { ...opciones, y: ultimaLinea + 27.84 }
  );

  const { titular, suplente } = firmantes;
  page.drawText(titular.cargo.toUpperCase(), { x: 63.7, y: PAGE_H - POS_CONSTANCIA.titularCargo.y, size: 9, font: bold, color: NEGRO });
  page.drawText(titular.nombre.toUpperCase(), { x: 63.7, y: PAGE_H - POS_CONSTANCIA.titularNombre.y, size: 9, font: bold, color: NEGRO });
  if (suplente) dibujarSuplente(page, suplente, { x: 318, ancho: 221.5, pos: POS_CONSTANCIA, regular, bold });

  // Firma automática de quien suscribe (suplente si el titular está ausente).
  await dibujarFirmaImagen(pdfDoc, page, firmaImagen, suplente
    ? { centroX: 318 + bold.widthOfTextAtSize(suplente.nombre, 10) / 2, nombreY: POS_CONSTANCIA.suplenteNombre.y, maxH: 34 }
    : { centroX: 63.7 + bold.widthOfTextAtSize(titular.nombre.toUpperCase(), 9) / 2, nombreY: POS_CONSTANCIA.titularNombre.y, maxH: 38 });

  pieFolio(page, folio, regular, 85, 695);
  return pdfDoc.save();
}

module.exports = { generarPdfCedula, generarPdfConstancia, partesFecha };
