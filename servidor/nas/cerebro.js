// LAP Cerebro en un NAS (Docker). Hace lo mismo que la app en el PC servidor:
// arranca el servidor solo, responde a los PC que lo buscan en la red y se actualiza solo
// con cada versión publicada en GitHub Releases.
//
//   node /data/cerebro.js                         arranca el servidor (lo usa docker-compose.yml)
//   node /data/cerebro.js maestro correo clave "Nombre"   crea o recupera el perfil maestro
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { createHost } = require("./host");

const DATA = process.env.DATA_DIR || "/data";
const APP = path.join(DATA, "app");
const REPO = process.env.LAP_REPO || "Diegondre18/REA";
const LATEST_URL = process.env.LAP_LATEST_URL || `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_BASE = process.env.LAP_DOWNLOAD_BASE || `https://github.com/${REPO}/releases/download`;
const PB_BASE = process.env.PB_DOWNLOAD_BASE || "https://github.com/pocketbase/pocketbase/releases/download";
const CHECK_HOURS = Number(process.env.LAP_CHECK_HOURS || 6);
const ARCH = { x64: "amd64", arm64: "arm64", arm: "armv7" }[process.arch] || "amd64";

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const read = (f) => { try { return fs.readFileSync(f, "utf8").trim(); } catch (e) { return ""; } };

async function download(url, file) {
  const res = await fetch(url, { headers: { "User-Agent": "lap-cerebro-nas" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
const unzip = (zip, dir) => { fs.mkdirSync(dir, { recursive: true }); execFileSync("unzip", ["-o", "-q", zip, "-d", dir]); };

// Instala la última versión publicada si es distinta de la instalada.
// Devuelve { changed, selfChanged }: selfChanged indica que cambió este mismo programa.
async function installLatest() {
  const res = await fetch(LATEST_URL, { headers: { "User-Agent": "lap-cerebro-nas", Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`no se pudo consultar la última versión (${res.status})`);
  const tag = (await res.json()).tag_name;
  if (!tag) throw new Error("la respuesta no trae versión");
  if (tag === read(path.join(APP, "VERSION")) && fs.existsSync(path.join(APP, "bin", "pocketbase"))) return { changed: false };

  log(`instalando la versión ${tag}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lap-"));
  try {
    await download(`${DOWNLOAD_BASE}/${tag}/LAP-Cerebro-Reglas.zip`, path.join(tmp, "reglas.zip"));
    unzip(path.join(tmp, "reglas.zip"), path.join(tmp, "nuevo"));
    const nuevo = path.join(tmp, "nuevo");
    const pbVersion = read(path.join(nuevo, "PB_VERSION"));
    fs.mkdirSync(path.join(APP, "bin"), { recursive: true });
    if (pbVersion && (pbVersion !== read(path.join(APP, "PB_VERSION")) || !fs.existsSync(path.join(APP, "bin", "pocketbase")))) {
      log(`descargando PocketBase ${pbVersion} (${ARCH})`);
      await download(`${PB_BASE}/v${pbVersion}/pocketbase_${pbVersion}_linux_${ARCH}.zip`, path.join(tmp, "pb.zip"));
      unzip(path.join(tmp, "pb.zip"), path.join(tmp, "pb"));
      fs.copyFileSync(path.join(tmp, "pb", "pocketbase"), path.join(APP, "bin", "pocketbase.nuevo"));
      fs.chmodSync(path.join(APP, "bin", "pocketbase.nuevo"), 0o755);
      fs.renameSync(path.join(APP, "bin", "pocketbase.nuevo"), path.join(APP, "bin", "pocketbase"));
      fs.writeFileSync(path.join(APP, "PB_VERSION"), pbVersion);
    }
    for (const dir of ["pb_migrations", "pb_hooks"]) {
      fs.rmSync(path.join(APP, dir), { recursive: true, force: true });
      fs.cpSync(path.join(nuevo, dir), path.join(APP, dir), { recursive: true });
    }
    // Este mismo programa también se actualiza; Docker lo vuelve a arrancar ya actualizado.
    let selfChanged = false;
    for (const f of ["cerebro.js", "host.js"]) {
      const src = path.join(nuevo, "nas", f);
      if (fs.existsSync(src) && read(src) !== read(path.join(DATA, f))) { fs.copyFileSync(src, path.join(DATA, f)); selfChanged = true; }
    }
    fs.writeFileSync(path.join(APP, "VERSION"), tag);
    log(`versión ${tag} instalada`);
    return { changed: true, selfChanged };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function makeHost() {
  return createHost({
    bin: path.join(APP, "bin", "pocketbase"),
    dataDir: path.join(DATA, "pb_data"),
    migrationsDir: path.join(APP, "pb_migrations"),
    hooksDir: path.join(APP, "pb_hooks"),
    logFile: path.join(DATA, "servidor.log"),
  });
}

async function serve() {
  try { await installLatest(); } catch (e) {
    if (!fs.existsSync(path.join(APP, "bin", "pocketbase"))) { log("no se pudo instalar el servidor: " + e.message + ". Se reintenta en 1 minuto."); setTimeout(() => process.exit(1), 60000); return; }
    log("sin conexión para buscar versiones nuevas (" + e.message + "); sigue la versión instalada");
  }
  let host = makeHost();
  const r = await host.start(60000);
  if (!r.ok) { log("el servidor no arrancó: " + r.error); setTimeout(() => process.exit(1), 30000); return; }
  log(`servidor listo en el puerto ${host.PORT} (${host.status().addresses.join(", ") || "sin red"}) · versión ${read(path.join(APP, "VERSION"))}`);

  if (process.env.MAESTRO_EMAIL && process.env.MAESTRO_PASSWORD) {
    const m = await host.maestro(process.env.MAESTRO_EMAIL, process.env.MAESTRO_PASSWORD, process.env.MAESTRO_NAME || "Soporte LAP");
    log("perfil maestro: " + m.message);
  }

  setInterval(async () => {
    try {
      const u = await installLatest();
      if (!u.changed) return;
      host.stop();
      if (u.selfChanged) { log("reiniciando con la versión nueva"); process.exit(0); }
      host = makeHost();
      const again = await host.start(60000);
      log(again.ok ? "servidor actualizado y en marcha" : "el servidor no arrancó tras actualizar: " + again.error);
    } catch (e) { log("búsqueda de versiones: " + e.message); }
  }, CHECK_HOURS * 3600 * 1000);

  const stop = () => { host.stop(); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

async function maestro([email, password, ...name]) {
  if (!email || !password) { console.log('Uso: node /data/cerebro.js maestro correo contraseña "Nombre"'); process.exit(1); }
  const r = await makeHost().maestro(email, password, name.join(" ") || "Soporte LAP");
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}

const [cmd, ...rest] = process.argv.slice(2);
(cmd === "maestro" ? maestro(rest) : serve()).catch((e) => { log("error: " + e.message); process.exit(1); });
