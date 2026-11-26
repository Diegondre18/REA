// Aviso a pantalla completa (pausa activa y descanso del Pomodoro): aparece encima de cualquier
// programa (Revit, Chrome…) en TODAS las pantallas, aunque la app esté minimizada. El fondo de cada
// pantalla es su propia captura, difuminada y teñida con los colores de la marca. Solo se cierra con uno
// de sus botones.
// Pausa activa: al tocar "Asistir" las pantallas siguen bloqueadas y muestran la rutina ahí mismo; el botón
// "Terminar" solo se activa cuando se acaba el tiempo, y hasta tocarlo no se puede volver a trabajar.
const { BrowserWindow, screen, ipcMain, desktopCapturer, app } = require("electron");
const path = require("path");

function createAlerta({ onAction, isBusy }) {
  const wins = new Map(); // id de la pantalla → { win, ready, data }
  let currentId = "", lastData = null, guard = 0, saliendo = false;
  app.on("before-quit", () => { saliendo = true; });

  async function captures(displays) {
    try {
      const big = displays.reduce((m, d) => Math.max(m, d.size.width), 0);
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(big / 2), height: Math.round(big / 2) } });
      const out = {};
      displays.forEach((d, i) => {
        const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[i];
        out[d.id] = src && !src.thumbnail.isEmpty() ? src.thumbnail.toDataURL() : "";
      });
      return out;
    } catch (e) { return {}; }
  }

  function send(w) {
    if (w.win && !w.win.isDestroyed() && w.ready && w.data) w.win.webContents.send("alerta-data", w.data);
  }
  function windowFor(disp, primary) {
    const b = disp.bounds;
    let w = wins.get(disp.id);
    if (w && w.win && !w.win.isDestroyed()) { w.win.setBounds(b); return w; }
    w = { win: null, ready: false, data: null };
    w.win = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      show: false, backgroundColor: "#17213b", title: "LAP Cerebro · pausa",
      webPreferences: { preload: path.join(__dirname, "alerta-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    });
    w.win.setAlwaysOnTop(true, "screen-saver");
    w.win.setVisibleOnAllWorkspaces(true);
    w.win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.win.webContents.on("will-navigate", (e) => e.preventDefault());
    w.win.loadFile(path.join(__dirname, "src", "alerta.html"));
    w.win.webContents.on("did-finish-load", () => {
      w.ready = true; send(w);
      if (currentId) { w.win.setBounds(b); w.win.showInactive(); w.win.moveTop(); if (primary) w.win.focus(); }
    });
    // Si el proceso de la página se cae, se vuelve a abrir con lo mismo.
    w.win.webContents.on("render-process-gone", () => { const id = disp.id; try { w.win.destroy(); } catch (e) { /* ya no está */ } wins.delete(id); if (currentId && lastData) render(lastData, false); });
    // Alt+F4 no lo cierra mientras dure el aviso (al salir de la app o al actualizar sí).
    w.win.on("close", (e) => { if (currentId && !saliendo) e.preventDefault(); });
    w.win.on("closed", () => { if (wins.get(disp.id) === w) wins.delete(disp.id); });
    wins.set(disp.id, w);
    return w;
  }

  // Muestra (o actualiza) el aviso en todas las pantallas.
  async function render(data, withShots) {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const shots = withShots ? await captures(displays) : null;
    if (currentId !== data.id) return false; // se canceló mientras se capturaba
    const ids = new Set(displays.map((d) => d.id));
    for (const [id, w] of wins) if (!ids.has(id)) { try { w.win.destroy(); } catch (e) { /* nada */ } wins.delete(id); }
    for (const d of displays) {
      const isPrimary = d.id === primary.id;
      const w = windowFor(d, isPrimary);
      const prevShot = w.data && w.data.shot;
      w.data = { ...data, shot: shots ? shots[d.id] || "" : prevShot || "", principal: isPrimary };
      if (w.ready) {
        send(w);
        w.win.setBounds(d.bounds);
        if (!w.win.isVisible()) w.win.showInactive();
        w.win.moveTop();
        if (isPrimary) w.win.focus();
      }
    }
    // Que ningún programa se ponga encima mientras dure el aviso.
    clearInterval(guard);
    guard = setInterval(() => {
      if (!currentId) { clearInterval(guard); return; }
      for (const w of wins.values()) if (w.win && !w.win.isDestroyed()) { if (!w.win.isVisible()) w.win.showInactive(); w.win.setAlwaysOnTop(true, "screen-saver"); w.win.moveTop(); }
    }, 1500);
    return true;
  }

  async function show(data) {
    if (!data || !data.id) return false;
    // Mientras alguien presenta o tiene algo a pantalla completa, se queda en la burbuja.
    if (isBusy && isBusy()) return false;
    const nuevo = data.id !== currentId;
    currentId = data.id;
    lastData = data;
    return render(data, nuevo || !wins.size);
  }
  // Rutina de la pausa activa en las mismas pantallas bloqueadas (la persona ya eligió asistir).
  async function pausa(data) {
    if (!data || !data.id) return false;
    currentId = data.id;
    lastData = { ...data, mode: "rutina" };
    return render(lastData, !wins.size);
  }

  function hide(id) {
    if (id && id !== currentId) return;
    currentId = ""; lastData = null;
    clearInterval(guard);
    for (const w of wins.values()) if (w.win && !w.win.isDestroyed()) w.win.hide();
  }

  ipcMain.on("alerta-action", (e, act) => {
    const mine = [...wins.values()].some((w) => w.win && !w.win.isDestroyed() && e.sender === w.win.webContents);
    if (!mine || typeof act !== "string") return;
    const id = currentId;
    // "Asistir" no cierra: las pantallas siguen bloqueadas mientras la app manda la rutina.
    if (/^pausa-empezar/.test(act)) {
      for (const w of wins.values()) if (w.win && !w.win.isDestroyed() && w.ready) w.win.webContents.send("alerta-data", { ...(w.data || {}), mode: "cargando" });
    } else hide();
    onAction({ type: "custom", id, act });
  });

  return { show, pausa, hide, visible: () => [...wins.values()].some((w) => w.win && !w.win.isDestroyed() && w.win.isVisible()) };
}

module.exports = { createAlerta };
