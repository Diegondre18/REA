// Proceso principal: ventana, barra de título integrada y acceso al disco y a la red de la oficina.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs/promises");

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
const colors = () => (nativeTheme.shouldUseDarkColors
  ? { color: "#0a0f1c", symbolColor: "#eceeef", height: 40 }
  : { color: "#e9e9e8", symbolColor: "#1f1f1f", height: 40 });

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: "LAP Cerebro",
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
  // Los enlaces web se abren en el navegador; la ventana nunca navega fuera de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) e.preventDefault(); });
}

nativeTheme.on("updated", () => { if (win) { win.setTitleBarOverlay(colors()); win.setBackgroundColor(colors().color); } });

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

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
    title: "Elegir la carpeta del render",
    properties: ["openDirectory"],
    defaultPath: s && s.isDirectory() ? start.trim() : undefined,
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("app-info", () => ({ version: app.getVersion(), platform: process.platform }));
