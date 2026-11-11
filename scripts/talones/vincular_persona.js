// Marca cada documento de TALONES con la persona dueña (NUMEMP y RFC).
//
// PLANTILLA tiene un registro por plaza que se reutiliza cuando entra alguien
// nuevo. Los documentos de TALONES viejos solo guardan _idEmployee (la plaza),
// así que se asignan a quien ocupa hoy la plaza. Desde ese momento, si entra
// otra persona a la plaza, ya no verá esos talones.
// También renumera los talones viejos del cron (QUIN 1-24 sin YEAR → 1-22)
// y pasa a PENDIENTE (1) los que el cron viejo creó con STATUS 2 sin imagen.
// Se puede correr varias veces: solo toca lo que falta.
//
// Uso (por defecto solo simula y no escribe nada):
//   node scripts/talones/vincular_persona.js            → simulación
//   node scripts/talones/vincular_persona.js --aplicar  → escribe
// Usa MONGO_URI y DB del entorno (.env).
require("dotenv").config();
const { connect } = require("../../src/config/mongo");
const moment = require("moment-timezone");
const {
  TIMEZONE,
  identidadEmpleado,
  getQuincenaInfo,
  COLECCIONES_EMPLEADOS,
} = require("../../src/libs/talonesQuincena");

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const db = await connect();
  console.log(`Base: ${db.databaseName} · modo: ${aplicar ? "APLICAR" : "SIMULACIÓN"}`);

  const legado = await db
    .collection("TALONES")
    .find({ NUMEMP: { $exists: false }, RFC: { $exists: false } }, { projection: { _idEmployee: 1 } })
    .toArray();

  const ids = legado.map((d) => d._idEmployee);
  const empleados = new Map();
  for (const col of COLECCIONES_EMPLEADOS) {
    const docs = await db.collection(col).find({ _id: { $in: ids } }, { projection: { NUMEMP: 1, RFC: 1, status: 1 } }).toArray();
    docs.forEach((e) => empleados.set(String(e._id), e));
  }

  const resumen = { documentos: legado.length, vinculados: 0, sinOcupante: 0, sinIdentidad: 0 };
  const operaciones = [];
  for (const doc of legado) {
    const emp = empleados.get(String(doc._idEmployee));
    if (!emp || emp.status !== 1) {
      // Plaza vacante: los talones eran del ocupante anterior. Se marcan sin
      // dueño para que el próximo ocupante no los vea.
      operaciones.push({
        updateOne: { filter: { _id: doc._id }, update: { $set: { NUMEMP: null, RFC: null, SIN_OCUPANTE: true } } },
      });
      resumen.sinOcupante++;
      continue;
    }
    const identidad = identidadEmpleado(emp);
    if (!identidad.NUMEMP && !identidad.RFC) {
      resumen.sinIdentidad++;
      continue;
    }
    operaciones.push({ updateOne: { filter: { _id: doc._id }, update: { $set: identidad } } });
    resumen.vinculados++;
  }

  // Talones viejos del cron: numeración 1-24, sin YEAR y a veces FECHA_PAG
  // como texto. Se recalculan con la numeración actual (1-22) a partir de
  // su fecha de pago.
  const normalizados = { talones: 0, sinFecha: 0 };

  // El cron viejo (antes de v2.11) creaba los talones con STATUS 2. Los que
  // no tienen imagen nunca se entregaron: pasan a PENDIENTE (1), que es la
  // numeración del front. Se hace antes del renumerado (usa la falta de YEAR).
  const filtroViejoPendiente = { STATUS: 2, IMAGE: { $exists: false }, YEAR: { $exists: false } };
  const [conteoPendientes] = await db.collection("TALONES").aggregate([
    { $unwind: "$TALONES" },
    { $match: Object.fromEntries(Object.entries(filtroViejoPendiente).map(([k, v]) => [`TALONES.${k}`, v])) },
    { $count: "n" },
  ]).toArray();
  normalizados.aPendiente = conteoPendientes?.n || 0;
  if (aplicar && normalizados.aPendiente > 0) {
    await db.collection("TALONES").updateMany(
      { TALONES: { $elemMatch: filtroViejoPendiente } },
      { $set: { "TALONES.$[t].STATUS": 1 } },
      { arrayFilters: [Object.fromEntries(Object.entries(filtroViejoPendiente).map(([k, v]) => [`t.${k}`, v]))] },
    );
  }

  const cursor = db.collection("TALONES").find(
    { TALONES: { $elemMatch: { $or: [{ YEAR: { $exists: false } }, { FECHA_PAG: { $type: "string" } }] } } },
    { projection: { "TALONES.IMAGE": 0, "TALONES.IMAGE_REGRESO": 0 } },
  );
  for await (const doc of cursor) {
    const $set = {};
    (doc.TALONES || []).forEach((t, i) => {
      if (t.QUIN === "RETRO") return;
      if (t.YEAR !== undefined && typeof t.FECHA_PAG !== "string") return;
      const fecha = t.FECHA_PAG ? moment.tz(t.FECHA_PAG, TIMEZONE) : null;
      if (!fecha || !fecha.isValid()) {
        normalizados.sinFecha++;
        return;
      }
      const info = getQuincenaInfo(fecha.toDate());
      $set[`TALONES.${i}.QUIN`] = info.quincenaDelAnio;
      $set[`TALONES.${i}.YEAR`] = info.anio;
      $set[`TALONES.${i}.FECHA_PAG`] = info.fechaPago;
      normalizados.talones++;
    });
    if (Object.keys($set).length) {
      operaciones.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } });
    }
  }

  if (aplicar && operaciones.length > 0) {
    await db.collection("TALONES").bulkWrite(operaciones, { ordered: false });
  }
  console.log({ ...resumen, talonesRenumerados: normalizados.talones, talonesSinFecha: normalizados.sinFecha, talonesViejosAPendiente: normalizados.aPendiente });
  if (!aplicar) console.log("Simulación: no se escribió nada. Usa --aplicar para guardar.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
