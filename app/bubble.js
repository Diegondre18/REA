// Burbuja de escritorio: el muñeco de cada persona, siempre encima de todo y pegado al borde de la
// pantalla. Muestra los avisos aunque la app esté minimizada o cerrada en la bandeja, y deja cambiar
// el estado (disponible, no molestar, en reunión…). No tapa clics: solo responde con el mouse encima.
const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const W = 380, H = 440; // ventana transparente; el muñeco ocupa una esquina
const D = { w: 84, h: 120 }; // caja del muñeco dentro de la ventana
const MARGIN = 0; // pegada al borde: el muñeco se asoma desde ahí

function createBubble({ app, onAction, isBlocked }) {
  const file = () => path.join(app.getPath("userData"), "burbuja.json");
  let prefs = { visible: true, anchor: { side: "right", t: 0.78, display: null } };
  let win = null, ready = false, state = null, busy = false, drag = null, dragTimer = 0, placed = null;
  const queue = [];

  async function load() {
    try { prefs = { ...prefs, ...JSON.parse(await fs.readFile(file(), "utf8")) }; } catch (e) { /* primera vez: visible */ }
  }
  const save = () => fs.writeFile(file(), JSON.stringify(prefs)).catch(() => {});
  const send = (ch, data) => { if (win && !win.isDestroyed() && ready) win.webContents.send(ch, data); };

  function displayFor(a) {
    const all = screen.getAllDisplays();
    return all.find((d) => d.id === a.display) || screen.getPrimaryDisplay();
  }
  // Ubica la ventana para que el muñeco quede pegado al borde elegido, sin salirse de la pantalla.
  function place() {
    if (!win || win.isDestroyed()) return;
    const a = prefs.anchor;
    const wa = displayFor(a).workArea;
    const t = Math.max(0, Math.min(1, Number(a.t) || 0));
    let dx, dy;
    if (a.side === "left" || a.side === "right") {
      dx = a.side === "left" ? wa.x + MARGIN : wa.x + wa.width - D.w - MARGIN;
      dy = Math.round(wa.y + t * (wa.height - D.h));
    } else {
      dy = a.side === "top" ? wa.y + MARGIN : wa.y + wa.height - D.h - MARGIN;
      dx = Math.round(wa.x + t * (wa.width - D.w));
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let wx = a.side === "right" ? dx + D.w - W : a.side === "left" ? dx : Math.round(dx + D.w / 2 - W / 2);
    let wy = a.side === "bottom" ? dy + D.h - H : a.side === "top" ? dy : Math.round(dy + D.h / 2 - H / 2);
    wx = clamp(wx, wa.x, wa.x + wa.width - W);
    wy = clamp(wy, wa.y, wa.y + wa.height - H);
    win.setBounds({ x: wx, y: wy, width: W, height: H });
    placed = { side: a.side, dx: dx - wx, dy: dy - wy, W, H, D };
    send("bubble-place", placed);
  }

  // Al soltarla, se pega al borde más cercano de la pantalla donde quedó.
  function snap() {
    const b = win.getBounds();
    const cx = b.x + placed.dx + D.w / 2, cy = b.y + placed.dy + D.h / 2;
    const disp = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(cy) });
    const wa = disp.workArea;
    const dist = { left: cx - wa.x, right: wa.x + wa.width - cx, top: cy - wa.y, bottom: wa.y + wa.height - cy };
    const side = Object.keys(dist).sort((p, q) => dist[p] - dist[q])[0];
    const t = side === "left" || side === "right" ? (cy - D.h / 2 - wa.y) / Math.max(1, wa.height - D.h) : (cx - D.w / 2 - wa.x) / Math.max(1, wa.width - D.w);
    prefs.anchor = { side, t: Math.max(0, Math.min(1, t)), display: disp.id };
    save();
    place();
  }

  // Windows a veces le quita el "siempre encima" a una ventana cuando otro programa se pone al frente
  // o después de esconderla y mostrarla. Cada segundo y medio se vuelve a poner al frente, sin robar el foco.
  // No lo hace mientras está el aviso grande de pausa (ese debe quedar encima) ni mientras se arrastra.
  let blocked = false;
  function keepTop() {
    if (!win || win.isDestroyed() || !win.isVisible() || blocked || drag) return;
    if (isBlocked && isBlocked()) return;
    if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, "screen-saver");
    win.moveTop();
  }
  const topTimer = setInterval(keepTop, 1500);

  function shouldShow() { return !!(prefs.visible && state && state.me && !busy); }
  function refresh() {
    if (!win || win.isDestroyed()) return;
    if (shouldShow()) { if (!win.isVisible()) { place(); win.showInactive(); win.setAlwaysOnTop(true, "screen-saver"); win.moveTop(); } }
    else if (win.isVisible()) win.hide();
  }

  function create() {
    win = new BrowserWindow({
      width: W, height: H, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
      backgroundColor: "#00000000", title: "LAP Cerebro · burbuja",
      webPreferences: {
        preload: path.join(__dirname, "bubble-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true,
        spellcheck: false, backgroundThrottling: false,
      },
    });
    // El nivel más alto: queda encima de cualquier programa (Revit, Chrome, el Explorador…).
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.loadFile(path.join(__dirname, "src", "bubble.html"));
    win.webContents.on("did-finish-load", () => {
      ready = true;
      place();
      if (state) send("bubble-state", state);
      while (queue.length) send("bubble-notify", queue.shift());
      refresh();
    });
    win.on("closed", () => { win = null; ready = false; });
  }

  // Mientras alguien presenta, juega o ve un render a pantalla completa, la burbuja se esconde.
  // Windows lo informa con SHQueryUserNotificationState; se consulta con un PowerShell oculto.
  let watcher = null, restarts = 0, stopped = false;
  function watchFullscreen() {
    if (process.platform !== "win32") return;
    const ps = [
      "$ErrorActionPreference='SilentlyContinue'",
      "Add-Type -Namespace LapC -Name Q -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s);'",
      "$last=-1",
      "while($true){ $s=0; [void][LapC.Q]::SHQueryUserNotificationState([ref]$s); if($s -ne $last){ [Console]::Out.WriteLine($s); [Console]::Out.Flush(); $last=$s }; Start-Sleep -Milliseconds 2000 }",
    ].join("; ");
    try {
      watcher = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { return; }
    let buf = "";
    watcher.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/); buf = lines.pop();
      for (const l of lines) {
        const n = parseInt(l, 10);
        if (!Number.isFinite(n)) continue;
        // 2 = app a pantalla completa, 3 = juego/visor 3D, 4 = modo presentación.
        const next = n === 2 || n === 3 || n === 4;
        if (next !== busy) { busy = next; refresh(); onAction({ type: "screen-busy", value: busy }); }
      }
    });
    watcher.on("exit", () => { watcher = null; if (!stopped && restarts++ < 3) setTimeout(watchFullscreen, 5000); });
  }

  // El mouse: la ventana deja pasar los clics salvo sobre las zonas que manda la burbuja (muñeco,
  // globitos, menú). Se revisa la posición del mouse aquí, cada 60 ms, porque los eventos que Windows
  // reenvía a una ventana transparente a veces dejan de llegar y entonces no se podía hacer clic.
  let regions = [], interactive = false;
  ipcMain.on("bubble-regions", (e, rs) => {
    if (!win || e.sender !== win.webContents || !Array.isArray(rs)) return;
    regions = rs.slice(0, 40).filter((r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite));
  });
  function setInteractive(on) {
    if (!win || win.isDestroyed() || on === interactive) return;
    interactive = on;
    win.setIgnoreMouseEvents(!on, { forward: true });
    send("bubble-hover", on);
  }
  function checkHover() {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    if (drag) return setInteractive(true);
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    setInteractive(regions.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h));
  }
  const hoverTimer = setInterval(checkHover, 60);
  ipcMain.on("bubble-interactive", () => { /* versiones viejas de la burbuja; ahora decide checkHover */ });
  ipcMain.on("bubble-drag", (e, phase) => {
    if (!win || e.sender !== win.webContents) return;
    if (phase === "start") {
      const c = screen.getCursorScreenPoint(), b = win.getBounds();
      drag = { ox: c.x - b.x, oy: c.y - b.y };
      clearInterval(dragTimer);
      dragTimer = setInterval(() => {
        if (!drag || !win) return;
        const p = screen.getCursorScreenPoint();
        win.setBounds({ x: p.x - drag.ox, y: p.y - drag.oy, width: W, height: H });
      }, 16);
    } else if (phase === "end" && drag) {
      clearInterval(dragTimer); drag = null; snap();
    }
  });
  ipcMain.on("bubble-action", (e, a) => {
    if (!win || e.sender !== win.webContents || !a || typeof a.type !== "string") return;
    if (a.type === "hide") { setVisible(false); onAction({ type: "visibility", value: false }); return; }
    onAction(a);
  });

  function setVisible(on) { prefs.visible = !!on; save(); refresh(); }
  screen.on("display-removed", place);
  screen.on("display-metrics-changed", place);

  return {
    async start() { await load(); create(); watchFullscreen(); },
    setState(s) { state = s; send("bubble-state", s); refresh(); },
    notify(n) { if (ready) send("bubble-notify", n); else queue.push(n); },
    setVisible,
    visible: () => prefs.visible,
    busy: () => busy,
    isInteractive: () => interactive,
    regions: () => regions.slice(),
    setBlocked(v) { blocked = !!v; if (!blocked) keepTop(); },
    stop() { stopped = true; clearInterval(dragTimer); clearInterval(topTimer); clearInterval(hoverTimer); if (watcher) { try { watcher.kill(); } catch (e) { /* ya cerró */ } } },
  };
}

module.exports = { createBubble };
