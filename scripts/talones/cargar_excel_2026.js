// Carga en TALONES el control de sobres 2026 del Excel "CONTROL DE SOBRES SEFIN"
// (ya normalizado a JSON). Pensado para la base de PRUEBAS.
//
// Uso:
//   node scripts/talones/cargar_excel_2026.js --db <BASE> --json <talones_2026_normalizado.json> --salida <carpeta>
//        [--hasta-quincena N] [--campo-adscripcion CAMPO] [--aplicar]
//
// - Sin --aplicar solo simula: no escribe nada y genera el reporte.
// - Con --aplicar respalda TALONES de esa base en <salida> y luego escribe.
// - --db es obligatorio para que nunca se escriba en una base por accidente.
//
// Cruce: nombre completo exacto (APE_PAT APE_MAT NOMBRES, sin acentos) + clave
// de adscripción exacta, contra PLANTILLA y PLANTILLA_FORANEA activos. Si
// no se indica --campo-adscripcion, se detecta el campo de PLANTILLA cuyo valor
// coincide con la clave del Excel. Lo que no cruce, o salga repetido, va al
// reporte de Excel y no se carga.
//
// Numeración: el JSON trae QUIN 1-24 (mayo y diciembre expandidos a dos). En
// SIRH hay 22 fechas de pago (mayo y diciembre son un solo sobre), así que se
// convierte: 1-8 → 1-8, 9-10 → 9, 11-22 → 10-21, 23-24 → 22. RETRO es un sobre
// extra (QUIN "RETRO", TIPO "RETROACTIVO") que se pagó entre la 12 y la 13.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { ObjectId, BSON } = require("mongodb");
const { EJSON } = BSON;
const moment = require("moment-timezone");
const { connect, withDatabase } = require("../../src/config/mongo");
const {
  TIMEZONE,
  COLECCIONES_EMPLEADOS,
  obtenerFechasPagoHasta,
  getQuincenaInfo,
  identidadEmpleado,
  talonesSonDe,
} = require("../../src/libs/talonesQuincena");

const ANIO = 2026;
const ORIGEN = "EXCEL_2026";
const STATUS = { ENTREGADO: 1, PENDIENTE: 2, PRESTADO: 3 };

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const normalizar = (t = "") =>
  String(t)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9Ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const nombreDe = (e) => normalizar(`${e.APE_PAT || ""} ${e.APE_MAT || ""} ${e.NOMBRES || ""}`);

// QUIN del JSON (1-24) → QUIN de SIRH (1-22).
const quinSirh = (q) => (q <= 8 ? q : q <= 10 ? 9 : q <= 22 ? q - 1 : 22);

