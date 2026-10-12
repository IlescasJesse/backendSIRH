#!/usr/bin/env node
/**
 * Versionado automático (lo corre la CI en cada push a la rama de producción).
 *
 * 1. Toma el último tag vX.Y.Z y los commits nuevos desde ahí.
 * 2. Decide qué número sube según el mensaje de los commits (ver VERSIONADO.md):
 *      [modulo] → MAYOR · [nueva] → MENOR · sin etiqueta → ARREGLO
 * 3. Escribe la versión en los archivos indicados y agrega la entrada a CHANGELOG.md.
 * 4. Con --push <rama>: commit "chore(release): vX.Y.Z [skip ci]", tag vX.Y.Z y push.
 *
 * Uso: node scripts/release.mjs [--push <rama>] [--dry-run] <archivos de versión...>
 *   - package.json / package-lock.json → campo "version" (y workspaces del lock)
 *   - cualquier otro archivo → reemplaza APP_VERSION = '...' / "..."
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const pushIdx = argv.indexOf("--push");
const branch = pushIdx >= 0 ? argv[pushIdx + 1] : null;
const files = argv.filter((a, i) => !a.startsWith("--") && !(pushIdx >= 0 && i === pushIdx + 1));

// Commits de la CI o del propio versionado no cuentan como cambios
const IGNORADOS = /^(chore\((release|ci)\)|Merge )/;

const ultimoTag = sh('git describe --tags --abbrev=0 --match "v[0-9]*.[0-9]*.[0-9]*"');
const [mayor, menor, arreglo] = ultimoTag.slice(1).split(".").map(Number);

const commits = sh(`git log ${ultimoTag}..HEAD --no-merges --format=%h%x1f%an%x1f%s%x1e`)
  .split("\x1e")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [hash, autor, mensaje] = l.split("\x1f");
    return { hash, autor, mensaje };
  })
  .filter((c) => !IGNORADOS.test(c.mensaje));

if (commits.length === 0) {
  console.log(`Sin cambios desde ${ultimoTag}; no se genera versión.`);
  process.exit(0);
}

const tiene = (re) => commits.some((c) => re.test(c.mensaje));
let tipo, nueva;
if (tiene(/\[modulo\]/i)) {
  tipo = "MAYOR";
  nueva = `${mayor + 1}.0.0`;
} else if (tiene(/\[nueva\]/i)) {
  tipo = "MENOR";
  nueva = `${mayor}.${menor + 1}.0`;
} else {
  tipo = "ARREGLO";
  nueva = `${mayor}.${menor}.${arreglo + 1}`;
}
const tag = `v${nueva}`;
console.log(`${ultimoTag} → ${tag} (${tipo}, ${commits.length} commit(s))`);

// ── Archivos de versión ──────────────────────────────────────────────────────
const escribir = (ruta, texto) => {
  if (!dryRun) fs.writeFileSync(ruta, texto);
};

for (const ruta of files) {
  if (!fs.existsSync(ruta)) {
    console.log(`  (no existe, se omite) ${ruta}`);
    continue;
  }
  const original = fs.readFileSync(ruta, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  if (ruta.endsWith(".json")) {
    const json = JSON.parse(original);
    json.version = nueva;
    if (ruta.endsWith("package-lock.json") && json.packages) {
      // raíz ("") y workspaces propios (rutas sin node_modules)
      for (const [clave, pkg] of Object.entries(json.packages)) {
        if (!clave.includes("node_modules") && pkg.version !== undefined) pkg.version = nueva;
      }
    }
    escribir(ruta, JSON.stringify(json, null, 2).replace(/\n/g, eol) + eol);
  } else {
    const nuevoTexto = original.replace(/(APP_VERSION\s*=\s*)(['"])[^'"]*\2/, `$1$2${nueva}$2`);
    if (nuevoTexto === original) console.log(`  (sin APP_VERSION) ${ruta}`);
    escribir(ruta, nuevoTexto);
  }
  console.log(`  versión → ${ruta}`);
}

// ── CHANGELOG.md ─────────────────────────────────────────────────────────────
const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const quitarEtiqueta = (m) => m.replace(/\[(modulo|nueva)\]\s*/i, "");
const entrada =
  `## ${tag} — ${fecha} · ${tipo}\n\n` +
  commits.map((c) => `- ${quitarEtiqueta(c.mensaje)} — ${c.autor} (\`${c.hash}\`)`).join("\n") +
  "\n";

const RUTA_CHANGELOG = "CHANGELOG.md";
const ENCABEZADO = "# Changelog\n\nVersiones generadas automáticamente al hacer push (ver VERSIONADO.md).\n";
let changelog = fs.existsSync(RUTA_CHANGELOG)
  ? fs.readFileSync(RUTA_CHANGELOG, "utf8").replace(/\r\n/g, "\n")
  : ENCABEZADO;
const primeraVersion = changelog.indexOf("\n## ");
changelog =
  primeraVersion >= 0
    ? changelog.slice(0, primeraVersion + 1) + entrada + "\n" + changelog.slice(primeraVersion + 1)
    : changelog.trimEnd() + "\n\n" + entrada;
escribir(RUTA_CHANGELOG, changelog);
console.log(`  entrada → ${RUTA_CHANGELOG}`);

if (dryRun) {
  console.log("\n--- dry-run: no se escribió nada ---\n" + entrada);
  process.exit(0);
}

// ── Commit, tag y push ───────────────────────────────────────────────────────
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${nueva}\n`);
if (!branch) process.exit(0);

execSync(`git add ${[...files.filter((f) => fs.existsSync(f)), RUTA_CHANGELOG].map((f) => `"${f}"`).join(" ")}`);
execSync(`git commit -m "chore(release): ${tag} [skip ci]"`, { stdio: "inherit" });
fs.writeFileSync(".release-notes.tmp", `${tag} (${tipo})\n\n${entrada}`);
execSync(`git tag -a ${tag} -F .release-notes.tmp`);
fs.unlinkSync(".release-notes.tmp");
execSync(`git push origin HEAD:${branch}`, { stdio: "inherit" });
execSync(`git push origin ${tag}`, { stdio: "inherit" });
console.log(`Publicada ${tag}`);
