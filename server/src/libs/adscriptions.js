const { querysql } = require("../config/mysql");

async function getAdscripciones(departamento) {
  // Consulta para obtener adscripciones de nivel 5
  const level5Query = `
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
  `;
  const level5Adscripciones = await querysql(level5Query, [departamento]);

  if (level5Adscripciones.length > 0) {
    return level5Adscripciones.map((adsc) => ({
      level5: adsc.level5,
      level4: adsc.level4,
      level3: adsc.level3,
      level2: adsc.level2,
      level1: adsc.level1,
    }));
  }

  // Consulta para obtener adscripciones de nivel 4
  const level4Query = `
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
  `;
  const level4Adscripciones = await querysql(level4Query, [departamento]);

  if (level4Adscripciones.length > 0) {
    return level4Adscripciones.map((adsc) => ({
      level5: null,
      level4: adsc.level4,
      level3: adsc.level3,
      level2: adsc.level2,
      level1: adsc.level1,
    }));
  }

  // Consulta para obtener adscripciones de nivel 3
  const level3Query = `
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
  `;
  const level3Adscripciones = await querysql(level3Query, [departamento]);

  if (level3Adscripciones.length > 0) {
    return level3Adscripciones.map((adsc) => ({
      level5: null,
      level4: null,
      level3: adsc.level3,
      level2: adsc.level2,
      level1: adsc.level1,
    }));
  }

  // Consulta para obtener adscripciones de nivel 2
  const level2Query = `
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
  `;
  const level2Adscripciones = await querysql(level2Query, [departamento]);

  if (level2Adscripciones.length > 0) {
    return level2Adscripciones.map((adsc) => ({
      level5: null,
      level4: null,
      level3: null,
      level2: adsc.level2,
      level1: adsc.level1,
    }));
  }

  // Consulta para obtener adscripciones de nivel 1
  const level1Query = `
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
  const level1Adscripciones = await querysql(level1Query, [departamento]);

  return level1Adscripciones.map((adsc) => ({
    level5: null,
    level4: null,
    level3: null,
    level2: null,
    level1: adsc.level1,
  }));
}

module.exports = getAdscripciones;
