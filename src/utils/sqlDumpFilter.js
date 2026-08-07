const readline = require("readline");

// Filtra, línea a línea, las sentencias (CREATE/INSERT/DROP/LOCK/ALTER TABLE)
// de las tablas indicadas dentro de un dump de MySQL/mariadb (mysqldump o
// phpMyAdmin). Soporta sentencias de varias líneas (ej. INSERT con muchas
// tuplas): sigue "saltando" hasta la línea que termina en ";".
function buildLineFilter(excludedTables) {
  if (!excludedTables?.length) return () => true;

  const tablesPattern = excludedTables.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const startPattern = new RegExp(
    `(CREATE TABLE|INSERT INTO|DROP TABLE(?: IF EXISTS)?|LOCK TABLES|ALTER TABLE)\\s+\`(${tablesPattern})\``,
    "i"
  );
  let skipping = false;

  return function keepLine(line) {
    if (skipping) {
      if (/;\s*$/.test(line)) skipping = false;
      return false;
    }
    if (startPattern.test(line)) {
      skipping = !/;\s*$/.test(line);
      return false;
    }
    return true;
  };
}

// Lee `sourceStream` línea por línea, escribe en `destStream` todo excepto
// las sentencias de `excludedTables`. Cierra destStream al terminar salvo
// que endDest:false (ej. cuando el caller necesita escribir un suffix
// después, como "SET FOREIGN_KEY_CHECKS=1;").
function pipeFilteredSql(sourceStream, destStream, excludedTables = [], { endDest = true } = {}) {
  return new Promise((resolve, reject) => {
    const keepLine = buildLineFilter(excludedTables);
    const rl = readline.createInterface({ input: sourceStream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (keepLine(line)) destStream.write(line + "\n");
    });
    rl.on("close", () => {
      if (endDest) destStream.end();
      resolve();
    });
    rl.on("error", reject);
    sourceStream.on("error", reject);
    destStream.on("error", reject);
  });
}

module.exports = { pipeFilteredSql, buildLineFilter };
