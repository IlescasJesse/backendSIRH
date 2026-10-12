// Datos del empleado para los documentos del Portal (cédula y constancia).
// Los campos de la cédula salen de la jerarquía de `adscripciones` (MySQL):
// se sube por parent_id desde la adscripción del empleado hasta la Secretaría.
const { querysql } = require("../config/mysql");

// Error de datos del empleado que impide expedir el documento (se responde 422).
class ErrorDatosEmpleado extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
  }
}

// Cómo se reparte cada nivel de `adscripciones` en los campos de la cédula.
// Ajustar aquí si RH define otro criterio (p. ej. qué es "órgano auxiliar").
const TIPO_ORGANO_DESCONCENTRADO = 7; // p. ej. Instituto Catastral del Estado
const NIVEL_RAIZ = 1;

// Texto que se imprime cuando un campo de la cédula no aplica (decisión de
// Jesse 2026-09-27: se imprime literal, igual que en las constancias manuales
// de RH, en vez de dejar el campo en blanco).
const NO_APLICA = "(NO APLICA)";

// Claves de `adscripciones` (nivel 2, hijas directas de la Secretaría) que son
// "proyectos" fuera del organigrama normal: personal que no pertenece a una
// subsecretaría/dirección sino a un proyecto con nombre propio. La cédula NO
// reparte su jerarquía en los 6 campos normales — todos van "(NO APLICA)" y el
// nombre del proyecto se imprime completo en AREA U OFICINA con el prefijo
// "PROYECTO:". Ver memoria `project_constancias_adscripcion_especial.md`.
// clave 24  = PERSONAL ADSCRITO A LA SECRETARÍA DE FINANZAS (HANGAR)
// clave 26  = OTORGAMIENTO DE SERVICIOS ADMINISTRATIVOS (DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN)
// clave 102 = ADMINISTRAR CASA OFICIAL — 🔴 PENDIENTE: Jesse debe confirmar con
//             su jefe si es el mismo proyecto que el Excel de RH llama "Eventos
//             en Casa Oficial" (código distinto en el Excel, sin dar de alta en
//             ningún catálogo) o si son dos proyectos distintos.
const CLAVES_PROYECTO_ESPECIAL = new Set([24, 26, 102]);

// Primera palabra de una adscripción que indica género masculino en español
// ("adscrito AL Departamento...", "en EL Instituto..."); el resto de las
// unidades (dirección, coordinación, subsecretaría, unidad, oficina,
// tesorería...) son femeninos ("de LA Dirección...", "en LA Coordinación...").
// Mismo criterio que `portalPdf.js` (`PRIMERA_PALABRA_MASCULINA`) — mantenerlos
// sincronizados si se agrega un tipo de unidad nuevo.
const PRIMERA_PALABRA_MASCULINA = new Set([
  "DEPARTAMENTO", "CENTRO", "INSTITUTO", "ÓRGANO", "ORGANO", "SERVICIO",
  "AREA", "ÁREA", "SECTOR", "DESPACHO", "MODULO", "MÓDULO", "ARCHIVO",
]);

function esMasculino(nombre) {
  const primera = (nombre || "").trim().split(/\s+/)[0]?.toUpperCase() || "";
  return PRIMERA_PALABRA_MASCULINA.has(primera);
}

function asignarACampo(jerarquia, nodo) {
  const nombre = (nodo.nombre || "").trim();
  if (nodo.nivel === 2) jerarquia.subsecretaria = nombre;
  else if (nodo.nivel === 3) {
    if (nodo.tipo === TIPO_ORGANO_DESCONCENTRADO) jerarquia.organoDesconcentrado = nombre;
    else jerarquia.direccion = nombre;
  } else if (nodo.nivel === 4) jerarquia.unidad = nombre;
  else if (nodo.nivel === 5) {
    if (/^DEPARTAMENTO\b/i.test(nombre)) jerarquia.departamento = nombre;
    else jerarquia.area = nombre;
  } else if (nodo.nivel === NIVEL_RAIZ && nodo.parent_id) {
    // Nivel 1 que cuelga de la Secretaría (p. ej. Oficina del Secretario).
    jerarquia.area = nombre;
  }
}

