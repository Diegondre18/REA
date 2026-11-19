// Burbuja de escritorio: dibuja el muñeco (contador de avisos, etiqueta del estado y Pomodoro).
// Es una ventana pequeña del tamaño del muñeco: clic abre el menú nativo, doble clic abre la app y
// arrastrar lo mueve. Los avisos van en otra ventana (avisos.js).
(() => {
  "use strict";
  const B = window.bubble;
  const PX = window.PIXCORE;
  const $ = (id) => document.getElementById(id);
  const doll = $("doll"), cv = $("cv"), count = $("count"), pill = $("pill");
  const PRES = Object.fromEntries(PX.PRESENCIAS.map((p) => [p.id, p]));

  let state = null, place = { side: "right", dx: 0, dy: 0, W: 84, H: 120, D: { w: 84, h: 120 } };
  let hop = 0, lastUnread = 0;

  /* ---------- muñeco ---------- */
  function paint(t) {
    const dpr = window.devicePixelRatio || 1;
    const w = place.D.w, h = place.D.h;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    if (!state || !state.me) return;
    // Se asoma por el borde de la pantalla: solo la cabeza y las manos agarrando el borde.
    const k = Math.max(5, Math.round(8 * dpr)), u = k / 2, ow = Math.max(1, Math.round(k * 0.28));
    const W = cv.width, H = cv.height;
    const pres = state.presencia || "disponible";
    const side = place.side || "right";
    const blink = (t % 4600) < 140;
    const cfg = { ...PX.withExtra(PX.config(state.me), pres, state.premios, t), pose: "", blink, look: side === "top" || side === "bottom" ? 0 : -1 };
    // Cuánto se asoma: al llegar un aviso sale más (y vuelve); en reposo se mece apenas.
    let peek = 0.64 + Math.sin(t / 1400) * 0.015;
    if (hop > 0) peek = 0.64 + Math.abs(Math.sin(((hop - t) / 1600) * Math.PI * 2)) * 0.26;
    const skin = cfg.piel, skinS = PX.shade(cfg.piel, 0.18);
    const hand = (x, y, w2, h2, vertical) => {
      const X = Math.round(x), Y = Math.round(y), WW = Math.round(w2), HH = Math.round(h2);
      ctx.fillStyle = PX.OUT; ctx.fillRect(X - ow, Y - ow, WW + 2 * ow, HH + 2 * ow);
      ctx.fillStyle = skin; ctx.fillRect(X, Y, WW, HH);
      ctx.fillStyle = skinS;
      if (vertical) { ctx.fillRect(X + Math.round(WW / 3), Y, Math.max(1, Math.round(u / 3)), Math.round(HH * 0.7)); ctx.fillRect(X + Math.round((2 * WW) / 3), Y, Math.max(1, Math.round(u / 3)), Math.round(HH * 0.7)); }
      else { ctx.fillRect(X, Y + Math.round(HH / 3), Math.round(WW * 0.7), Math.max(1, Math.round(u / 3))); ctx.fillRect(X, Y + Math.round((2 * HH) / 3), Math.round(WW * 0.7), Math.max(1, Math.round(u / 3))); }
    };
    let box;
    ctx.save();
    if (side === "left" || side === "right") {
      if (side === "left") { ctx.translate(W, 0); ctx.scale(-1, 1); }
      const x0 = W - peek * 20 * u - 2 * u, y0 = Math.round(H * 0.4 - 8 * u);
      const t0 = y0 - 3.5 * u - ow, b0 = y0 + 19.7 * u + ow;
      box = side === "right" ? { l: x0 - ow, r: W, t: t0, b: b0 } : { l: 0, r: W - x0 + ow, t: t0, b: b0 };
      PX.drawHead(ctx, Math.round(x0), y0, cfg, k, ow);
      hand(W - 3.2 * u, y0 - 3.5 * u, 3.4 * u, 4.2 * u, false);
      hand(W - 3.2 * u, y0 + 15.5 * u, 3.4 * u, 4.2 * u, false);
    } else {
      if (side === "top") { ctx.translate(W, H); ctx.rotate(Math.PI); }
      const x0 = Math.round((W - 24 * u) / 2), y0 = Math.round(H - Math.min(1, peek + 0.18) * 16 * u);
      box = side === "bottom" ? { l: x0 - ow, r: x0 + 24 * u + ow, t: y0 - ow, b: H } : { l: W - x0 - 24 * u - ow, r: W - x0 + ow, t: 0, b: H - y0 + ow };
      PX.drawHead(ctx, x0, y0, cfg, k, ow);
      hand(x0 + 0.5 * u, H - 3.2 * u, 4.2 * u, 3.4 * u, true);
      hand(x0 + 19.3 * u, H - 3.2 * u, 4.2 * u, 3.4 * u, true);
    }
    ctx.restore();
    // Vaso de agua que se llena durante el día, al lado de la cabeza (hacia la pantalla).
    if (state.agua) {
      const u = Math.max(2, Math.round(2 * dpr)), gh = 9 * u, gw = 6 * u;
      const gx = side === "left" ? Math.round(box.r + 3 * u) : side === "right" ? Math.round(box.l - gw - 4 * u) : Math.round(box.l - gw - 4 * u);
      const gy = side === "top" ? Math.round(box.t + 2 * u) : Math.round(box.b - gh - u);
      const lvl = Math.min(1, state.agua.n / Math.max(1, state.agua.meta));
      ctx.fillStyle = "#2a2228"; ctx.fillRect(gx - u, gy, u, gh); ctx.fillRect(gx + gw, gy, u, gh); ctx.fillRect(gx - u, gy + gh, gw + 2 * u, u);
      ctx.fillStyle = "rgba(200,225,238,0.55)"; ctx.fillRect(gx, gy, gw, gh);
      const fh = Math.round(gh * lvl);
      ctx.fillStyle = "#4aa8ff"; ctx.fillRect(gx, gy + gh - fh, gw, fh);
    }
    placeBadges(box, dpr, side);
  }
  // Contador de avisos y etiqueta del estado pegados a la cabeza, no a la caja.
  let lastBadges = "";
  let headBox = null; // caja de la cabeza y las manos, en pixeles de la ventana
  function placeBadges(box, dpr, side) {
    const l = box.l / dpr, r = box.r / dpr, t = box.t / dpr, b = box.b / dpr, cx = (l + r) / 2;
    headBox = { x: place.dx + l, y: place.dy + t, w: r - l, h: b - t };
    let c, pl;
    if (side === "right") { c = { left: l - 10, top: t - 4 }; pl = { right: 2, top: b + 3 }; }
    else if (side === "left") { c = { left: r - 10, top: t - 4 }; pl = { left: 2, top: b + 3 }; }
    else if (side === "bottom") { c = { left: r - 12, top: t - 8 }; pl = { cx, top: t - 22 }; }
    else { c = { left: r - 12, top: b - 12 }; pl = { cx, top: b + 3 }; }
    const key = JSON.stringify([c, pl]);
    if (key === lastBadges) return;
    lastBadges = key;
    Object.assign(count.style, { left: Math.round(c.left) + "px", top: Math.round(c.top) + "px", right: "auto" });
    Object.assign(pill.style, { top: Math.round(pl.top) + "px", bottom: "auto",
      left: pl.cx !== undefined ? Math.round(pl.cx) + "px" : pl.left !== undefined ? pl.left + "px" : "auto",
      right: pl.right !== undefined ? pl.right + "px" : "auto",
      transform: pl.cx !== undefined ? "translateX(-50%)" : "none" });
  }
  // Redibujo liviano: 10 cuadros por segundo bastan para respirar; al saltar, cada cuadro.
  let lastPaint = 0;
  function tick(t) {
    if (hop > 0 || t - lastPaint > 100) {
      lastPaint = t;
      paint(t);
      timerPill();
      drawConfetti(t);
      if (hop > 0 && t > hop) hop = 0;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Cuenta regresiva del Pomodoro bajo el muñeco (reemplaza la etiqueta del estado).
  function timerPill() {
    const tm = state && state.timer;
    if (!tm) { if (pill.dataset.timer) { pill.dataset.timer = ""; pill.classList.remove("blink"); render(); } return; }
    pill.dataset.timer = "1";
    pill.hidden = false;
    pill.style.background = tm.color || "";
    pill.classList.toggle("blink", !!tm.blink);
    const left = tm.endsAt ? Math.max(0, Math.round((tm.endsAt - Date.now()) / 1000)) : -1;
    const txt = left >= 0 ? `${tm.label} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : tm.label;
    if (pill.textContent !== txt) pill.textContent = txt;
  }

  /* ---------- confeti (celebraciones) ---------- */
  const fx = document.createElement("canvas");
  fx.id = "fx"; document.body.appendChild(fx);
  let parts = [], fxUntil = 0;
  function burst(big) {
    const dpr = window.devicePixelRatio || 1;
    fx.width = place.W * dpr; fx.height = place.H * dpr;
    const cx = (place.dx + place.D.w / 2) * dpr, cy = (place.dy + 20) * dpr;
    const cols = ["#0057ff", "#ea0029", "#e8c100", "#1f9d55", "#7c4dff", "#f08c00"];
    parts = Array.from({ length: big ? 90 : 45 }, () => ({ x: cx, y: cy, vx: (Math.random() - 0.5) * 7 * dpr, vy: (-Math.random() * 7 - 2) * dpr, c: cols[(Math.random() * cols.length) | 0], s: Math.round((2 + Math.random() * 3) * dpr) }));
    fxUntil = performance.now() + 2400;
  }
  function drawConfetti(t) {
    const ctx = fx.getContext("2d");
    if (!parts.length) return;
    ctx.clearRect(0, 0, fx.width, fx.height);
    if (t > fxUntil) { parts = []; return; }
    const dpr = window.devicePixelRatio || 1;
    for (const p of parts) { p.vy += 0.28 * dpr; p.x += p.vx; p.y += p.vy; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  }

  function render() {
    if (!state) return;
    const root = document.documentElement;
    if (state.theme === "light" || state.theme === "dark") root.setAttribute("data-theme", state.theme); else root.removeAttribute("data-theme");
    const pres = PRES[state.presencia] || PRES.disponible;
    doll.style.setProperty("--ring", pres.color);
    doll.classList.toggle("away", state.presencia === "fuera");
    if (!state.timer) { pill.hidden = pres.id === "disponible"; pill.textContent = pres.label; pill.style.background = ""; }
    const n = state.unread || 0;
    count.hidden = !n;
    count.textContent = n > 99 ? "99+" : String(n);
    if (n > lastUnread) { count.classList.remove("pop"); void count.offsetWidth; count.classList.add("pop"); }
    lastUnread = n;
    doll.title = `${state.me ? state.me.name : ""} · ${pres.label}${n ? ` · ${n} sin leer` : ""}`;
  }


  /* ---------- mouse: clic = menú, doble clic = abrir la app, arrastrar = mover ---------- */
  let press = null, dragging = false, clickTimer = 0;
  doll.addEventListener("mousedown", (ev) => { if (ev.button === 0) press = { x: ev.screenX, y: ev.screenY }; });
  window.addEventListener("mousemove", (ev) => {
    if (press && !dragging && !(ev.buttons & 1)) { press = null; return; } // se soltó fuera de la ventana
    if (press && !dragging && Math.hypot(ev.screenX - press.x, ev.screenY - press.y) > 4) {
      dragging = true; doll.classList.add("dragging"); B.drag("start");
    }
  });
  window.addEventListener("mouseup", (ev) => {
    if (dragging) { dragging = false; press = null; doll.classList.remove("dragging"); B.drag("end"); return; }
    if (!press) return;
    press = null;
    if (ev.button !== 0) return;
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = 0; B.action({ type: "open" }); return; }
    clickTimer = setTimeout(() => { clickTimer = 0; B.menu(); }, 230);
  });
  // El muñeco es pequeño: al arrastrar rápido el mouse sale de la ventana antes de que esta lo siga.
  // Por eso salir no cancela; solo cancela soltar el botón (ver mousemove y mouseup).
  doll.addEventListener("contextmenu", (ev) => { ev.preventDefault(); B.menu(); });

  // Pulso para que el programa principal sepa que la página sigue viva.
  setInterval(() => { if (B.alive) B.alive(); }, 2000);

  B.onPlace((p) => { place = { ...place, ...p }; });
  B.onState((s) => { state = s; render(); });
  B.onNotify((n) => {
    if (!n) return;
    if (n.celebrate) { burst(n.big); hop = performance.now() + 2400; return; }
    if (n.nag) { hop = performance.now() + 2000; return; }
    if (n.id && !n.clear) hop = performance.now() + 1600;
  });
})();
