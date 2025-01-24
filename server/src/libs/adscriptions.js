const { querysql } = require("../config/mysql");

async function getAdscripciones(departamento) {
  // Consulta para obtener adscripciones de todos los niveles
  const query = `
    SELECT 
        l5.nombre AS level5,
        l4.nombre AS level4,
        l3.nombre AS level3,
        l2.nombre AS level2,
        l1.nombre AS level1
    FROM 
        adsc_level5 l5
    LEFT JOIN 
        adsc_level4 l4 ON l5._4from = l4.nombre
    LEFT JOIN 
        adsc_level3 l3 ON l4._3from = l3.nombre
    LEFT JOIN 
        adsc_level2 l2 ON l3._2from = l2.nombre
    LEFT JOIN 
        adsc_level1 l1 ON l2._1from = l1.nombre
    WHERE 
        l5.nombre = ?
    UNION
    SELECT 
        NULL AS level5,
        l4.nombre AS level4,
        l3.nombre AS level3,
        l2.nombre AS level2,
        l1.nombre AS level1
    FROM 
        adsc_level4 l4
    LEFT JOIN 
        adsc_level3 l3 ON l4._3from = l3.nombre
    LEFT JOIN 
        adsc_level2 l2 ON l3._2from = l2.nombre
    LEFT JOIN 
        adsc_level1 l1 ON l2._1from = l1.nombre
    WHERE 
        l4.nombre = ?
    UNION
    SELECT 
        NULL AS level5,
        NULL AS level4,
        l3.nombre AS level3,
        l2.nombre AS level2,
        l1.nombre AS level1
    FROM 
        adsc_level3 l3
    LEFT JOIN 
        adsc_level2 l2 ON l3._2from = l2.nombre
    LEFT JOIN 
        adsc_level1 l1 ON l2._1from = l1.nombre
    WHERE 
        l3.nombre = ?
    UNION
    SELECT 
        NULL AS level5,
        NULL AS level4,
        NULL AS level3,
        l2.nombre AS level2,
        l1.nombre AS level1
    FROM 
        adsc_level2 l2
    LEFT JOIN 
        adsc_level1 l1 ON l2._1from = l1.nombre
    WHERE 
        l2.nombre = ?
    UNION
    SELECT 
        NULL AS level5,
        NULL AS level4,
        NULL AS level3,
        NULL AS level2,
        l1.nombre AS level1
    FROM 
        adsc_level1 l1
    WHERE 
        l1.nombre = ?
  `;

  const adscripciones = await querysql(query, [
    departamento,
    departamento,
    departamento,
    departamento,
    departamento,
  ]);

  if (adscripciones.length > 0) {
    return adscripciones.map((adsc) => ({
      level5: adsc.level5 || null,
      level4: adsc.level4 || null,
      level3: adsc.level3 || null,
      level2: adsc.level2 || null,
      level1: adsc.level1 || null,
    }));
  }

  return [];
}

module.exports = getAdscripciones;
