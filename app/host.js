// Servidor del estudio dentro de la app: arranca PocketBase en segundo plano en el PC elegido como servidor,
// y permite que los demás PC lo encuentren solos en la red local. No depende de Electron para poder probarlo aparte.
const { spawn } = require("child_process");
const dgram = require("dgram");
const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const PORT = 8090; // HTTP del servidor (PocketBase)
const DISCOVERY_PORT = 8091; // UDP para encontrar el servidor en la red
const HELLO = "LAP-CEREBRO?";

// Direcciones IPv4 de este PC en la red local, para mostrarlas y para avisar por broadcast.
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((n, i) => (n & mask[i]) | (~mask[i] & 255)).join(".");
      out.push({ address: a.address, broadcast });
    }
  }
  return out;
}

function health(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url + "/api/health", { timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function createHost({ bin, dataDir, migrationsDir, hooksDir, logFile }) {
  let proc = null;
  let wanted = false;
  let lastError = "";
  let restarts = 0;
  let udp = null;
  const localUrl = `http://127.0.0.1:${PORT}`;
  const args = (extra) => [...extra, `--dir=${dataDir}`, `--migrationsDir=${migrationsDir}`, `--hooksDir=${hooksDir}`];

  function log(line) {
    try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`); } catch (e) { /* sin registro */ }
  }

  // Responde a los PC que buscan el servidor en la red.
  function startResponder() {
    if (udp) return;
    udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
    udp.on("message", (msg, rinfo) => {
      if (msg.toString() !== HELLO) return;
      const reply = Buffer.from(JSON.stringify({ app: "lap-cerebro", port: PORT, name: os.hostname() }));
      udp.send(reply, rinfo.port, rinfo.address);
    });
    udp.on("error", (e) => { log("búsqueda en red: " + e.message); try { udp.close(); } catch (x) { /* ya cerrado */ } udp = null; });
    udp.bind(DISCOVERY_PORT);
  }

  function run(extra) {
    return new Promise((resolve) => {
      const p = spawn(bin, args(extra), { windowsHide: true });
      let out = "";
      p.stdout.on("data", (d) => { out += d; });
      p.stderr.on("data", (d) => { out += d; });
      p.on("error", (e) => resolve({ code: -1, out: e.message }));
      p.on("exit", (code) => resolve({ code, out }));
    });
  }

  // Primera vez: prepara la base y crea la cuenta interna de administración de PocketBase con una clave
  // al azar, para que el servidor no abra el navegador pidiéndola. El soporte del día a día es el perfil maestro.
  async function prepare() {
    const marker = path.join(dataDir, ".preparado");
    if (fs.existsSync(marker)) return;
    fs.mkdirSync(dataDir, { recursive: true });
    const m = await run(["migrate", "up"]);
    log("preparando base: " + m.out.trim().split("\n").pop());
    const pass = crypto.randomBytes(24).toString("base64url");
    const su = await run(["superuser", "create", "servidor@lap-cerebro.local", pass]);
    log("cuenta interna: " + su.out.trim().split("\n").pop());
    fs.writeFileSync(marker, new Date().toISOString());
  }

  function launch() {
    fs.mkdirSync(dataDir, { recursive: true });
    // El registro se reinicia al pasar de 5 MB para no llenar el disco.
    try { if (fs.statSync(logFile).size > 5 * 1024 * 1024) fs.writeFileSync(logFile, ""); } catch (e) { /* aún no existe */ }
    log("arrancando servidor");
    proc = spawn(bin, args(["serve", `--http=0.0.0.0:${PORT}`]), { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const keep = (buf) => {
      const text = buf.toString().trim();
      if (!text) return;
      log(text);
      if (/address already in use|bind:/i.test(text)) lastError = "El puerto 8090 ya está en uso: probablemente hay otro servidor del Cerebro abierto en este PC.";
    };
    proc.stdout.on("data", keep);
    proc.stderr.on("data", keep);
    proc.on("error", (e) => { lastError = "No se pudo arrancar el servidor: " + e.message; log(lastError); });
    proc.on("exit", (code) => {
      log("servidor detenido (código " + code + ")");
      proc = null;
      // Si se cayó solo, se vuelve a levantar unas cuantas veces.
      if (wanted && restarts < 5) { restarts += 1; setTimeout(() => { if (wanted && !proc) launch(); }, 3000); }
    });
  }

  return {
    PORT,
    localUrl,
    // Arranca el servidor (si no está ya) y espera a que responda.
    async start(timeoutMs = 25000) {
      wanted = true;
      lastError = "";
      if (await health(localUrl)) { startResponder(); return { ok: true, url: localUrl }; }
      if (!proc) { restarts = 0; await prepare(); launch(); }
      startResponder();
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (await health(localUrl)) return { ok: true, url: localUrl };
        if (lastError && !proc) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      return { ok: false, error: lastError || "El servidor no respondió a tiempo. Revisa servidor.log en la carpeta de datos." };
    },
    stop() {
      wanted = false;
      if (udp) { try { udp.close(); } catch (e) { /* ya cerrado */ } udp = null; }
      if (proc) { proc.kill(); proc = null; }
    },
    running: () => !!proc,
    status: () => ({ running: !!proc, error: lastError, addresses: lanAddresses().map((a) => `${a.address}:${PORT}`), dataDir }),
    // Crea o recupera el perfil maestro con el comando del servidor (pb_hooks/maestro.pb.js).
    async maestro(email, password, name) {
      const r = await run(["maestro", email, password, name || "Perfil maestro"]);
      const line = r.out.split("\n").map((l) => l.replace(/^\S+ \S+ /, "").trim()).filter(Boolean).pop() || "";
      return { ok: /Listo:/.test(r.out), message: line };
    },
  };
}

// Busca el servidor del estudio en la red local. Devuelve las direcciones que respondieron.
function discover(timeoutMs = 1800) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket("udp4");
    // Un mismo PC puede responder por varias direcciones: se prefiere la de la red sobre 127.0.0.1.
    const done = () => {
      try { sock.close(); } catch (e) { /* ya cerrado */ }
      const byName = new Map();
      for (const f of found.values()) {
        const prev = byName.get(f.name);
        if (!prev || prev.url.includes("127.0.0.1")) byName.set(f.name, f);
      }
      resolve([...byName.values()]);
    };
    sock.on("message", (msg, rinfo) => {
      try {
        const info = JSON.parse(msg.toString());
        if (info.app === "lap-cerebro") found.set(rinfo.address, { url: `http://${rinfo.address}:${info.port || PORT}`, name: info.name || rinfo.address });
      } catch (e) { /* respuesta ajena */ }
    });
    sock.on("error", done);
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const msg = Buffer.from(HELLO);
      const targets = new Set(["255.255.255.255", "127.0.0.1", ...lanAddresses().map((a) => a.broadcast)]);
      for (const t of targets) sock.send(msg, DISCOVERY_PORT, t, () => {});
      setTimeout(done, timeoutMs);
    });
  });
}

module.exports = { createHost, discover, lanAddresses, health, PORT, DISCOVERY_PORT };
