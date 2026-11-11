// Proceso principal: ventana, bandeja del sistema, arranque con Windows, sesión cifrada, avisos,
// actualizaciones automáticas y acceso a carpetas.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, Notification, safeStorage, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { autoUpdater } = require("electron-updater");

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId("com.laparq.cerebro");

// Al iniciar Windows la app se abre (visible) y se conecta sola. "--oculta" era la marca de la versión 2.0,
// que arrancaba escondida; se sigue reconociendo para reemplazar esa configuración.
const AUTOSTART = { openAtLogin: true, args: [] };
const OLD_FLAG = "--oculta";

let win = null;
let tray = null;
let quitting = false;

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
    },
  });
  win.once("ready-to-show", () => win.show());
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
  tray.setToolTip("LAP Cerebro · conectado con el equipo");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir LAP Cerebro", click: showWindow },
    { type: "separator" },
    { label: "Salir", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", showWindow);
}

nativeTheme.on("updated", () => { if (win) { win.setTitleBarOverlay(colors()); win.setBackgroundColor(colors().color); } });
app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; });
app.whenReady().then(() => {
  createWindow();
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

// Actualizaciones: busca versiones nuevas en GitHub Releases al abrir y cada 4 horas, las descarga
// en segundo plano y avisa en la app. Se instalan al reiniciar desde el aviso o al salir.
let updateReady = null;
function startUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    updateReady = info.version;
    if (win) win.webContents.send("update-ready", info.version);
    if (tray) tray.setToolTip("LAP Cerebro · versión " + info.version + " lista para instalar");
  });
  autoUpdater.on("error", (err) => console.log("actualización:", err && err.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, 4 * 3600 * 1000);
}
ipcMain.handle("update-status", () => updateReady);
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
ipcMain.on("notify", (_e, title, body, route) => {
  if (!Notification.isSupported() || (win && win.isFocused())) return;
  const n = new Notification({ title: String(title || "").slice(0, 120), body: String(body || "").slice(0, 300), icon: iconPath(), silent: false });
  n.on("click", () => {
    showWindow();
    if (win && typeof route === "string" && /^#[\w/-]*$/.test(route)) win.webContents.send("navigate", route);
  });
  n.show();
});
