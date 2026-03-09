const { querysql } = require("../config/mysql");

async function getAdscripciones(nombre) {
  let adscriptions = [];

  // Buscar el registro inicial por nombre
  const initialQuery = `
    SELECT id_adscripcion, nombre, tipo, nivel, clave, parent_id
    FROM adscripciones
    WHERE nombre = ?
  `;
  const initialResult = await querysql(initialQuery, [nombre]);

  if (initialResult.length === 0) {
    return adscriptions; // Retorna vacío si no se encuentra
  }

  let currentId = initialResult[0].id_adscripcion;

  // Recorrer hacia arriba en la jerarquía usando parent_id
  while (currentId !== null) {
    const query = `
      SELECT id_adscripcion, nombre, tipo, nivel, clave, parent_id
      FROM adscripciones
      WHERE id_adscripcion = ?
    `;
    const result = await querysql(query, [currentId]);

    if (result.length > 0) {
      const adscription = result[0];
      adscriptions.push({
        nombre: adscription.nombre,
        nivel: adscription.nivel,
        clave: adscription.clave,
        // Agrega otros campos si los necesitas, como tipo o parent_id
      });
      currentId = adscription.parent_id; // Siguiente padre
    } else {
      break; // Salir si no se encuentra
    }
  }

  // Ordenar por nivel ascendente (del más bajo al más alto, o viceversa según necesites)
  adscriptions.sort((a, b) => a.nivel - b.nivel);

  return adscriptions;
}

module.exports = { getAdscripciones };