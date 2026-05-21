require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { mkdirSync, existsSync, readdirSync, copyFileSync, unlinkSync, rmSync } = require("fs");

const ROOT_DIR = path.resolve(__dirname, "../..");
const TOOLS_DIR = path.join(ROOT_DIR, "tools");
const SEVEN_ZIP = path.join(TOOLS_DIR, "7zr.exe");
const E_DRIVE = "E:";
const E_DEST = path.join(E_DRIVE, "backup");
const PASSWORD = "SiRh2o26!";
const RETENTION_DAYS = 15;

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function log(msg, type = "INFO") {
  const line = `[${new Date().toISOString()}] [${type}] ${msg}`;
  console.log(line);
  return line;
}

function cleanupOldBackups(dir, prefix) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && (f.endsWith(".zip") || f.endsWith(".7z")))
    .map((f) => ({
      name: f,
      fullPath: path.join(dir, f),
      mtime: fs.statSync(path.join(dir, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length <= RETENTION_DAYS) return;
  const toDelete = files.slice(RETENTION_DAYS);
  for (const f of toDelete) {
    try {
      unlinkSync(f.fullPath);
      log(`Antiguo eliminado: ${f.name}`, "CLEANUP");
    } catch (err) {
      log(`Error eliminando ${f.name}: ${err.message}`, "ERROR");
    }
  }
}

async function createSnapshot() {
  const timestamp = getTimestamp();
  const tmpDir = path.join(ROOT_DIR, "backups", `snapshot_${timestamp}`);
  const zipName = `SNAPSHOT_SIRH_BACKEND_${timestamp}.7z`;
  const zipPath = path.join(ROOT_DIR, "backups", zipName);
  const eZipPath = path.join(E_DEST, zipName);

  const startTime = Date.now();
  const results = { mysql: null, mongo: null, files: null, zip: null, error: null };

  log("=".repeat(60));
  log("  SNAPSHOT COMPLETO - SIRH BACKEND");
  log(`  Inicio: ${new Date().toLocaleString("es-MX")}`);
  log("=".repeat(60));

  try {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    // 1. MongoDB dump
    log("Respaldando MongoDB...");
    const mongoDir = path.join(tmpDir, "mongodb");
    try {
      const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
      const dbName = process.env.DB || "SIRH2026";
      execSync(
        `"${"C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongodump.exe"}" --uri="${mongoUri}" --db="${dbName}" --out="${mongoDir}"`,
        { stdio: "pipe", encoding: "utf-8", timeout: 600000, windowsHide: true }
      );
      let size = 0;
      if (existsSync(mongoDir)) {
        const walk = (d) => { const e = readdirSync(d, { withFileTypes: true }); for (const f of e) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else size += fs.statSync(p).size; } };
        walk(mongoDir);
      }
      results.mongo = { dir: mongoDir, sizeMB: parseFloat((size / 1024 / 1024).toFixed(2)) };
      log(`MongoDB: ${results.mongo.sizeMB} MB`);
    } catch (err) {
      results.mongo = { error: err.message };
      log(`Error MongoDB: ${err.message}`, "ERROR");
    }

    // 2. MySQL dump
    log("Respaldando MySQL...");
    try {
      const sqlFile = path.join(tmpDir, `mysql_sirh_${timestamp}.sql`);
      const dumpPath = "C:\\xampp\\mysql\\bin\\mysqldump.exe";
      const dumpOut = execSync(
        `"${dumpPath}" --host="${process.env.HOSTSQL || "localhost"}" --user="${process.env.USERSQL || "root"}" --port=${process.env.SQLPORT || 3306} "${process.env.SQLDB || "sirh"}" --routines --events --triggers`,
        {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
          timeout: 300000,
          windowsHide: true,
          maxBuffer: 200 * 1024 * 1024,
          env: { ...process.env, MYSQL_PWD: process.env.PWDSQL || "" },
        }
      );
      fs.writeFileSync(sqlFile, dumpOut, "utf-8");
      const size = (fs.statSync(sqlFile).size / 1024 / 1024).toFixed(2);
      results.mysql = { file: sqlFile, sizeMB: parseFloat(size) };
      log(`MySQL: ${size} MB`);
    } catch (err) {
      results.mysql = { error: err.message };
      log(`Error MySQL: ${err.message}`, "ERROR");
    }

    // 3. Copy source code (excluyendo node_modules, .git, backups, logs)
    log("Copiando código fuente...");
    const codeDir = path.join(tmpDir, "backend");
    const excludeDirs = ["node_modules", ".git", "backups", "logs", "tools"];
    const copyDir = (src, dest) => {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      const entries = readdirSync(src, { withFileTypes: true });
      for (const e of entries) {
        if (excludeDirs.includes(e.name)) continue;
        const s = path.join(src, e.name);
        const d = path.join(dest, e.name);
        if (e.isDirectory()) copyDir(s, d);
        else copyFileSync(s, d);
      }
    };
    copyDir(ROOT_DIR, codeDir);
    let fileSize = 0;
    const walkSize = (d) => { const e = readdirSync(d, { withFileTypes: true }); for (const f of e) { const p = path.join(d, f.name); if (f.isDirectory()) walkSize(p); else fileSize += fs.statSync(p).size; } };
    walkSize(codeDir);
    results.files = { dir: codeDir, sizeMB: parseFloat((fileSize / 1024 / 1024).toFixed(2)), files: "OK" };
    log(`Código fuente: ${results.files.sizeMB} MB`);

    // 4. Create password-protected ZIP with 7zr
    log("Creando ZIP cifrado con contraseña...");
    const sevenZipCmd = `"${SEVEN_ZIP}" a -p"${PASSWORD}" -mhe=on "${zipPath}" "${tmpDir}\\*"`;
    log(`Ejecutando: ${SEVEN_ZIP} a -p"***" -mhe=on "${zipName}" ...`);
    try {
      execSync(sevenZipCmd, { stdio: "pipe", encoding: "utf-8", timeout: 600000, windowsHide: true });
      const zSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
      results.zip = { path: zipPath, sizeMB: parseFloat(zSize) };
      log(`ZIP cifrado: ${zSize} MB`);
    } catch (err) {
      throw new Error(`Error creando ZIP cifrado: ${err.message}`);
    }

    // 5. Copy to E:\backup
    log(`Copiando a ${E_DEST}...`);
    if (!existsSync(E_DEST)) {
      mkdirSync(E_DEST, { recursive: true });
      execSync(`attrib +h "${E_DEST}"`, { stdio: "pipe", windowsHide: true });
      log(`Carpeta oculta: ${E_DEST}`);
    }
    fs.copyFileSync(zipPath, eZipPath);
    const eSize = (fs.statSync(eZipPath).size / 1024 / 1024).toFixed(2);
    log(`Copiado a E: (${eSize} MB)`);

    // 6. Cleanup temp
    rmSync(tmpDir, { recursive: true, force: true });

    // 7. Cleanup old backups (local y E:)
    cleanupOldBackups(path.join(ROOT_DIR, "backups"), "SNAPSHOT_SIRH_BACKEND_");
    cleanupOldBackups(E_DEST, "SNAPSHOT_SIRH_BACKEND_");

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`SNAPSHOT COMPLETO EXITOSO en ${duration}s`, "SUCCESS");
    log(`Archivo: ${zipPath}`);
    log(`Copia en: ${eZipPath}`);
    log(`Contraseña: ${PASSWORD}`);
    log("=".repeat(60));

    return { success: true, zipPath, eZipPath, results, duration: parseFloat(duration) };

  } catch (err) {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    results.error = err.message;
    log(`ERROR: ${err.message}`, "ERROR");
    log("=".repeat(60));
    return { success: false, results, error: err.message };
  }
}

// ---- STANDALONE ----
if (require.main === module) {
  (async () => {
    const r = await createSnapshot();
    process.exit(r.success ? 0 : 1);
  })();
}

module.exports = { createSnapshot };
