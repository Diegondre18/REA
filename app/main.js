// Proceso principal: ventana, bandeja del sistema, arranque con Windows, sesión cifrada, avisos,
// actualizaciones automáticas y acceso a carpetas.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, Notification, safeStorage, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const { createBubble } = require("./bubble");
const { createBackups } = require("./respaldo");
// El servidor integrado se carga solo cuando se usa: si algo faltara, la app igual abre y se puede actualizar.
const hostModule = () => require("./host");

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("com.laparq.cerebro");

// Al iniciar Windows la app se abre (visible) y se conecta sola. "--oculta" era la marca de la versión 2.0,
// que arrancaba escondida; se sigue reconociendo para reemplazar esa configuración.
const AUTOSTART = { openAtLogin: true, args: [] };
const OLD_FLAG = "--oculta";

let win = null;
let tray = null;
let quitting = false;
let bubble = null;
let unread = 0;

/* ---------- servidor del estudio dentro de la app ---------- */
// En el PC elegido como servidor, la app arranca PocketBase por dentro cada vez que abre.
// El servidor viaja dentro de la app: al actualizarse la app, también se actualiza el servidor.
const serverDir = () => (app.isPackaged ? path.join(process.resourcesPath, "servidor") : path.join(__dirname, "server-bundle"));
const hostFlag = () => path.join(app.getPath("userData"), "servidor.json");
let host = null;
function getHost() {
  if (!host) {
    const dir = serverDir();
    const data = path.join(app.getPath("userData"), "servidor");
    host = hostModule().createHost({
      bin: path.join(dir, process.platform === "win32" ? "pocketbase.exe" : "pocketbase"),
      dataDir: path.join(data, "pb_data"),
      migrationsDir: path.join(dir, "pb_migrations"),
      hooksDir: path.join(dir, "pb_hooks"),
      logFile: path.join(data, "servidor.log"),
    });
  }
  return host;
}
async function isHosting() {
  try { return JSON.parse(await fs.readFile(hostFlag(), "utf8")).host === true; } catch (e) { return false; }
}
async function setHosting(on) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(hostFlag(), JSON.stringify({ host: !!on, since: new Date().toISOString() }));
}

// Deja pasar a los demás PC por el firewall de Windows. Pide permiso de administrador una sola vez.
function openFirewall() {
  if (process.platform !== "win32") return Promise.resolve(true);
  const exe = path.join(serverDir(), "pocketbase.exe");
  const rules = [
    `netsh advfirewall firewall delete rule name="LAP Cerebro servidor"`,
    `netsh advfirewall firewall add rule name="LAP Cerebro servidor" dir=in action=allow program="${exe}" enable=yes profile=private,domain`,
    `netsh advfirewall firewall delete rule name="LAP Cerebro busqueda"`,
    `netsh advfirewall firewall add rule name="LAP Cerebro busqueda" dir=in action=allow protocol=UDP localport=8091 profile=private,domain`,
  ].join(" & ");
  const ps = `Start-Process -FilePath cmd.exe -ArgumentList '/c ${rules.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait`;
  return new Promise((resolve) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true });
    p.on("exit", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

ipcMain.handle("host-status", async () => {
  const hosting = await isHosting();
  return { hosting, available: await fs.access(path.join(serverDir(), "pb_hooks")).then(() => true, () => false), ...(hosting ? getHost().status() : {}) };
});
ipcMain.handle("host-start", async () => {
  const r = await getHost().start();
  updateTray();
  return r;
});
ipcMain.handle("host-enable", async () => {
  const r = await getHost().start();
  if (!r.ok) return r;
  await setHosting(true);
  // El PC servidor tiene que abrir con Windows para que el equipo tenga servidor todos los días.
  if (app.isPackaged) app.setLoginItemSettings(AUTOSTART);
  const firewall = await openFirewall();
  updateTray();
  return { ...r, firewall };
});
ipcMain.handle("host-disable", async () => {
  await setHosting(false);
  if (host) host.stop();
  updateTray();
  return true;
});
ipcMain.handle("host-firewall", () => openFirewall());
ipcMain.handle("host-maestro", async (_e, email, password, name) => {
  if (!(await isHosting())) return { ok: false, message: "El perfil maestro solo se crea desde el PC que es el servidor." };
  return getHost().maestro(String(email || ""), String(password || ""), String(name || ""));
});
ipcMain.handle("discover", () => { try { return hostModule().discover(); } catch (e) { return []; } });

const colors = () => (nativeTheme.shouldUseDarkColors
  ? { color: "#0a0f1c", symbolColor: "#eceeef", height: 40 }
  : { color: "#e9e9e8", symbolColor: "#1f1f1f", height: 40 });
const iconPath = () => path.join(__dirname, "src", "assets", "icon.png");

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    title: "LAP Cerebro",
    icon: iconPath(),
    backgroundColor: colors().color,
    titleBarStyle: "hidden",
    titleBarOverlay: colors(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Minimizada o en la bandeja sigue recibiendo avisos al instante y puede sonar.
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.once("ready-to-show", () => win.show());
  win.on("focus", () => win.flashFrame(false));
  win.loadFile(path.join(__dirname, "src", "index.html"));
  // Los enlaces web (Meet, Google Calendar) se abren en el navegador; la ventana nunca navega fuera de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file:")) return;
    e.preventDefault();
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  // Cerrar la ventana la esconde en la bandeja: así el equipo te sigue viendo conectado.
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.on("click", showWindow);
  updateTray();
}
function updateTray() {
  if (!tray) return;
  const serving = !!(host && host.running());
  tray.setToolTip((serving ? "LAP Cerebro · este PC es el servidor del estudio" : "LAP Cerebro · conectado con el equipo") + (unread ? ` · ${unread} sin leer` : ""));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir LAP Cerebro", click: showWindow },
    { label: "Mostrar la burbuja", type: "checkbox", checked: !!(bubble && bubble.visible()), click: (it) => setBubbleVisible(it.checked) },
    { type: "separator" },
    { label: serving ? "Salir (el equipo se queda sin servidor)" : "Salir", click: () => { quitting = true; app.quit(); } },
  ]));
}

