const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const zlib = require("zlib");
const { pipeFilteredSql } = require("../utils/sqlDumpFilter");

// Catálogo estático (códigos postales), ~145k filas, no lo usa ningún
// reporte y hace lenta la restauración sin necesidad. Se excluye del import.
const EXCLUDED_MYSQL_TABLES = ["cp_2025"];

// La ruta de backups vive por completo en BACKUP_DIR (.env), distinto por
// ambiente (local vs server Ubuntu). Si no está definida, cae a una carpeta
// por defecto en la raíz del proyecto (solo como último recurso).
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "..", "..", "backups", "db");
const SOURCE_DB = "SIRH2026";
const TEMP_DB = "SIRH2026_BK";
const MYSQL_TEMP_DB = "sirh_bk";
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Colecciones que usa el reporte de plantilla por área (getPlantillaReportArea)
const COLECCIONES_REPORTE_PLANTILLA = [
  "PLANTILLA",
  "BAJAS",
  "LICENCIAS",
  "PERSONAL_GASADMI",
  "PERSONAL_ESTIMULO",
];

function assertFechaValida(fecha) {
  if (!FECHA_REGEX.test(fecha)) {
    throw new Error("Fecha de backup inválida");
  }
}

// En Ubuntu (prod) "mongorestore" ya está en PATH. En Windows (dev), MongoDB
// Database Tools no siempre queda en PATH tras instalarse; se puede fijar
// MONGORESTORE_BIN en .env, o cae a la ruta típica del instalador oficial.
function resolveMongorestoreBin() {
  if (process.env.MONGORESTORE_BIN) return process.env.MONGORESTORE_BIN;
  const winDefault = "C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongorestore.exe";
  if (process.platform === "win32" && fsSync.existsSync(winDefault)) {
    return winDefault;
  }
  return "mongorestore";
}

function runMongorestore(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(
      resolveMongorestoreBin(),
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            return reject(new Error("mongorestore excedió el tiempo de espera"));
          }
          if (error.code === "ENOENT") {
            return reject(new Error("mongorestore no está instalado en este servidor"));
          }
          return reject(new Error(stderr?.trim() || error.message));
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function mysqlEnv() {
  const env = { ...process.env };
  if (process.env.PWDSQL) env.MYSQL_PWD = process.env.PWDSQL;
  return env;
}

function mysqlArgs(extra = []) {
  return [
    "-h", process.env.HOSTSQL || "localhost",
    "-u", process.env.USERSQL || "root",
    "-P", String(process.env.SQLPORT || "3306"),
    ...extra,
  ];
}

function runMysqlCommand(extraArgs, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile(
      "mysql",
      mysqlArgs(extraArgs),
      { env: mysqlEnv(), timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            return reject(new Error("mysql excedió el tiempo de espera"));
          }
          if (error.code === "ENOENT") {
            return reject(new Error("cliente mysql no está instalado en este servidor"));
          }
          return reject(new Error(stderr?.trim() || error.message));
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

async function listBackupDates() {
  let entries;
  try {
    entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  } catch (err) {
    throw new Error(`No se pudo leer el directorio de backups: ${err.message}`);
  }

  return entries
    .filter((e) => e.isDirectory() && FECHA_REGEX.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a));
}

async function archivePathForDate(fecha) {
  assertFechaValida(fecha);
  const archivePath = path.join(BACKUP_DIR, fecha, "mongo_SIRH2026.archive");
  try {
    await fs.access(archivePath);
  } catch {
    throw new Error(`No existe backup de Mongo para la fecha ${fecha}`);
  }
  return archivePath;
}

async function dumpPathForDate(fecha) {
  assertFechaValida(fecha);
  const dumpPath = path.join(BACKUP_DIR, fecha, "mysql_sirh.sql.gz");
  try {
    await fs.access(dumpPath);
  } catch {
    throw new Error(`No existe backup de MySQL para la fecha ${fecha}`);
  }
  return dumpPath;
}

// Restaura las colecciones indicadas del backup de Mongo de `fecha` hacia la
// base temporal SIRH2026_BK (nunca toca SIRH2026 real). Llama onProgress()
// antes de cada colección para que el caller le avise al frontend.
async function restoreMongoCollections(fecha, colecciones = COLECCIONES_REPORTE_PLANTILLA, onProgress) {
  const archivePath = await archivePathForDate(fecha);

  for (const coleccion of colecciones) {
    onProgress?.(`Restaurando ${coleccion} (Mongo) del backup ${fecha}...`);
    await runMongorestore([
      `--archive=${archivePath}`,
      "--gzip",
      "--drop",
      `--nsInclude=${SOURCE_DB}.${coleccion}`,
      `--nsFrom=${SOURCE_DB}.${coleccion}`,
      `--nsTo=${TEMP_DB}.${coleccion}`,
    ]);
  }

  return TEMP_DB;
}

// Restaura el dump completo de MySQL (catálogos de sueldo/ISR/adscripciones)
// del backup de `fecha` hacia la base temporal `sirh_bk`.
async function restoreMysqlCatalogos(fecha, onProgress) {
  const dumpPath = await dumpPathForDate(fecha);

  onProgress?.(`Restaurando catálogos de sueldo/ISR (MySQL) del backup ${fecha}...`);

  await runMysqlCommand([
    "-e",
    `DROP DATABASE IF EXISTS \`${MYSQL_TEMP_DB}\`; CREATE DATABASE \`${MYSQL_TEMP_DB}\`;`,
  ]);

  await new Promise((resolve, reject) => {
    const mysqlProc = spawn("mysql", mysqlArgs([MYSQL_TEMP_DB]), { env: mysqlEnv() });
    const gunzip = zlib.createGunzip();
    const fileStream = fsSync.createReadStream(dumpPath);

    let stderr = "";
    mysqlProc.stderr.on("data", (d) => (stderr += d.toString()));
    mysqlProc.on("error", reject);
    mysqlProc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Restauración de MySQL salió con código ${code}`));
    });

    fileStream.on("error", reject);
    gunzip.on("error", reject);
    fileStream.pipe(gunzip);
    pipeFilteredSql(gunzip, mysqlProc.stdin, EXCLUDED_MYSQL_TABLES).catch(reject);
  });

  return MYSQL_TEMP_DB;
}

async function dropMysqlTempDatabase() {
  await runMysqlCommand(["-e", `DROP DATABASE IF EXISTS \`${MYSQL_TEMP_DB}\`;`]);
}

module.exports = {
  BACKUP_DIR,
  TEMP_DB,
  MYSQL_TEMP_DB,
  COLECCIONES_REPORTE_PLANTILLA,
  listBackupDates,
  archivePathForDate,
  restoreMongoCollections,
  restoreMysqlCatalogos,
  dropMysqlTempDatabase,
};
