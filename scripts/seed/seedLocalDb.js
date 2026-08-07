#!/usr/bin/env node
// Carga la base local (MySQL + MongoDB) desde un dump ya existente, para
// desarrollo/pruebas. Por defecto lee de D:\BD_FINAL:
//   D:\BD_FINAL\sirh.sql        -> MySQL, base `sirh` (o SQLDB del .env)
//   D:\BD_FINAL\SIRH2026\       -> MongoDB, base `SIRH2026` (o DB del .env)
//
// Uso: npm run seed:local
// Ruta distinta: SEED_SOURCE_DIR="D:\otra\ruta" npm run seed:local

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pipeFilteredSql } = require("../../src/utils/sqlDumpFilter");

require("dotenv").config();

const SOURCE_DIR = process.env.SEED_SOURCE_DIR || "D:\\BD_FINAL";
const MYSQL_DUMP_FILE = path.join(SOURCE_DIR, "sirh.sql");
const MONGO_DUMP_DIR = path.join(SOURCE_DIR, "SIRH2026");

// Catálogo estático (códigos postales), ~145k filas, no lo usa ningún
// reporte y hace lenta la restauración local sin necesidad.
const EXCLUDED_MYSQL_TABLES = ["cp_2025"];

const MYSQL_HOST = process.env.HOSTSQL || "localhost";
const MYSQL_USER = process.env.USERSQL || "root";
const MYSQL_DB = process.env.SQLDB || "sirh";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB = process.env.DB || "SIRH2026";

function mysqlEnv() {
  const env = { ...process.env };
  if (process.env.PWDSQL) env.MYSQL_PWD = process.env.PWDSQL;
  return env;
}

function run(cmd, args, { stdinFile, prefix, suffix, excludeTables } = {}) {
  return new Promise((resolve, reject) => {
    const needsStdin = Boolean(stdinFile);
    const child = spawn(cmd, args, {
      stdio: [needsStdin ? "pipe" : "inherit", "inherit", "inherit"],
      env: mysqlEnv(),
    });

    if (needsStdin) {
      if (prefix) child.stdin.write(prefix);
      const fileStream = fs.createReadStream(stdinFile);
      fileStream.on("error", reject);

      if (excludeTables?.length) {
        pipeFilteredSql(fileStream, child.stdin, excludeTables, { endDest: !suffix })
          .then(() => {
            if (suffix) child.stdin.end(suffix);
          })
          .catch(reject);
      } else {
        fileStream.pipe(child.stdin, { end: !suffix });
        if (suffix) {
          fileStream.on("end", () => child.stdin.end(suffix));
        }
      }
    }

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        return reject(new Error(`"${cmd}" no está instalado / no está en PATH`));
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} salió con código ${code}`));
    });
  });
}

async function seedMysql() {
  if (!fs.existsSync(MYSQL_DUMP_FILE)) {
    console.log(`⏭  Sin dump MySQL en ${MYSQL_DUMP_FILE}, se omite`);
    return;
  }

  console.log(`→ MySQL: creando/limpiando base "${MYSQL_DB}" e importando ${MYSQL_DUMP_FILE}`);

  await run("mysql", [
    "-h", MYSQL_HOST,
    "-u", MYSQL_USER,
    "-e", `DROP DATABASE IF EXISTS \`${MYSQL_DB}\`; CREATE DATABASE \`${MYSQL_DB}\`;`,
  ]);

  // El dump trae al menos una FK inválida en MySQL 8 (columna referenciada
  // sin índice único; el dump se generó desde MariaDB, más permisivo).
  // FOREIGN_KEY_CHECKS=0 no evita ese error porque MySQL exige el índice al
  // crear la constraint, no solo al validar datos. --force hace que mysql
  // siga con el resto del dump aunque esa(s) sentencia(s) puntual(es) fallen;
  // no modifica el esquema real, solo el comportamiento de esta carga local.
  await run(
    "mysql",
    ["-h", MYSQL_HOST, "-u", MYSQL_USER, "--force", MYSQL_DB],
    {
      stdinFile: MYSQL_DUMP_FILE,
      prefix: "SET FOREIGN_KEY_CHECKS=0;\n",
      suffix: "\nSET FOREIGN_KEY_CHECKS=1;\n",
      excludeTables: EXCLUDED_MYSQL_TABLES,
    },
  );

  console.log("✓ MySQL restaurado");
}

async function seedMongo() {
  if (!fs.existsSync(MONGO_DUMP_DIR)) {
    console.log(`⏭  Sin dump Mongo en ${MONGO_DUMP_DIR}, se omite`);
    return;
  }

  console.log(`→ MongoDB: restaurando base "${MONGO_DB}" desde ${MONGO_DUMP_DIR}`);

  const mongorestoreBin =
    process.env.MONGORESTORE_BIN ||
    (fs.existsSync("C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongorestore.exe")
      ? "C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongorestore.exe"
      : "mongorestore");

  await run(mongorestoreBin, [
    `--uri=${MONGO_URI}`,
    `--db=${MONGO_DB}`,
    "--drop",
    MONGO_DUMP_DIR,
  ]);

  console.log("✓ MongoDB restaurado");
}

(async () => {
  try {
    await seedMysql();
    await seedMongo();
    console.log("\nSeed local completo.");
  } catch (error) {
    console.error("\nError en seed local:", error.message);
    process.exitCode = 1;
  }
})();