nativeTheme.on("updated", () => { if (win) { win.setTitleBarOverlay(colors()); win.setBackgroundColor(colors().color); } });
app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => { if (host) host.stop(); if (bubble) bubble.stop(); });
app.whenReady().then(async () => {
  // Si este PC es el servidor, se arranca antes de abrir la ventana para que todos se conecten cuanto antes.
  if (await isHosting()) getHost().start().then(updateTray);
  createWindow();
  startBubble();
  backups.start().catch(() => {});
  createTray();
  if (app.isPackaged) {
    setAutostartOnce();
    startUpdates();
  }
});
app.on("window-all-closed", () => { /* sigue en la bandeja */ });

// La primera vez queda configurada para abrir con Windows; cada persona puede apagarlo en su perfil.
async function setAutostartOnce() {
  const old = app.getLoginItemSettings({ args: [OLD_FLAG] });
  if (old.openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: false, args: [OLD_FLAG] });
    app.setLoginItemSettings(AUTOSTART);
  }
  const flag = path.join(app.getPath("userData"), "autoinicio-configurado");
  try { await fs.access(flag); return; } catch (e) { /* primera vez */ }
  app.setLoginItemSettings(AUTOSTART);
  await fs.writeFile(flag, new Date().toISOString()).catch(() => {});
}