// Busca el nodo de `adscripciones` que corresponde a un nombre (+ clave si se
// tiene, para desambiguar). Se usa tanto para la adscripción oficial del
// empleado como para el destino de una asignación laboral (Regla 1).
async function buscarNodoPorNombreClave(nombre, clave) {
  const nombreLimpio = (nombre || "").trim();
  // OJO: Number(null) es 0 (no NaN) — sin este guard, un `clave` ausente
  // buscaría por clave=0 y podría emparejar un nodo cualquiera sin relación.
  const claveNum = clave === null || clave === undefined || clave === "" ? NaN : Number(clave);
  if (nombreLimpio && Number.isFinite(claveNum)) {
    const exacto = await querysql(
      "SELECT * FROM adscripciones WHERE clave = ? AND UPPER(nombre) = UPPER(?) LIMIT 1",
      [claveNum, nombreLimpio]
    );
    if (exacto[0]) return exacto[0];
  }
  if (nombreLimpio) {
    const porNombre = await querysql(
      "SELECT * FROM adscripciones WHERE UPPER(nombre) = UPPER(?) ORDER BY nivel DESC LIMIT 1",
      [nombreLimpio]
    );
    if (porNombre[0]) return porNombre[0];
  }
  if (Number.isFinite(claveNum)) {
    const porClave = await querysql("SELECT * FROM adscripciones WHERE clave = ? LIMIT 1", [claveNum]);
    if (porClave[0]) return porClave[0];
  }
  return null;
}

async function buscarNodo(empleado) {
  return buscarNodoPorNombreClave(empleado.ADSCRIPCION, empleado.CLAVE);
}

function jerarquiaVacia() {
  return {
    subsecretaria: "",
    organoAuxiliar: "",
    organoDesconcentrado: "",
    direccion: "",
    unidad: "",
    departamento: "",
    area: "",
  };
}

// Sube por parent_id desde `nodo` hasta la raíz repartiendo cada nivel en los
// campos de la cédula (sin rellenar "(NO APLICA)" todavía — eso lo hace quien
// llame, según si el resultado se imprime directo o se concatena en prosa).
async function subirJerarquia(nodo) {
  const jerarquia = jerarquiaVacia();
  for (let i = 0; nodo && i < 8; i++) {
    asignarACampo(jerarquia, nodo);
    nodo = nodo.parent_id
      ? (await querysql("SELECT * FROM adscripciones WHERE id_adscripcion = ?", [nodo.parent_id]))[0]
      : null;
  }
  return jerarquia;
}

function rellenarNoAplica(jerarquia) {
  for (const campo of Object.keys(jerarquia)) {
    if (!jerarquia[campo]) jerarquia[campo] = NO_APLICA;
  }
  return jerarquia;
}

// Arma en prosa la ubicación de una asignación laboral real, p. ej.:
// "el Departamento de Valuación de la Coordinación de Gestión Territorial de
// la Dirección General del Instituto Catastral del Estado de Oaxaca, Órgano
// Desconcentrado". Reconstrucción best-effort a partir de los mismos niveles
// de `adscripciones` — revisar contra casos reales de RH antes de usarlo en
// un documento oficial definitivo.
function textoUbicacion(jerarquia) {
  // Del nivel más específico al más general — "Dirección General" y demás
  // niveles intermedios ya son nodos reales de `adscripciones` (no se
  // sintetizan aquí), así que basta encadenarlos en este orden.
  const niveles = [
    jerarquia.departamento,
    jerarquia.area,
    jerarquia.unidad,
    jerarquia.direccion,
    jerarquia.organoAuxiliar,
    jerarquia.organoDesconcentrado,
    jerarquia.subsecretaria,
  ].filter((v) => v && v !== NO_APLICA);

  let texto = "";
  niveles.forEach((nombre, i) => {
    if (i === 0) {
      texto = `${esMasculino(nombre) ? "el" : "la"} ${nombre}`;
    } else {
      texto += ` ${esMasculino(nombre) ? "del" : "de la"} ${nombre}`;
    }
  });

  // El órgano desconcentrado siempre cierra con esta leyenda fija.
  if (jerarquia.organoDesconcentrado && jerarquia.organoDesconcentrado !== NO_APLICA) {
    texto += ", Órgano Desconcentrado";
  }

  return texto;
}

