// Marca cada documento de TALONES con la persona dueña (NUMEMP y RFC).
//
// PLANTILLA tiene un registro por plaza que se reutiliza cuando entra alguien
// nuevo. Los documentos de TALONES viejos solo guardan _idEmployee (la plaza),
// así que se asignan a quien ocupa hoy la plaza. Desde ese momento, si entra
// otra persona a la plaza, ya no verá esos talones.
//
// Uso (por defecto solo simula y no escribe nada):
//   node scripts/talones/vincular_persona.js            → simulación
//   node scripts/talones/vincular_persona.js --aplicar  → escribe
// Usa MONGO_URI y DB del entorno (.env).
require("dotenv").config();
const { connect } = require("../../src/config/mongo");
const { identidadEmpleado, COLECCIONES_EMPLEADOS } = require("../../src/libs/talonesQuincena");

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

  if (aplicar && operaciones.length > 0) {
    await db.collection("TALONES").bulkWrite(operaciones, { ordered: false });
  }
  console.log(resumen);
  if (!aplicar) console.log("Simulación: no se escribió nada. Usa --aplicar para guardar.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