// Actualizaciones: busca versiones nuevas en GitHub Releases al abrir, cada 4 horas y cuando la persona
// lo pide desde su perfil. Las descarga en segundo plano y avisa en la app; se instalan al reiniciar
// desde el aviso o al salir. El estado (buscando, descargando, error…) se muestra en el perfil.
let updateReady = null;
let updateState = { state: "idle" };
function setUpdateState(next) {
  updateState = { ...updateState, ...next, at: new Date().toISOString() };
  if (win && !win.isDestroyed()) win.webContents.send("update-state-changed", updateState);
  if (next.state === "error") {
    const line = `${updateState.at} ${next.error}\n`;
    fs.appendFile(path.join(app.getPath("userData"), "actualizaciones.log"), line).catch(() => {});
  }
}
let checking = null;
function checkUpdates() {
  if (!app.isPackaged) { setUpdateState({ state: "dev" }); return Promise.resolve(updateState); }
  if (updateReady) return Promise.resolve(updateState);
  if (checking) return checking;
  setUpdateState({ state: "checking", error: "" });
  // Si en 60 s no hubo respuesta, se dice; nunca se queda "buscando" para siempre.
  const guard = setTimeout(() => { if (updateState.state === "checking") setUpdateState({ state: "error", error: "GitHub no respondió a tiempo. Inténtalo de nuevo en unos minutos." }); }, 60000);
  checking = autoUpdater.checkForUpdates()
    .then((r) => {
      if (updateState.state !== "checking") return;
      if (!r || !r.updateInfo) setUpdateState({ state: "error", error: "Esta instalación no puede actualizarse sola. Descarga el instalador de la página de versiones." });
      else if (r.updateInfo.version === app.getVersion()) setUpdateState({ state: "latest", version: app.getVersion() });
    })
    .catch((err) => setUpdateState({ state: "error", error: humanUpdateError(err) }))
    .finally(() => clearTimeout(guard))
    .then(() => updateState)
    .finally(() => { checking = null; });
  return checking;
}
function humanUpdateError(err) {
  const m = String((err && err.message) || err || "");
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(m)) return "No hay conexión con GitHub desde este PC. Revisa el internet e inténtalo de nuevo.";
  if (/ENOSPC/i.test(m)) return "No hay espacio en el disco para descargar la versión nueva.";
  if (/sha512|checksum/i.test(m)) return "La descarga llegó dañada. Inténtalo de nuevo.";
  if (/40[34]|rate limit/i.test(m)) return "GitHub no respondió (puede estar caído o limitando consultas). Inténtalo en unos minutos.";
  return "No se pudo actualizar: " + m.split("\n")[0].slice(0, 160);
}
function startUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (info) => setUpdateState({ state: "downloading", version: info.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => setUpdateState({ state: "latest", version: app.getVersion() }));
  autoUpdater.on("download-progress", (p) => setUpdateState({ state: "downloading", percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => {
    updateReady = info.version;
    setUpdateState({ state: "ready", version: info.version, percent: 100 });
    if (win) win.webContents.send("update-ready", info.version);
    if (tray) tray.setToolTip("LAP Cerebro · versión " + info.version + " lista para instalar");
  });
  autoUpdater.on("error", (err) => setUpdateState({ state: "error", error: humanUpdateError(err) }));
  setTimeout(checkUpdates, 15000);
  setInterval(checkUpdates, 4 * 3600 * 1000);
}
ipcMain.handle("update-status", () => updateReady);
ipcMain.handle("update-state", () => updateState);
ipcMain.handle("update-check", () => checkUpdates());
ipcMain.on("update-install", () => {
  if (!updateReady) return;
  quitting = true;
  autoUpdater.quitAndInstall(true, true);
});

async function stat(p) {
  if (typeof p !== "string" || !p.trim() || p.length > 1000) return null;
  try { return await fs.stat(p.trim()); } catch (e) { return null; }
}

// Las rutas vienen de datos compartidos: una carpeta se abre en el Explorador,
// un archivo solo se muestra seleccionado en su carpeta, nunca se ejecuta.
ipcMain.handle("open-path", async (_e, p) => {
  const s = await stat(p);
  if (!s) return { ok: false, reason: "not_found" };
  if (s.isDirectory()) {
    const err = await shell.openPath(p.trim());
    return err ? { ok: false, reason: "open_failed" } : { ok: true };
  }
  shell.showItemInFolder(p.trim());
  return { ok: true };
});

ipcMain.handle("path-exists", async (_e, p) => {
  const s = await stat(p);
  return { exists: !!s, isDir: !!(s && s.isDirectory()) };
});

// Elegir un archivo (imagen para revisar, ficha técnica): solo se devuelve su ruta, nunca se abre ni se sube.
ipcMain.handle("pick-file", async (_e, start) => {
  const s = await stat(start);
  const dir = s ? (s.isDirectory() ? start.trim() : path.dirname(start.trim())) : undefined;
  const r = await dialog.showOpenDialog(win, {
    title: "Elegir el archivo",
    properties: ["openFile"],
    defaultPath: dir,
    filters: [{ name: "Imágenes y documentos", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "pdf"] }, { name: "Todos los archivos", extensions: ["*"] }],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("pick-folder", async (_e, start) => {
  const s = await stat(start);
  const r = await dialog.showOpenDialog(win, {
    title: "Elegir la carpeta",
    properties: ["openDirectory"],
    defaultPath: s && s.isDirectory() ? start.trim() : undefined,
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("app-info", () => ({ version: app.getVersion(), platform: process.platform }));

// Modo claro u oscuro elegido en la app ("system", "light" o "dark"); también cambia la barra de título de Windows.
ipcMain.on("set-theme", (_e, mode) => {
  if (["system", "light", "dark"].includes(mode)) nativeTheme.themeSource = mode;
});

// Sesión: se guarda cifrada con la protección de datos de Windows (DPAPI), atada a esta cuenta de Windows.
const sessionFile = () => path.join(app.getPath("userData"), "sesion.bin");
ipcMain.handle("session-load", async () => {
  try {
    const buf = await fs.readFile(sessionFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : "";
  } catch (e) { return ""; }
});
ipcMain.handle("session-save", async (_e, raw) => {
  try {
    if (!raw) { await fs.rm(sessionFile(), { force: true }); return true; }
    if (typeof raw !== "string" || raw.length > 20000 || !safeStorage.isEncryptionAvailable()) return false;
    await fs.writeFile(sessionFile(), safeStorage.encryptString(raw));
    return true;
  } catch (e) { return false; }
});

ipcMain.handle("autostart-get", () => app.getLoginItemSettings(AUTOSTART).openAtLogin);
ipcMain.handle("autostart-set", (_e, on) => {
  app.setLoginItemSettings({ ...AUTOSTART, openAtLogin: !!on });
  return !!on;
});

// Avisos nativos de Windows; al hacer clic se abre la app en lo que corresponde.
// El sonido lo pone la app (uno suave y otro para lo urgente), por eso el aviso de Windows va en silencio.
ipcMain.on("notify", (_e, title, body, route, urgent) => {
  if (win && !win.isFocused()) win.flashFrame(true);
  if (!Notification.isSupported() || (win && win.isFocused())) return;
  const n = new Notification({ title: String(title || "").slice(0, 120), body: String(body || "").slice(0, 300), icon: iconPath(), silent: true, urgency: urgent ? "critical" : "normal" });
  n.on("click", () => {
    showWindow();
    if (win && typeof route === "string" && /^#[\w/-]*$/.test(route)) win.webContents.send("navigate", route);
  });
  n.show();
});

/* ---------- burbuja de escritorio ---------- */
// La app (ventana principal) es la que habla con el servidor; la burbuja solo muestra y pide acciones.
function startBubble() {
  bubble = createBubble({
    app,
    onAction: (a) => {
      if (a.type === "open" || a.type === "bell") showWindow();
      if (a.type === "visibility") updateTray();
      if (win && !win.isDestroyed()) win.webContents.send("bubble-action", a);
    },
  });
  bubble.start().then(updateTray).catch(() => {});
}
function setBubbleVisible(on) {
  if (!bubble) return false;
  bubble.setVisible(on);
  updateTray();
  if (win && !win.isDestroyed()) win.webContents.send("bubble-action", { type: "visibility", value: !!on });
  return !!on;
}
ipcMain.on("bubble-sync", (e, st) => {
  if (!bubble || !win || e.sender !== win.webContents || !st || typeof st !== "object") return;
  const n = Math.max(0, Math.min(999, Number(st.unread) || 0));
  if (n !== unread) { unread = n; updateTray(); }
  bubble.setState(st);
});
ipcMain.on("bubble-notify", (e, n) => {
  if (!bubble || !win || e.sender !== win.webContents || !n || typeof n !== "object") return;
  // Con la app al frente el aviso ya se ve adentro; el globito es para cuando está minimizada o en la bandeja.
  if (n.id && win.isVisible() && !win.isMinimized() && win.isFocused()) return;
  bubble.notify(n);
});
ipcMain.handle("bubble-visible", () => !!(bubble && bubble.visible()));
ipcMain.handle("bubble-set-visible", (_e, on) => setBubbleVisible(on));
ipcMain.handle("screen-busy", () => !!(bubble && bubble.busy()));
// Número de avisos sin leer sobre el ícono de la barra de tareas (la imagen la dibuja la app).
ipcMain.on("set-badge", (e, dataUrl, count) => {
  if (!win || e.sender !== win.webContents) return;
  try {
    if (!count || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) win.setOverlayIcon(null, "");
    else win.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), `${count} avisos sin leer`);
  } catch (err) { /* no todas las plataformas tienen ícono superpuesto */ }
});

/* ---------- respaldo externo (solo en el PC servidor) ---------- */
const backups = createBackups({
  app, getHost, isHosting,
  onChange: () => { if (win && !win.isDestroyed()) backups.status().then((st) => win.webContents.send("backup-changed", st)).catch(() => {}); },
});
app.on("will-quit", () => backups.stop());
ipcMain.handle("backup-status", () => backups.status());
ipcMain.handle("backup-pick", async () => {
  const st = await backups.status();
  const r = await dialog.showOpenDialog(win, { title: "Carpeta del respaldo (disco externo o NAS)", properties: ["openDirectory", "createDirectory"], defaultPath: st.dir || undefined });
  if (r.canceled || !r.filePaths.length) return st;
  return backups.setDir(r.filePaths[0]);
});
ipcMain.handle("backup-now", () => backups.run("manual"));
ipcMain.handle("backup-open", async () => {
  const st = await backups.status();
  if (st.dir) await shell.openPath(st.dir);
  return !!st.dir;
});
ipcMain.handle("backup-restore", async (_e, name) => {
  const st = await backups.status();
  const f = st.files.find((x) => x.name === name);
  if (!f) return { ok: false, error: "Ese respaldo ya no está en la carpeta." };
  const when = new Date(f.at).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
  const ok = await dialog.showMessageBox(win, {
    type: "warning", buttons: ["Restaurar", "Cancelar"], defaultId: 1, cancelId: 1, title: "Restaurar respaldo",
    message: "¿Volver los datos del estudio al " + when + "?",
    detail: "Todo lo que se hizo después se reemplaza por ese respaldo. Los datos de ahora no se borran: quedan guardados aparte en el PC servidor. Los demás PC se desconectan unos segundos y vuelven solos.",
  });
  if (ok.response !== 0) return { ok: false, canceled: true };
  try { return await backups.restore(path.join(st.dir, name)); } catch (err) { return { ok: false, error: err.message }; }
});