// Regla 1 (asignación laboral real, confirmada 2026-09-27): si el empleado
// tiene en `STATUS_EMPLEADO` una entrada con STATUS "ASIG_LAB", el campo AREA U
// OFICINA no se reparte normal — lleva "ACTUALMENTE ASIGNADO(A) EN <destino>"
// como bloque de texto, sin importar si el resto de la jerarquía es normal o
// un proyecto especial (Regla 2). `DESDE`/`HASTA` son de manejo interno de
// incidencias, no se imprimen.
async function textoAsignacionLaboral(empleado) {
  const statusArray = Array.isArray(empleado.STATUS_EMPLEADO) ? empleado.STATUS_EMPLEADO : [];
  const asignacion = statusArray.find((s) => s && s.STATUS === "ASIG_LAB" && s.LUGAR_COMISIONADO);
  if (!asignacion) return null;

  const nodoDestino = await buscarNodoPorNombreClave(asignacion.LUGAR_COMISIONADO, asignacion.CLAVE);
  const destino = nodoDestino
    ? textoUbicacion(await subirJerarquia(nodoDestino))
    : (asignacion.LUGAR_COMISIONADO || "").trim();

  return destino ? `ACTUALMENTE ASIGNADO(A) EN ${mayus(destino)}` : null;
}

async function obtenerJerarquia(empleado) {
  let jerarquia;
  const nodo = await buscarNodo(empleado);
  const claveNodo = nodo ? Number(nodo.clave) : NaN;

  if (!nodo) {
    // Sin coincidencia en el catálogo: se imprime la adscripción tal cual
    // viene en PLANTILLA para no dejar la cédula sin ubicación.
    jerarquia = jerarquiaVacia();
    jerarquia.area = (empleado.ADSCRIPCION || "").trim();
  } else if (CLAVES_PROYECTO_ESPECIAL.has(claveNodo)) {
    // Regla 2: proyecto fuera del organigrama normal — no se reparte jerarquía.
    jerarquia = jerarquiaVacia();
    jerarquia.area = `PROYECTO: ${mayus(nodo.nombre)}`;
  } else {
    jerarquia = await subirJerarquia(nodo);
  }

  rellenarNoAplica(jerarquia);

  const textoAsignacion = await textoAsignacionLaboral(empleado);
  if (textoAsignacion) {
    const base = jerarquia.area && jerarquia.area !== NO_APLICA ? `${jerarquia.area}; ` : "";
    jerarquia.area = `${base}${textoAsignacion}`;
  }

  return jerarquia;
}

const limpiar = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const mayus = (v) => limpiar(v).toUpperCase();

// Une solo las partes con valor (los campos vacíos vienen como null).
const unir = (partes, separador = " ") => partes.map(mayus).filter(Boolean).join(separador);

function nombreCompleto(e) {
  const nombre = unir([e.NOMBRES, e.APE_PAT, e.APE_MAT]);
  if (!nombre) {
    throw new ErrorDatosEmpleado("El empleado no tiene nombre registrado (plaza sin titular); no se puede expedir el documento");
  }
  return nombre;
}

function apellidosNombre(e) {
  nombreCompleto(e); // valida que exista nombre
  return unir([e.APE_PAT, e.APE_MAT, e.NOMBRES]);
}

function puestoNivelCategoria(e) {
  return unir([e.NOMCATE, e.NIVEL && `NIVEL ${limpiar(e.NIVEL)}`, e.CLAVECAT && `CATEGORÍA ${limpiar(e.CLAVECAT)}`], ", ");
}

// true = mujer, false = hombre. SEXO en PLANTILLA es H/M; si falta se toma de
// la CURP (posición 11). Si no se puede saber se detiene la expedición para
// no imprimir un documento oficial con el género equivocado.
function esMujer(e) {
  const sexo = mayus(e.SEXO);
  const deCurp = mayus(e.CURP).charAt(10);
  const valor = sexo === "H" || sexo === "M" ? sexo : deCurp;
  if (valor === "M") return true;
  if (valor === "H") return false;
  throw new ErrorDatosEmpleado(
    "No se puede determinar el sexo del empleado (SEXO/CURP); actualiza sus datos antes de expedir la constancia"
  );
}

async function datosCedula(empleado) {
  return {
    nombre: nombreCompleto(empleado),
    puesto: puestoNivelCategoria(empleado),
    jerarquia: await obtenerJerarquia(empleado),
  };
}

function datosConstancia(empleado) {
  if (!limpiar(empleado.RFC)) {
    throw new ErrorDatosEmpleado("El empleado no tiene RFC registrado; actualiza sus datos antes de expedir la constancia");
  }
  return {
    apellidosNombre: apellidosNombre(empleado),
    rfc: mayus(empleado.RFC),
    puesto: puestoNivelCategoria(empleado),
    adscripcion: mayus(empleado.ADSCRIPCION),
    esMujer: esMujer(empleado),
  };
}

module.exports = { datosCedula, datosConstancia, ErrorDatosEmpleado, buscarNodoPorNombreClave };
