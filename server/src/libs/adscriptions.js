const { querysql } = require("../config/mysql");

async function getAdscripciones(nombre) {
  const levels = [5, 4, 3, 2, 1];
  let adscriptions = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const fromColumn = level > 1 ? `_${level - 1}from` : null;
    const query = `
      SELECT 
        l${level}.nombre AS nombre,
        ${level} AS nivel,
        ${
          fromColumn
            ? `l${level}.${fromColumn} AS from_nombre`
            : "NULL AS from_nombre"
        }
      FROM 
        adsc_level${level} l${level}
      WHERE 
        l${level}.nombre = ?
    `;
    const result = await querysql(query, [nombre]);
    if (result.length > 0) {
      const adscription = result[0];
      adscriptions.push({
        nombre: adscription.nombre,
        nivel: adscription.nivel,
      });

      // Buscar en los niveles superiores
      let currentFromNombre = adscription.from_nombre;
      for (let j = level - 1; j >= 1 && currentFromNombre; j--) {
        const upperFromColumn = j > 1 ? `_${j - 1}from` : null;
        const upperQuery = `
          SELECT 
            l${j}.nombre AS nombre,
            ${j} AS nivel,
            ${
              upperFromColumn
                ? `l${j}.${upperFromColumn} AS from_nombre`
                : "NULL AS from_nombre"
            }
          FROM 
            adsc_level${j} l${j}
          WHERE 
            l${j}.nombre = ?
        `;
        const upperResult = await querysql(upperQuery, [currentFromNombre]);
        if (upperResult.length > 0) {
          const upperAdscription = upperResult[0];
          adscriptions.push({
            nombre: upperAdscription.nombre,
            nivel: upperAdscription.nivel,
          });
          currentFromNombre = upperAdscription.from_nombre;
        } else {
          currentFromNombre = null;
        }
      }
      break; // Salir del bucle principal si se encontró el nombre
    }
  }

  return adscriptions;
}

module.exports = { getAdscripciones };
