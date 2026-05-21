require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { createWriteStream, mkdirSync, existsSync, readdirSync, unlinkSync, rmSync } = require("fs");

const BACKUP_DIR = path.resolve(__dirname, "../../backups");
const RETENTION_DAYS = 7;
const MYSQLDUMP_PATH = "C:\\xampp\\mysql\\bin\\mysqldump.exe";
const MONGODUMP_PATH = "C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongodump.exe";

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function log(msg, type = "INFO") {
  const line = `[${new Date().toISOString()}] [${type}] ${msg}`;
  console.log(line);
  return line;
}

function cleanupOldBackups() {
  if (!existsSync(BACKUP_DIR)) return;
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => ({
      name: f,
      fullPath: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length <= RETENTION_DAYS) return;

  const toDelete = files.slice(RETENTION_DAYS);
  for (const f of toDelete) {
    try {
      unlinkSync(f.fullPath);
      log(`Backup antiguo eliminado: ${f.name}`, "CLEANUP");
    } catch (err) {
      log(`Error eliminando ${f.name}: ${err.message}`, "ERROR");
    }
  }
}

async function runBackup({ onLog } = {}) {
  const emit = onLog || log;
  const timestamp = getTimestamp();
  const dateStr = getDateStr();
  const tmpDir = path.join(BACKUP_DIR, `tmp_${timestamp}`);
  const backupName = `backup_sirh_${timestamp}`;
  const zipPath = path.join(BACKUP_DIR, `${backupName}.zip`);

  const results = { mysql: null, mongo: null, zip: null, error: null };
  const startTime = Date.now();

  try {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    // 1. MySQL dump (usando MYSQL_PWD para evitar problemas de escaping)
    const sqlFile = path.join(tmpDir, `mysql_sirh_${timestamp}.sql`);
    emit("Respaldando MySQL (sirh)...");
    try {
      const dumpOut = execSync(
        `"${MYSQLDUMP_PATH}" --host="${process.env.HOSTSQL || "localhost"}" --user="${process.env.USERSQL || "root"}" --port=${process.env.SQLPORT || 3306} "${process.env.SQLDB || "sirh"}" --routines --events --triggers`,
        {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
          timeout: 300000,
          windowsHide: true,
          maxBuffer: 200 * 1024 * 1024,
          env: {
            ...process.env,
            MYSQL_PWD: process.env.PWDSQL || "",
          },
        }
      );
      fs.writeFileSync(sqlFile, dumpOut, "utf-8");
      const sqlSize = (fs.statSync(sqlFile).size / 1024 / 1024).toFixed(2);
      results.mysql = { file: sqlFile, sizeMB: parseFloat(sqlSize) };
      emit(`MySQL respaldado: ${sqlSize} MB`);
    } catch (err) {
      results.mysql = { error: err.message };
      emit(`Error respaldando MySQL: ${err.message}`, "ERROR");
    }

    // 2. MongoDB dump (usando URI + nsInclude para compatibilidad)
    const mongoDir = path.join(tmpDir, "mongo_sirh2026");
    emit("Respaldando MongoDB (SIRH2026)...");
    try {
      const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
      const dbName = process.env.DB || "SIRH2026";
      execSync(
        `"${MONGODUMP_PATH}" --uri="${mongoUri}" --nsInclude="${dbName}.*" --out="${mongoDir}"`,
        {
          stdio: "pipe",
          encoding: "utf-8",
          timeout: 600000,
          windowsHide: true,
        }
      );
      let mongoSize = 0;
      if (existsSync(mongoDir)) {
        const walkDir = (dir) => {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walkDir(full);
            else mongoSize += fs.statSync(full).size;
          }
        };
        walkDir(mongoDir);
      }
      results.mongo = { dir: mongoDir, sizeMB: parseFloat((mongoSize / 1024 / 1024).toFixed(2)) };
      emit(`MongoDB respaldado: ${results.mongo.sizeMB} MB`);
    } catch (err) {
      results.mongo = { error: err.message };
      emit(`Error respaldando MongoDB: ${err.message}`, "ERROR");
    }

    // 3. Create final ZIP
    emit("Comprimiendo backup...");
    await new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        results.zip = { path: zipPath, sizeMB: parseFloat((archive.pointer() / 1024 / 1024).toFixed(2)) };
        emit(`Backup comprimido: ${results.zip.sizeMB} MB`);
        resolve();
      });

      archive.on("error", (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(tmpDir, backupName);
      archive.finalize();
    });

    // 4. Cleanup temp
    rmSync(tmpDir, { recursive: true, force: true });

    // 5. Cleanup old backups
    cleanupOldBackups();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    emit(`Backup completado en ${duration}s → ${zipPath}`, "SUCCESS");
    results.duration = parseFloat(duration);

    return { success: true, results, zipPath };

  } catch (err) {
    // Cleanup temp on error
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    results.error = err.message;
    emit(`Error en backup: ${err.message}`, "ERROR");
    return { success: false, results, error: err.message };
  }
}

// ---- STANDALONE EXECUTION ----
if (require.main === module) {
  (async () => {
    console.log("=".repeat(60));
    console.log("  BACKUP MANUAL - SIRH");
    console.log("=".repeat(60));
    const result = await runBackup();
    console.log("-".repeat(60));
    console.log(`Estado: ${result.success ? "✓ EXITOSO" : "✗ FALLIDO"}`);
    if (result.zipPath) console.log(`Archivo: ${result.zipPath}`);
    if (result.error) console.log(`Error: ${result.error}`);
    console.log("=".repeat(60));
    process.exit(result.success ? 0 : 1);
  })();
}

module.exports = { runBackup };