async function main() {
  const dbName = arg("--db");
  const jsonPath = arg("--json");
  const salida = arg("--salida");
  const aplicar = process.argv.includes("--aplicar");
  if (!dbName || !jsonPath || !salida) {
    console.error("Faltan argumentos: --db <BASE> --json <archivo> --salida <carpeta>");
    process.exit(1);
  }
  fs.mkdirSync(salida, { recursive: true });

  const fechasPago = obtenerFechasPagoHasta(moment.tz({ year: ANIO, month: 11, day: 31 }, TIMEZONE).toDate(), ANIO);
  const hoy = getQuincenaInfo(new Date());
  const ultimaPagada = obtenerFechasPagoHasta(new Date(), ANIO).length;
  const hasta = Number(arg("--hasta-quincena") || ultimaPagada);

  await withDatabase(dbName, async () => {
    const db = await connect();
    console.log(`Base: ${db.databaseName} · modo: ${aplicar ? "APLICAR" : "SIMULACIÓN"} · se cargan quincenas 1-${hasta} (+RETRO si ${hasta} >= 12) · hoy ${hoy.fechaMx.format("YYYY-MM-DD")}`);

    const { registros } = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Empleados activos (plantilla y foráneos) indexados por nombre.
    const empleados = [];
    for (const col of COLECCIONES_EMPLEADOS) {
      const docs = await db.collection(col).find({ status: 1 }).toArray();
      docs.forEach((e) => empleados.push({ ...e, _COLECCION: col }));
    }
    const porNombre = new Map();
    for (const e of empleados) {
      const k = nombreDe(e);
      if (!porNombre.has(k)) porNombre.set(k, []);
      porNombre.get(k).push(e);
    }

    // Detectar el campo de la clave de adscripción si no se indicó.
    let campo = arg("--campo-adscripcion");
    if (!campo) {
      const votos = new Map();
      for (const r of registros) {
        const cands = porNombre.get(normalizar(r.NOMBRE_EXCEL)) || [];
        if (cands.length !== 1 || !r.ADSCRIPCION_CLAVE) continue;
        for (const [k, v] of Object.entries(cands[0])) {
          if ((typeof v === "string" || typeof v === "number") && String(v).trim() === r.ADSCRIPCION_CLAVE) {
            votos.set(k, (votos.get(k) || 0) + 1);
          }
        }
      }
      const ranking = [...votos.entries()].sort((a, b) => b[1] - a[1]);
      console.log("Campos que coinciden con la clave de adscripción del Excel:", ranking.slice(0, 5));
      campo = ranking[0]?.[0];
      if (!campo) {
        console.error("No se encontró ningún campo de PLANTILLA con la clave de adscripción. Indica --campo-adscripcion.");
        process.exit(1);
      }
      console.log(`Se usará el campo "${campo}".`);
    }

    // Cruce exacto nombre + clave.
    const noCruzaron = [];
    const repetidos = [];
    const cruces = new Map(); // _id empleado → [registros]
    for (const r of registros) {
      const cands = (porNombre.get(normalizar(r.NOMBRE_EXCEL)) || []).filter(
        (e) => String(e[campo] ?? "").trim() === String(r.ADSCRIPCION_CLAVE ?? "").trim(),
      );
      let elegidos = cands;
      if (cands.length > 1 && r.TIPONOM) {
        const porTipo = cands.filter((e) => String(e.TIPONOM || "").trim() === r.TIPONOM);
        if (porTipo.length >= 1) elegidos = porTipo;
      }
      if (elegidos.length === 0) {
        const soloNombre = porNombre.get(normalizar(r.NOMBRE_EXCEL)) || [];
        noCruzaron.push({
          ...r,
          MOTIVO: soloNombre.length ? "NOMBRE COINCIDE, ADSCRIPCIÓN NO" : "NOMBRE NO ENCONTRADO",
          ADSCRIPCION_SIRH: soloNombre.map((e) => e[campo]).join(" | "),
        });
      } else if (elegidos.length > 1) {
        repetidos.push({ ...r, MOTIVO: `${elegidos.length} EMPLEADOS EN SIRH`, NUMEMP_SIRH: elegidos.map((e) => e.NUMEMP).join(" | ") });
      } else {
        const k = String(elegidos[0]._id);
        if (!cruces.has(k)) cruces.set(k, { emp: elegidos[0], regs: [] });
        cruces.get(k).regs.push(r);
      }
    }
    // Un empleado de SIRH que cruzó con más de una fila del Excel → repetido.
    for (const [k, { emp, regs }] of [...cruces.entries()]) {
      if (regs.length > 1) {
        regs.forEach((r) => repetidos.push({ ...r, MOTIVO: "VARIAS FILAS DEL EXCEL PARA EL MISMO EMPLEADO", NUMEMP_SIRH: emp.NUMEMP }));
        cruces.delete(k);
      }
    }

    // Documentos de TALONES existentes de los empleados cruzados (sin imágenes).
    const existentes = await db
      .collection("TALONES")
      .find(
        { _idEmployee: { $in: [...cruces.values()].map((c) => c.emp._id) } },
        { projection: { "TALONES.IMAGE": 0, "TALONES.IMAGE_REGRESO": 0 } },
      )
      .toArray();

    const conflictos = [];
    const revisar = [];
    const ops = [];
    const totales = { empleados: 0, nuevos: 0, actualizados: 0, ENTREGADO: 0, PENDIENTE: 0, PRESTADO: 0, NO_APLICA: 0, REVISAR: 0, FUTURAS_OMITIDAS: 0 };

    for (const { emp, regs } of cruces.values()) {
      const r = regs[0];
      const doc = existentes.find((d) => talonesSonDe(d, emp));
      const actuales = doc?.TALONES || [];
      const prestamoHistorico = new ObjectId();
      const push = [];
      const sets = {};
      const vistos = new Set();

      for (const q of r.QUINCENAS) {
        const esRetro = q.QUIN === "RETRO";
        const quin = esRetro ? "RETRO" : quinSirh(Number(q.QUIN));
        if (vistos.has(quin)) continue; // mayo y diciembre vienen duplicados
        vistos.add(quin);

        if (esRetro ? hasta < 12 : quin > hasta) {
          totales.FUTURAS_OMITIDAS++;
          continue;
        }
        if (q.ESTATUS_EXCEL === "NO_APLICA") {
          totales.NO_APLICA++;
          continue;
        }
        if (!(q.ESTATUS_EXCEL in STATUS)) {
          totales.REVISAR++;
          revisar.push({ FILA_EXCEL: r.FILA_EXCEL, NOMBRE_EXCEL: r.NOMBRE_EXCEL, NUMEMP: emp.NUMEMP, QUIN: quin, VALOR_ORIGINAL: q.VALOR_ORIGINAL });
          continue;
        }

        const status = STATUS[q.ESTATUS_EXCEL];
        const fechaPag = esRetro ? null : fechasPago[quin - 1];
        const datos = {
          STATUS: status,
          ORIGEN: ORIGEN,
          FILA_EXCEL: r.FILA_EXCEL,
          ...(status === STATUS.PRESTADO
            ? {
              PRESTAMO_ID: prestamoHistorico,
              TIPO_RECEPTOR: "HISTORICO EXCEL",
              NOMBRE_RECEPTOR: "",
              FOLIO_RH: "",
              FECHA_PRESTAMO: null,
              OBSERVACIONES: "PRÉSTAMO REGISTRADO EN EL CONTROL DE SOBRES 2026 (EXCEL)",
            }
            : {}),
        };

        const actualIdx = actuales.findIndex((t) =>
          esRetro
            ? t.QUIN === "RETRO" && Number(t.YEAR) === ANIO
            : (t.FECHA_PAG && moment.tz(t.FECHA_PAG, TIMEZONE).format("YYYY-MM-DD") === moment.tz(fechaPag, TIMEZONE).format("YYYY-MM-DD")) ||
              (Number(t.YEAR) === ANIO && Number(t.QUIN) === quin),
        );

        if (actualIdx >= 0) {
          const actual = actuales[actualIdx];
          if (actual.ORIGEN === ORIGEN) continue; // ya cargado en una corrida anterior
          const tocadoEnSirh = actual.STATUS !== STATUS.PENDIENTE || actual.PRESTAMO_ID || actual.ENTREGADO_POR;
          if (actual.STATUS === status && !tocadoEnSirh) continue;
          if (tocadoEnSirh) {
            conflictos.push({ FILA_EXCEL: r.FILA_EXCEL, NOMBRE_EXCEL: r.NOMBRE_EXCEL, NUMEMP: emp.NUMEMP, QUIN: quin, STATUS_SIRH: actual.STATUS, STATUS_EXCEL: q.ESTATUS_EXCEL });
            continue;
          }
          for (const [k, v] of Object.entries(datos)) sets[`TALONES.${actualIdx}.${k}`] = v;
          totales.actualizados++;
        } else {
          push.push({
            _id: new ObjectId(),
            QUIN: quin,
            YEAR: ANIO,
            FECHA_PAG: fechaPag,
            FOLIO: null,
            ...(esRetro ? { TIPO: "RETROACTIVO" } : {}),
            ...datos,
          });
          totales.nuevos++;
        }
        totales[q.ESTATUS_EXCEL]++;
      }

      if (push.length === 0 && Object.keys(sets).length === 0) continue;
      totales.empleados++;
      if (doc) {
        // Mongo no permite $set y $push sobre TALONES en la misma operación.
        if (Object.keys(sets).length) {
          ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: sets } } });
        }
        if (push.length) {
          ops.push({ updateOne: { filter: { _id: doc._id }, update: { $push: { TALONES: { $each: push } } } } });
        }
      } else {
        ops.push({ insertOne: { document: { _idEmployee: emp._id, ...identidadEmpleado(emp), TALONES: push } } });
      }
    }

    // Reporte en Excel.
    const libro = new ExcelJS.Workbook();
    const hoja = (nombre, filas, columnas) => {
      const h = libro.addWorksheet(nombre);
      h.columns = columnas.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));
      h.getRow(1).font = { bold: true };
      filas.forEach((f) => h.addRow(f));
    };
    hoja("RESUMEN", [
      { CONCEPTO: "Base", VALOR: db.databaseName },
      { CONCEPTO: "Modo", VALOR: aplicar ? "APLICADO" : "SIMULACIÓN" },
      { CONCEPTO: "Campo de adscripción", VALOR: campo },
      { CONCEPTO: "Quincenas cargadas", VALOR: `1-${hasta}${hasta >= 12 ? " + RETRO" : ""}` },
      { CONCEPTO: "Filas del Excel", VALOR: registros.length },
      { CONCEPTO: "Cruzaron", VALOR: cruces.size },
      { CONCEPTO: "No cruzaron", VALOR: noCruzaron.length },
      { CONCEPTO: "Repetidos", VALOR: repetidos.length },
      ...Object.entries(totales).map(([k, v]) => ({ CONCEPTO: `Talones: ${k}`, VALOR: v })),
      { CONCEPTO: "Conflictos con SIRH (no se tocaron)", VALOR: conflictos.length },
    ], ["CONCEPTO", "VALOR"]);
    hoja("NO CRUZARON", noCruzaron, ["FILA_EXCEL", "NOMBRE_EXCEL", "ADSCRIPCION_CLAVE", "TIPONOM", "FORANEO", "MOTIVO", "ADSCRIPCION_SIRH"]);
    hoja("REPETIDOS", repetidos, ["FILA_EXCEL", "NOMBRE_EXCEL", "ADSCRIPCION_CLAVE", "TIPONOM", "MOTIVO", "NUMEMP_SIRH"]);
    hoja("CELDAS A REVISAR", revisar, ["FILA_EXCEL", "NOMBRE_EXCEL", "NUMEMP", "QUIN", "VALOR_ORIGINAL"]);
    hoja("CONFLICTOS", conflictos, ["FILA_EXCEL", "NOMBRE_EXCEL", "NUMEMP", "QUIN", "STATUS_SIRH", "STATUS_EXCEL"]);
    const sello = moment().format("YYYYMMDD_HHmmss");
    const reporte = path.join(salida, `carga_talones_2026_${aplicar ? "aplicado" : "simulacion"}_${sello}.xlsx`);
    await libro.xlsx.writeFile(reporte);

    console.log({ cruzaron: cruces.size, noCruzaron: noCruzaron.length, repetidos: repetidos.length, ...totales, conflictos: conflictos.length, operaciones: ops.length });
    console.log(`Reporte: ${reporte}`);

    if (!aplicar) {
      console.log("Simulación: no se escribió nada. Usa --aplicar para guardar.");
      return;
    }

    const respaldo = path.join(salida, `respaldo_TALONES_${db.databaseName}_${sello}.json`);
    const todos = await db.collection("TALONES").find({}).toArray();
    fs.writeFileSync(respaldo, EJSON.stringify(todos, { relaxed: false }));
    console.log(`Respaldo de TALONES (${todos.length} documentos): ${respaldo}`);

    if (ops.length > 0) {
      try {
        const res = await db.collection("TALONES").bulkWrite(ops, { ordered: false });
        console.log("Escrito:", { insertados: res.insertedCount, modificados: res.modifiedCount });
      } catch (e) {
        const errores = e.writeErrors || [];
        console.error(`Fallaron ${errores.length} operaciones. Primera: ${errores[0]?.errmsg || e.message}`);
        console.error(`Para deshacer, restaura TALONES desde ${respaldo}`);
        process.exit(1);
      }
    }
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
