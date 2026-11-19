// Burbuja de escritorio: el muñeco de cada persona, siempre encima de todo y pegado al borde de la
// pantalla principal. Muestra los avisos aunque la app esté minimizada o cerrada en la bandeja, y deja
// cambiar el estado (disponible, no molestar, en reunión…).
//
// Cada pieza es una ventana pequeña del tamaño exacto de lo que muestra y siempre recibe el mouse:
//  · el muñeco (84×120),
//  · los avisos (aparece solo cuando hay; su alto se ajusta a lo que muestra),
//  · el menú es el menú nativo del sistema.
// No hay ventanas transparentes que dejen pasar clics (setIgnoreMouseEvents / setShape): en Windows eso
// dejaba de responder después de un rato y los avisos se quedaban sin poderse cerrar.
const { BrowserWindow, screen, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const D = { w: 84, h: 120 }; // ventana del muñeco
const AW = 300;              // ancho de la ventana de avisos (incluye el margen de la sombra)
const GAP = 4;               // separación entre el muñeco y los avisos
const PRESENCIAS = [
  ["disponible", "Disponible"], ["no_molestar", "No molestar"], ["reunion", "En reunión"],
  ["almuerzo", "Almuerzo"], ["pausa", "En pausa"], ["fuera", "Fuera"],
];

function createBubble({ app, onAction, isBlocked }) {
  const file = () => path.join(app.getPath("userData"), "burbuja.json");
  let prefs = { visible: true, anchor: { side: "right", t: 0.78 } };
  let doll = null, avisos = null, state = null, busy = false, drag = null, dragTimer = 0, stopped = false;
  let avisosH = 0; // alto que pide la página de avisos (0 = sin avisos)
  const ready = { doll: false, avisos: false };
  const queue = [];

  async function load() {
    try { prefs = { ...prefs, ...JSON.parse(await fs.readFile(file(), "utf8")) }; } catch (e) { /* primera vez: visible */ }
  }
  const save = () => fs.writeFile(file(), JSON.stringify(prefs)).catch(() => {});
  const alive = (w) => !!(w && !w.isDestroyed());
  const send = (w, which, ch, data) => { if (alive(w) && ready[which]) w.webContents.send(ch, data); };
  const sendBoth = (ch, data) => { send(doll, "doll", ch, data); send(avisos, "avisos", ch, data); };

  // Solo la pantalla principal: así la burbuja nunca queda entre dos monitores con distinta escala.
  const area = () => screen.getPrimaryDisplay().workArea;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Muñeco pegado al borde elegido, completo dentro de la pantalla.
  function dollBounds() {
    const a = prefs.anchor || {}, wa = area();
    const side = ["left", "right", "top", "bottom"].includes(a.side) ? a.side : "right";
    const t = clamp(Number(a.t) || 0, 0, 1);
    let x, y;
    if (side === "left" || side === "right") { x = side === "left" ? wa.x : wa.x + wa.width - D.w; y = Math.round(wa.y + t * (wa.height - D.h)); }
    else { y = side === "top" ? wa.y : wa.y + wa.height - D.h; x = Math.round(wa.x + t * (wa.width - D.w)); }
    return { side, x, y, width: D.w, height: D.h };
  }
  // Avisos al lado del muñeco, hacia el centro de la pantalla, sin salirse de ella.
  function avisosBounds(db) {
    const wa = area();
    const h = clamp(avisosH, 40, wa.height - 8);
    let x, y;
    if (db.side === "right" || db.side === "left") {
      x = db.side === "right" ? db.x - AW - GAP : db.x + D.w + GAP;
      const abajo = db.y + D.h / 2 > wa.y + wa.height / 2;
      y = abajo ? db.y + D.h - h : db.y;
    } else {
      x = Math.round(db.x + D.w / 2 - AW / 2);
      y = db.side === "bottom" ? db.y - h - GAP : db.y + D.h + GAP;
    }
    return { x: clamp(x, wa.x, wa.x + wa.width - AW), y: clamp(y, wa.y, wa.y + wa.height - h), width: AW, height: h };
  }

  function place() {
    if (!alive(doll)) return;
    const db = dollBounds();
    if (!drag) doll.setBounds({ x: db.x, y: db.y, width: D.w, height: D.h });
    send(doll, "doll", "bubble-place", { side: db.side, dx: 0, dy: 0, W: D.w, H: D.h, D });
    send(avisos, "avisos", "bubble-place", { side: db.side, abajo: db.y + D.h / 2 > area().y + area().height / 2 });
    placeAvisos();
  }
  function placeAvisos() {
    if (!alive(avisos)) return;
    const show = shouldShow() && avisosH > 0 && !drag;
    if (!show) { if (avisos.isVisible()) avisos.hide(); return; }
    avisos.setBounds(avisosBounds(dollBounds()));
    if (!avisos.isVisible()) { avisos.showInactive(); avisos.setAlwaysOnTop(true, "screen-saver"); avisos.moveTop(); }
  }

  // Al soltarlo, se pega al borde más cercano de la pantalla principal.
  function snap() {
    if (!alive(doll)) return;
    const b = doll.getBounds(), wa = area();
    const cx = clamp(b.x + D.w / 2, wa.x, wa.x + wa.width), cy = clamp(b.y + D.h / 2, wa.y, wa.y + wa.height);
    const dist = { left: cx - wa.x, right: wa.x + wa.width - cx, top: cy - wa.y, bottom: wa.y + wa.height - cy };
    const side = Object.keys(dist).sort((p, q) => dist[p] - dist[q])[0];
    const t = side === "left" || side === "right" ? (cy - D.h / 2 - wa.y) / Math.max(1, wa.height - D.h) : (cx - D.w / 2 - wa.x) / Math.max(1, wa.width - D.w);
    prefs.anchor = { side, t: clamp(t, 0, 1) };
    save();
    place();
  }

  // Windows a veces le quita el "siempre encima" a una ventana cuando otro programa se pone al frente.
  // Cada segundo y medio se vuelven a poner al frente, sin robar el foco. No lo hace mientras está el
  // aviso grande de pausa (ese debe quedar encima) ni mientras se arrastra.
  let blocked = false;
  function keepTop() {
    if (blocked || drag || (isBlocked && isBlocked())) return;
    for (const w of [doll, avisos]) {
      if (!alive(w) || !w.isVisible()) continue;
      if (!w.isAlwaysOnTop()) w.setAlwaysOnTop(true, "screen-saver");
      w.moveTop();
    }
  }
  const topTimer = setInterval(keepTop, 1500);

  function shouldShow() { return !!(prefs.visible && state && state.me && !busy); }
  function refresh() {
    if (!alive(doll)) return;
    if (shouldShow()) { if (!doll.isVisible()) { place(); doll.showInactive(); doll.setAlwaysOnTop(true, "screen-saver"); doll.moveTop(); } }
    else if (doll.isVisible()) doll.hide();
    placeAvisos();
  }

  function makeWindow(which, page, w, h) {
    const win = new BrowserWindow({
      width: w, height: h, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
      backgroundColor: "#00000000", title: which === "doll" ? "LAP Cerebro · burbuja" : "LAP Cerebro · avisos",
      webPreferences: {
        preload: path.join(__dirname, "bubble-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true,
        spellcheck: false, backgroundThrottling: false,
      },
    });
    // El nivel más alto: queda encima de cualquier programa (Revit, Chrome, el Explorador…).
    win.setAlwaysOnTop(true, "screen-saver");
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.loadFile(path.join(__dirname, "src", page));
    win.webContents.on("did-finish-load", () => {
      ready[which] = true;
      lastAlive[which] = Date.now();
      place();
      if (state) send(win, which, "bubble-state", state);
      if (which === "avisos") { while (queue.length) send(win, which, "bubble-notify", queue.shift()); }
      refresh();
    });
    // Si el proceso de la página se cae, se vuelve a crear la ventana.
    // Si el proceso de la página se cae o la ventana se cierra sola, se vuelve a crear (una sola vez:
    // la ventana que se reemplaza a propósito no pide otra).
    win.webContents.on("render-process-gone", () => { if (!stopped && !win.__reemplazada) recreate(which, win); });
    win.on("closed", () => {
      const actual = which === "doll" ? doll : avisos;
      if (actual !== win) return;
      ready[which] = false;
      if (which === "doll") doll = null; else avisos = null;
      if (!stopped && !win.__reemplazada) setTimeout(() => { if (!(which === "doll" ? doll : avisos)) recreate(which); }, 1000);
    });
    return win;
  }
  function recreate(which, vieja) {
    if (stopped) return;
    const actual = which === "doll" ? doll : avisos;
    if (vieja && actual !== vieja) return; // ya se reemplazó
    if (actual) { actual.__reemplazada = true; if (!actual.isDestroyed()) actual.destroy(); }
    ready[which] = false;
    if (which === "doll") doll = makeWindow("doll", "bubble.html", D.w, D.h);
    else { avisosH = 0; avisos = makeWindow("avisos", "avisos.html", AW, 100); }
  }
  function create() {
    doll = makeWindow("doll", "bubble.html", D.w, D.h);
    avisos = makeWindow("avisos", "avisos.html", AW, 100);
  }

  // Mientras alguien presenta, juega o ve un render a pantalla completa, la burbuja se esconde.
  // Windows lo informa con SHQueryUserNotificationState; se consulta con un PowerShell oculto.
  let watcher = null, restarts = 0;
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

  // Pulso: cada página avisa cada 2 s que sigue viva. Si una deja de hacerlo (se colgó), se recarga sola.
  const lastAlive = { doll: Date.now(), avisos: Date.now() };
  const from = (e) => (alive(doll) && e.sender === doll.webContents ? "doll" : alive(avisos) && e.sender === avisos.webContents ? "avisos" : "");
  ipcMain.on("bubble-alive", (e) => { const w = from(e); if (w) lastAlive[w] = Date.now(); });
  const aliveTimer = setInterval(() => {
    for (const [which, w] of [["doll", doll], ["avisos", avisos]]) {
      if (!alive(w) || !ready[which]) continue;
      if (Date.now() - lastAlive[which] > 15000) {
        lastAlive[which] = Date.now();
        if (which === "avisos") { avisosH = 0; placeAvisos(); }
        w.webContents.reload();
      }
    }
  }, 5000);

  // La página de avisos dice cuánto alto necesita (0 = no hay avisos y la ventana se esconde).
  ipcMain.on("bubble-size", (e, h) => {
    if (from(e) !== "avisos") return;
    avisosH = Math.max(0, Math.min(2000, Math.round(Number(h) || 0)));
    placeAvisos();
  });

  // Arrastre del muñeco: el programa principal sigue el cursor; al soltar se pega al borde.
  ipcMain.on("bubble-drag", (e, phase) => {
    if (from(e) !== "doll") return;
    if (phase === "start") {
      const c = screen.getCursorScreenPoint(), b = doll.getBounds();
      drag = { ox: c.x - b.x, oy: c.y - b.y };
      if (alive(avisos) && avisos.isVisible()) avisos.hide();
      clearInterval(dragTimer);
      let still = 0, lx = c.x, ly = c.y;
      dragTimer = setInterval(() => {
        if (!drag || !alive(doll)) { clearInterval(dragTimer); return; }
        const p = screen.getCursorScreenPoint(), wa = area();
        if (p.x === lx && p.y === ly) { if (++still > 500) { clearInterval(dragTimer); drag = null; snap(); return; } } else { still = 0; lx = p.x; ly = p.y; }
        doll.setBounds({ x: clamp(p.x - drag.ox, wa.x, wa.x + wa.width - D.w), y: clamp(p.y - drag.oy, wa.y, wa.y + wa.height - D.h), width: D.w, height: D.h });
      }, 16);
    } else if (phase === "end" && drag) {
      clearInterval(dragTimer); drag = null; snap();
    }
  });

  // Menú nativo del sistema: no depende de la página, así que no se puede quedar sin responder.
  function menuTemplate() {
    const s = state || {};
    const pres = s.presencia || "disponible";
    const n = s.unread || 0;
    const custom = (act) => () => onAction({ type: "custom", act });
    const t = [
      { label: (s.me ? s.me.name : "LAP Cerebro") + " · " + ((PRESENCIAS.find((p) => p[0] === pres) || PRESENCIAS[0])[1]), enabled: false },
    ];
    if (n) t.push({ label: n === 1 ? "Ver 1 aviso sin leer" : `Ver ${n} avisos sin leer`, click: () => onAction({ type: "bell" }) });
    t.push({ type: "separator" });
    t.push(s.timer ? { label: "Terminar el Pomodoro", click: custom("pomo-stop") } : { label: "Empezar Pomodoro", click: custom("pomo-start") });
    t.push({ label: "Pausa activa ahora", click: custom("pausa-ahora") });
    if (s.agua) t.push({ label: `Tomé un vaso de agua (${s.agua.n}/${s.agua.meta})`, click: custom("agua-tome") });
    t.push({ type: "separator" });
    for (const [id, label] of PRESENCIAS) t.push({ label, type: "radio", checked: id === pres, click: () => onAction({ type: "presence", value: id }) });
    t.push({ type: "separator" });
    t.push({ label: "Abrir LAP Cerebro", click: () => onAction({ type: "open" }) });
    if (avisosH > 0) t.push({ label: "Cerrar los avisos de la burbuja", click: () => clearAll() });
    t.push({ label: s.muted ? "Activar el sonido" : "Silenciar el sonido", click: () => onAction({ type: "mute", value: !s.muted }) });
    t.push({ label: "Ocultar la burbuja", click: () => { setVisible(false); onAction({ type: "visibility", value: false }); } });
    return t;
  }
  let lastMenu = null;
  function popupMenu() {
    if (!alive(doll)) return;
    const m = Menu.buildFromTemplate(menuTemplate());
    lastMenu = m;
    m.popup({ window: doll });
  }
  ipcMain.on("bubble-menu", (e) => { if (from(e) === "doll") popupMenu(); });

  ipcMain.on("bubble-action", (e, a) => {
    if (!from(e) || !a || typeof a.type !== "string") return;
    if (a.type === "hide") { setVisible(false); onAction({ type: "visibility", value: false }); return; }
    onAction(a);
  });

  // Cerrar todos los avisos: la ventana se esconde de una vez, aunque la página no responda.
  function clearAll() {
    avisosH = 0;
    if (alive(avisos) && avisos.isVisible()) avisos.hide();
    send(avisos, "avisos", "bubble-notify", { clearAll: true });
    onAction({ type: "seen-all" });
  }

  function setVisible(on) { prefs.visible = !!on; save(); refresh(); }
  screen.on("display-removed", place);
  screen.on("display-added", place);
  screen.on("display-metrics-changed", place);

  return {
    async start() { await load(); create(); watchFullscreen(); },
    setState(s) { state = s; sendBoth("bubble-state", s); refresh(); },
    notify(n) {
      if (ready.avisos) send(avisos, "avisos", "bubble-notify", n); else queue.push(n);
      send(doll, "doll", "bubble-notify", n); // el muñeco salta o celebra
    },
    clearAll,
    setVisible,
    visible: () => prefs.visible,
    busy: () => busy,
    // Para pruebas.
    windows: () => ({ doll, avisos }),
    menuTemplate: () => menuTemplate().map((i) => ({ label: i.label, type: i.type, checked: i.checked, enabled: i.enabled })),
    clickMenu: (label) => { const i = menuTemplate().find((x) => x.label === label); if (i && i.click) i.click(); return !!(i && i.click); },
    lastMenu: () => lastMenu,
    setBlocked(v) { blocked = !!v; if (!blocked) keepTop(); },
    stop() {
      stopped = true;
      clearInterval(dragTimer); clearInterval(topTimer); clearInterval(aliveTimer);
      if (watcher) { try { watcher.kill(); } catch (e) { /* ya cerró */ } }
    },
  };
}

module.exports = { createBubble };
