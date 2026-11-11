// Imágenes de talones de pago en GridFS (bucket TALONES_IMG).
//
// Antes cada imagen se guardaba en base64 dentro del documento TALONES del
// empleado; con 22 quincenas al año el documento se acercaba al límite de
// 16 MB de MongoDB y cada lectura movía todas las imágenes. Ahora el talón solo
// guarda IMAGE_ID / IMAGE_REGRESO_ID y la imagen vive aparte.
// Los talones viejos con IMAGE en base64 se siguen leyendo igual hasta correr
// scripts/talones/migrar_imagenes_gridfs.js.
const { GridFSBucket, ObjectId } = require("mongodb");
const { connect } = require("../config/mongo");

const BUCKET = "TALONES_IMG";

async function bucket() {
  return new GridFSBucket(await connect(), { bucketName: BUCKET });
}

// Guarda un buffer JPEG y regresa su ObjectId.
async function guardarImagenTalon(buffer, metadata = {}) {
  const b = await bucket();
  const id = new ObjectId();
  await new Promise((resolve, reject) => {
    b.openUploadStreamWithId(id, `talon_${metadata.talonId || id}.jpg`, {
      metadata: { contentType: "image/jpeg", ...metadata },
    })
      .on("error", reject)
      .on("finish", resolve)
      .end(buffer);
  });
  return id;
}

async function leerImagenTalon(id) {
  const b = await bucket();
  const partes = [];
  await new Promise((resolve, reject) => {
    b.openDownloadStream(new ObjectId(String(id)))
      .on("data", (c) => partes.push(c))
      .on("error", reject)
      .on("end", resolve);
  });
  return Buffer.concat(partes);
}

// Borra imágenes sin fallar si alguna ya no existe (limpieza tras un error).
async function borrarImagenesTalon(ids = []) {
  const b = await bucket();
  for (const id of ids.filter(Boolean)) {
    try {
      await b.delete(new ObjectId(String(id)));
    } catch {
      // ya no existía
    }
  }
}

const aDataUri = (buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`;

// Rellena IMAGE / IMAGE_REGRESO (data URI) en los talones que tienen IMAGE_ID,
// para que el front los siga recibiendo como antes. Modifica los documentos.
async function hidratarImagenes(docs = []) {
  const tareas = [];
  for (const doc of docs) {
    for (const talon of doc.TALONES || []) {
      for (const [campoId, campo] of [["IMAGE_ID", "IMAGE"], ["IMAGE_REGRESO_ID", "IMAGE_REGRESO"]]) {
        if (talon[campoId] && !talon[campo]) {
          tareas.push(
            leerImagenTalon(talon[campoId])
              .then((buf) => { talon[campo] = aDataUri(buf); })
              .catch(() => { talon[campo] = null; }),
          );
        }
      }
    }
  }
  await Promise.all(tareas);
  return docs;
}

module.exports = {
  BUCKET,
  guardarImagenTalon,
  leerImagenTalon,
  borrarImagenesTalon,
  hidratarImagenes,
  aDataUri,
};
