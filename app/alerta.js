// Aviso a pantalla completa (pausa activa y descanso del Pomodoro): aparece encima de cualquier
// programa (Revit, Chrome…) aunque la app esté minimizada. El fondo es una captura de la pantalla,
// difuminada y teñida con los colores de la marca. Solo se cierra con uno de sus botones.
const { BrowserWindow, screen, ipcMain, desktopCapturer } = require("electron");
const path = require("path");

function createAlerta({ onAction, isBusy }) {
  let win = null, ready = false, pending = null, currentId = "";

  async function capture(disp) {
    try {
      const { width, height } = disp.size;
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(width / 2), height: Math.round(height / 2) } });
      const src = sources.find((s) => String(s.display_id) === String(disp.id)) || sources[0];
      return src && !src.thumbnail.isEmpty() ? src.thumbnail.toDataURL() : "";
    } catch (e) { return ""; }
  }

  function send() {
    if (win && !win.isDestroyed() && ready && pending) win.webContents.send("alerta-data", pending);
  }

  async function show(data) {
    if (!data || !data.id) return false;
    // Mientras alguien presenta o tiene algo a pantalla completa, se queda en la burbuja.
    if (isBusy && isBusy()) return false;
    currentId = data.id;
    const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const shot = await capture(disp);
    if (currentId !== data.id) return false; // se canceló mientras se capturaba
    pending = { ...data, shot };
    const b = disp.bounds;
    if (!win || win.isDestroyed()) {
      ready = false;
      win = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false,
        minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
        show: false, backgroundColor: "#17213b", title: "LAP Cerebro · pausa",
        webPreferences: { preload: path.join(__dirname, "alerta-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
      });
      win.setAlwaysOnTop(true, "screen-saver");
      win.setVisibleOnAllWorkspaces(true);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      win.loadFile(path.join(__dirname, "src", "alerta.html"));
      win.webContents.on("did-finish-load", () => { ready = true; send(); win.setBounds(b); win.show(); win.focus(); });
      win.on("closed", () => { win = null; ready = false; });
    } else {
      win.setBounds(b);
      send();
      win.show(); win.focus();
    }
    return true;
  }

  function hide(id) {
    if (id && id !== currentId) return;
    currentId = ""; pending = null;
    if (win && !win.isDestroyed()) win.hide();
  }

  ipcMain.on("alerta-action", (e, act) => {
    if (!win || e.sender !== win.webContents || typeof act !== "string") return;
    const id = currentId;
    hide();
    onAction({ type: "custom", id, act });
  });

  return { show, hide, visible: () => !!(win && !win.isDestroyed() && win.isVisible()) };
}

module.exports = { createAlerta };
