// Respaldo externo del estudio. En el PC servidor, una vez al día se pide al servidor una copia completa
// de la base y se lleva a la carpeta elegida (disco externo o NAS). Se guardan las últimas 30.
// Si la carpeta no está (disco desconectado, NAS apagado) se reintenta cada media hora y Dirección recibe aviso.
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");

const KEEP = 30;
const EVERY_MS = 22 * 3600e3; // "una vez al día", aunque el PC se prenda a horas distintas
const PATTERN = /^lap_\d{8}_\d{6}\.zip$/;

function createBackups({ app, getHost, isHosting, onChange }) {
  const prefsFile = () => path.join(app.getPath("userData"), "respaldo.json");
  const dataDir = () => getHost().status().dataDir;
  let prefs = { dir: "", keep: KEEP, last: null, lastOk: null };
  let running = null;

  async function load() { try { prefs = { ...prefs, ...JSON.parse(await fs.readFile(prefsFile(), "utf8")) }; } catch (e) { /* primera vez */ } }
  const save = () => fs.writeFile(prefsFile(), JSON.stringify(prefs, null, 2)).catch(() => {});

  // Clave que solo conocen la app y el servidor de este PC.
  async function key() {
    const f = path.join(dataDir(), "lap_respaldo.key");
    try { const k = (await fs.readFile(f, "utf8")).trim(); if (k) return k; } catch (e) { /* se crea */ }
    const k = crypto.randomBytes(24).toString("hex");
    await fs.mkdir(dataDir(), { recursive: true });
    await fs.writeFile(f, k);
    return k;
  }
  async function call(route, body) {
    const h = getHost();
    const r = await fetch(h.localUrl + route, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Lap-Respaldo": await key() },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "El servidor no respondió (" + r.status + ").");
    return data;
  }

  async function list() {
    if (!prefs.dir) return [];
    try {
      const names = (await fs.readdir(prefs.dir)).filter((n) => PATTERN.test(n)).sort().reverse();
      const out = [];
      for (const n of names) { const s = await fs.stat(path.join(prefs.dir, n)).catch(() => null); if (s) out.push({ name: n, size: s.size, at: s.mtime.toISOString() }); }
      return out;
    } catch (e) { return []; }
  }

  async function status() {
    const hosting = await isHosting();
    let reachable = false;
    if (prefs.dir) reachable = await fs.access(prefs.dir, fsSync.constants.W_OK).then(() => true, () => false);
    return { hosting, dir: prefs.dir, keep: prefs.keep, last: prefs.last, lastOk: prefs.lastOk, running: !!running, reachable, files: hosting ? await list() : [] };
  }

  function human(err, dir) {
    const m = String((err && err.message) || err || "");
    if (/ENOENT|ENOTDIR/i.test(m)) return `No se encontró la carpeta ${dir}. ¿El disco externo o el NAS están conectados?`;
    if (/EACCES|EPERM/i.test(m)) return `Windows no deja escribir en ${dir}. Elige otra carpeta o revisa los permisos.`;
    if (/ENOSPC/i.test(m)) return `No hay espacio en ${dir}. Libera espacio o elige otro disco.`;
    if (/fetch failed|ECONNREFUSED/i.test(m)) return "El servidor de este PC no está corriendo.";
    return "No se pudo hacer el respaldo: " + m.split("\n")[0].slice(0, 200);
  }

  async function run(motivo = "auto") {
    if (running) return running;
    running = (async () => {
      const dir = prefs.dir;
      const result = { at: new Date().toISOString(), ok: false, motivo, archivo: "", tamano: 0, destino: dir, error: "" };
      try {
        if (!(await isHosting())) throw new Error("Este PC no es el servidor del estudio.");
        if (!dir) throw new Error("Elige primero la carpeta del respaldo.");
        await fs.access(dir, fsSync.constants.W_OK);
        const { name } = await call("/api/lap/respaldo/crear");
        const src = path.join(dataDir(), "backups", name);
        const dest = path.join(dir, name);
        await fs.copyFile(src, dest + ".parcial");
        const [a, b] = await Promise.all([fs.stat(src), fs.stat(dest + ".parcial")]);
        if (a.size !== b.size || !b.size) throw new Error("La copia quedó incompleta.");
        await fs.rename(dest + ".parcial", dest);
        // La copia ya está afuera: no se deja duplicada en el disco del servidor.
        await fs.rm(src, { force: true }); await fs.rm(src + ".attrs", { force: true });
        const old = (await fs.readdir(dir)).filter((n) => PATTERN.test(n)).sort().reverse().slice(prefs.keep || KEEP);
        for (const n of old) await fs.rm(path.join(dir, n), { force: true });
        Object.assign(result, { ok: true, archivo: name, tamano: b.size });
      } catch (err) {
        result.error = human(err, dir);
      }
      prefs.last = result;
      if (result.ok) prefs.lastOk = result;
      await save();
      // El servidor lo registra y, si falló, avisa a Dirección (una vez al día).
      if (await isHosting()) await call("/api/lap/respaldo/resultado", result).catch(() => {});
      onChange();
      return result;
    })();
    try { return await running; } finally { running = null; }
  }

  // Revisa cada media hora si toca: un respaldo al día; si el último falló, se reintenta.
  async function tick() {
    if (!prefs.dir || !(await isHosting())) return;
    const lastOk = prefs.lastOk ? Date.parse(prefs.lastOk.at) : 0;
    if (Date.now() - lastOk < EVERY_MS) return;
    await run("auto");
  }

  async function setDir(dir) {
    if (typeof dir !== "string" || !dir.trim()) return status();
    const s = await fs.stat(dir).catch(() => null);
    if (!s || !s.isDirectory()) throw new Error("Esa carpeta no existe.");
    prefs.dir = dir.trim();
    await save();
    onChange();
    return status();
  }

  // Restaurar: los datos de ahora se guardan aparte (pb_data_antes_…) y se ponen los del respaldo.
  function unzip(zip, dest) {
    return new Promise((resolve, reject) => {
      const p = process.platform === "win32"
        ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`], { windowsHide: true })
        : spawn("unzip", ["-q", "-o", zip, "-d", dest]);
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("error", reject);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || "No se pudo descomprimir el respaldo."))));
    });
  }
  async function restore(file) {
    if (!(await isHosting())) throw new Error("Solo se restaura en el PC servidor.");
    const zip = path.resolve(String(file || ""));
    if (!PATTERN.test(path.basename(zip)) && !/\.zip$/i.test(zip)) throw new Error("Elige un archivo de respaldo (.zip).");
    await fs.access(zip);
    const h = getHost();
    const dir = dataDir();
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const aside = dir + "_antes_" + stamp;
    h.stop();
    await new Promise((r) => setTimeout(r, 2000));
    await fs.rename(dir, aside);
    try {
      await fs.mkdir(dir, { recursive: true });
      await unzip(zip, dir);
      await fs.access(path.join(dir, "data.db"));
      // La cuenta interna y la clave del respaldo siguen siendo las de este PC.
      for (const f of [".preparado", "lap_respaldo.key"]) await fs.copyFile(path.join(aside, f), path.join(dir, f)).catch(() => {});
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      await fs.rename(aside, dir);
      const r = await h.start();
      throw new Error("No se pudo restaurar: " + err.message + (r.ok ? " Los datos de antes siguen intactos." : ""));
    }
    const r = await h.start();
    onChange();
    return { ok: r.ok, aside, error: r.ok ? "" : r.error };
  }

  let timer = 0;
  return {
    async start() { await load(); setTimeout(() => tick().catch(() => {}), 3 * 60e3); timer = setInterval(() => tick().catch(() => {}), 30 * 60e3); },
    stop() { clearInterval(timer); },
    status, run, setDir, restore,
  };
}

module.exports = { createBackups };
