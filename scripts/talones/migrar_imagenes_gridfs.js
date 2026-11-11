// Pasa las imágenes de talones guardadas en base64 dentro de TALONES
// (IMAGE / IMAGE_REGRESO) a GridFS (bucket TALONES_IMG) y deja en el talón
// solo IMAGE_ID / IMAGE_REGRESO_ID. Ver src/libs/talonesImagenes.js.
//
// - Imágenes de más de 1600 px de ancho o que no son JPEG se reducen y
//   comprimen igual que las nuevas; las demás se guardan tal cual.
// - El base64 solo se borra del talón después de comprobar que la imagen
//   quedó completa en GridFS.
// - Se puede correr varias veces: solo toca lo que sigue en base64.
//
// Uso (por defecto solo simula y no escribe nada):
//   node scripts/talones/migrar_imagenes_gridfs.js            → simulación
//   node scripts/talones/migrar_imagenes_gridfs.js --aplicar  → escribe
// Usa MONGO_URI y DB del entorno (.env).
require("dotenv").config();
const sharp = require("sharp");
const { connect } = require("../../src/config/mongo");
const { guardarImagenTalon, leerImagenTalon, borrarImagenesTalon } = require("../../src/libs/talonesImagenes");

const ANCHO_MAX = 1600;
const CALIDAD = 70;
const CAMPOS = [
  ["IMAGE", "IMAGE_ID", "ENTREGA"],
  ["IMAGE_REGRESO", "IMAGE_REGRESO_ID", "REGRESO"],
];

async function prepararBuffer(dataUri) {
  const original = Buffer.from(String(dataUri).replace(/^data:[^,]*,/, ""), "base64");
  const meta = await sharp(original).metadata();
  if (meta.format === "jpeg" && (meta.width || 0) <= ANCHO_MAX) return original;
  return sharp(original)
    .rotate()
    .resize({ width: ANCHO_MAX, withoutEnlargement: true })
    .jpeg({ quality: CALIDAD, mozjpeg: true })
    .toBuffer();
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const db = await connect();
  const col = db.collection("TALONES");
  console.log(`Base: ${db.databaseName} · modo: ${aplicar ? "APLICAR" : "SIMULACIÓN"}`);

  const filtro = {
    $or: [{ "TALONES.IMAGE": { $type: "string" } }, { "TALONES.IMAGE_REGRESO": { $type: "string" } }],
  };
  // Primero solo los _id, para luego leer un documento a la vez.
  const ids = (await col.find(filtro, { projection: { _id: 1 } }).toArray()).map((d) => d._id);

  const r = { documentos: ids.length, imagenes: 0, migradas: 0, errores: 0, bytesAntes: 0, bytesDespues: 0 };
  for (const docId of ids) {
    const doc = await col.findOne({ _id: docId });
    if (!doc) continue;
    for (const talon of doc.TALONES || []) {
      for (const [campo, campoId, tipo] of CAMPOS) {
        if (typeof talon[campo] !== "string" || talon[campoId]) continue;
        r.imagenes++;
        r.bytesAntes += talon[campo].length;
        let buffer;
        try {
          buffer = await prepararBuffer(talon[campo]);
        } catch (e) {
          r.errores++;
          console.error(`Talón ${talon._id} (${campo}): imagen ilegible, se deja como está. ${e.message}`);
          continue;
        }
        r.bytesDespues += buffer.length;
        if (!aplicar) continue;

        const imageId = await guardarImagenTalon(buffer, {
          talonId: talon._id,
          empleadoId: doc._idEmployee,
          tipo,
          migrado: true,
          fecha: talon.FECHA_ENTREGA || talon.FECHA_REGRESO || new Date(),
        });
        const leida = await leerImagenTalon(imageId);
        if (leida.length !== buffer.length) {
          await borrarImagenesTalon([imageId]);
          r.errores++;
          console.error(`Talón ${talon._id} (${campo}): la copia en GridFS no coincide, se deja como está.`);
          continue;
        }
        const res = await col.updateOne(
          { _id: doc._id, TALONES: { $elemMatch: { _id: talon._id, [campo]: { $type: "string" } } } },
          { $set: { [`TALONES.$[t].${campoId}`]: imageId }, $unset: { [`TALONES.$[t].${campo}`]: "" } },
          { arrayFilters: [{ "t._id": talon._id }] },
        );
        if (res.modifiedCount === 1) {
          r.migradas++;
        } else {
          await borrarImagenesTalon([imageId]);
          r.errores++;
          console.error(`Talón ${talon._id} (${campo}): cambió mientras se migraba, se deja como está.`);
        }
      }
    }
  }

  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log({
    ...r,
    bytesAntes: mb(r.bytesAntes),
    bytesDespues: mb(r.bytesDespues),
  });
  if (!aplicar) console.log("Simulación: no se escribió nada. Usa --aplicar para guardar.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
