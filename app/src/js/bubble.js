// Burbuja de escritorio: dibuja el muñeco, muestra globitos con los avisos y el menú de estados.
// No habla con el servidor: todo lo pide a la app principal, que sigue abierta en la bandeja.
(() => {
  "use strict";
  const B = window.bubble;
  const PX = window.PIXCORE;
  const $ = (id) => document.getElementById(id);
  const doll = $("doll"), cv = $("cv"), count = $("count"), pill = $("pill"), balloons = $("balloons"), menu = $("menu");
  const PRES = Object.fromEntries(PX.PRESENCIAS.map((p) => [p.id, p]));

  let state = null, place = { side: "right", dx: 300, dy: 200, W: 380, H: 300, D: { w: 84, h: 120 } };
  let cards = []; // { n, el, timer }
  let hop = 0, menuOpen = false, lastUnread = 0;

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
      sendRegions();
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
    if (menuOpen) { buildMenu(); fitMenu(); }
  }

  /* ---------- ubicación de globitos y menú según el borde ---------- */
  function layout() {
    const { side, dx, dy, W, H, D } = place;
    doll.style.left = dx + "px"; doll.style.top = dy + "px";
    for (const el of [balloons, menu]) {
      el.style.left = el.style.right = el.style.top = el.style.bottom = "";
      const w = el === menu ? 236 : 268;
      el.classList.toggle("up", false);
      if (side === "left" || side === "right") {
        if (side === "right") el.style.right = (W - dx + 6) + "px"; else el.style.left = (dx + D.w + 6) + "px";
        if (dy + D.h / 2 > H / 2) { el.style.bottom = Math.max(4, H - dy - D.h) + "px"; el.classList.add("up"); } else el.style.top = Math.max(4, dy) + "px";
      } else {
        el.style.left = Math.max(4, Math.min(W - w - 4, dx + D.w / 2 - w / 2)) + "px";
        if (side === "bottom") { el.style.bottom = (H - dy + 6) + "px"; el.classList.add("up"); } else el.style.top = (dy + D.h + 6) + "px";
      }
    }
  }

  /* ---------- globitos ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function dismiss(c) {
    clearTimeout(c.timer);
    c.el.remove();
    cards = cards.filter((x) => x !== c);
    renderMore();
  }
  function renderMore() {
    const extra = cards.length - 3;
    cards.forEach((c, i) => { c.el.hidden = i >= 3; });
    let more = balloons.querySelector(".more");
    if (extra > 0) {
      if (!more) { more = document.createElement("div"); more.className = "more"; more.setAttribute("data-hit", ""); balloons.appendChild(more); more.onclick = () => B.action({ type: "bell" }); }
      more.textContent = `+${extra} avisos más`;
    } else if (more) more.remove();
  }
  function arm(c) {
    clearTimeout(c.timer);
    if (c.n.urgente || c.n.sticky) return; // lo urgente y los descansos se quedan hasta que se atienden
    c.timer = setTimeout(() => dismiss(c), c.n.kind === "toque" ? 45000 : 10000);
  }
  function addCard(n) {
    if (cards.some((c) => c.n.id === n.id)) return;
    const el = document.createElement("div");
    el.className = "card" + (n.urgente ? " urgente" : "") + (n.kind === "bienestar" ? " bienestar" : "") + (n.kind === "fiesta" ? " fiesta" : "");
    el.setAttribute("data-hit", "");
    el.setAttribute("role", "button");
    const acts = n.kind === "toque" && !n.respuesta
      ? `<div class="acts"><button type="button" data-r="voy">Voy</button><button type="button" data-r="10">En 10 min</button><button type="button" data-r="no">Ahora no</button></div>`
      : n.actions && n.actions.length ? `<div class="acts">${n.actions.map((x) => `<button type="button" data-c="${esc(x.a)}">${esc(x.label)}</button>`).join("")}</div>` : "";
    el.innerHTML = `${n.urgente ? `<span class="tag">${n.kind === "toque" ? "Dirección" : "Importante"}</span>` : ""}<b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ""}${acts}<button type="button" class="x" aria-label="Cerrar">×</button>`;
    const c = { n, el, timer: 0 };
    el.addEventListener("click", (ev) => {
      const r = ev.target.closest("[data-r]");
      if (ev.target.closest(".x")) { B.action({ type: "seen", id: n.id }); dismiss(c); return; }
      if (r) { B.action({ type: "reply", id: n.id, respuesta: r.dataset.r }); dismiss(c); return; }
      const cc = ev.target.closest("[data-c]");
      if (cc) { B.action({ type: "custom", id: n.id, act: cc.dataset.c }); dismiss(c); return; }
      if (n.kind === "bienestar" || n.kind === "fiesta") { if (n.kind === "fiesta") dismiss(c); return; }
      B.action({ type: "open", id: n.id, route: n.route || "" });
      dismiss(c);
    });
    el.addEventListener("mouseenter", () => clearTimeout(c.timer));
    el.addEventListener("mouseleave", () => arm(c));
    cards.unshift(c);
    balloons.insertBefore(el, balloons.firstChild);
    arm(c);
    renderMore();
    hop = performance.now() + 1600;
    closeMenu();
  }

  /* ---------- menú ---------- */
  function buildMenu() {
    const pres = state.presencia || "disponible";
    const n = state.unread || 0;
    menu.innerHTML = `<div class="head"><b>${esc(state.me ? state.me.name : "")}</b><small>${esc((PRES[pres] || PRES.disponible).label)}</small></div>
      ${n ? `<button type="button" class="unread" data-a="bell">Ver ${n === 1 ? "1 aviso sin leer" : n + " avisos sin leer"}</button><div class="sep"></div>` : ""}
      ${state.timer ? `<button type="button" data-c="pomo-stop">Terminar el Pomodoro</button>` : `<button type="button" data-c="pomo-start">Empezar Pomodoro</button>`}
      <button type="button" data-c="pausa-ahora">Pausa activa ahora</button>
      ${state.agua ? `<button type="button" data-c="agua-tome">Tomé un vaso de agua (${state.agua.n}/${state.agua.meta})</button>` : ""}
      <div class="sep"></div>
      ${PX.PRESENCIAS.map((p) => `<button type="button" role="menuitemradio" aria-checked="${p.id === pres}" data-p="${p.id}"><i class="dot" style="background:${p.color}"></i>${p.label}</button>${p.id === pres && p.hint ? `<div class="hint">${esc(p.hint)}</div>` : ""}`).join("")}
      <div class="sep"></div>
      <button type="button" data-a="open">Abrir LAP Cerebro</button>
      <button type="button" data-a="mute">${state.muted ? "Activar el sonido" : "Silenciar el sonido"}</button>
      <button type="button" data-a="hide">Ocultar la burbuja</button>
      <div class="hint">${state.muted ? "Lo urgente suena igual." : "Vuelve desde el ícono junto al reloj o tu perfil."}</div>`;
  }
  function openMenu() { if (!state) return; menuOpen = true; buildMenu(); menu.hidden = false; balloons.hidden = true; fitMenu(); }
  // El menú se abre hacia donde haya espacio, sin salirse de la ventana.
  function fitMenu() {
    const { side, dy, H, D } = place;
    if (side === "top" || side === "bottom") return;
    const h = menu.offsetHeight;
    menu.style.top = menu.style.bottom = "";
    if (dy + h <= H - 4) menu.style.top = dy + "px";
    else if (dy + D.h - h >= 4) menu.style.bottom = (H - dy - D.h) + "px";
    else menu.style.top = "4px";
  }
  function closeMenu() { menuOpen = false; menu.hidden = true; balloons.hidden = false; }
  menu.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.c) B.action({ type: "custom", act: b.dataset.c });
    else if (b.dataset.p) B.action({ type: "presence", value: b.dataset.p });
    else if (b.dataset.a === "mute") B.action({ type: "mute", value: !state.muted });
    else if (b.dataset.a) B.action({ type: b.dataset.a });
    closeMenu();
  });

  /* ---------- zonas que reciben el mouse ----------
     El programa principal mira dónde está el mouse y solo deja de pasar los clics cuando está sobre estas
     zonas. No depende de los eventos que Windows reenvía a las ventanas transparentes (fallan a veces). */
  let lastRegions = "";
  function sendRegions() {
    const rs = [];
    const add = (el, pad = 0) => {
      if (!el || el.hidden || el.offsetParent === null && el !== menu) return;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) rs.push({ x: Math.round(r.left - pad), y: Math.round(r.top - pad), w: Math.round(r.width + 2 * pad), h: Math.round(r.height + 2 * pad) });
    };
    if (headBox && state && state.me) rs.push({ x: Math.round(headBox.x - 3), y: Math.round(headBox.y - 3), w: Math.round(headBox.w + 6), h: Math.round(headBox.h + 6) });
    add(count); add(pill);
    if (menuOpen) add(menu, 4);
    else for (const el of balloons.querySelectorAll(".card, .more")) add(el, 2);
    const key = JSON.stringify(rs);
    if (key !== lastRegions) { lastRegions = key; B.regions(rs); }
  }
  // Pulso y zonas con un reloj aparte: el dibujo puede pausarse cuando Windows cree que la ventana no se ve.
  setInterval(() => { if (B.alive) B.alive(); lastRegions = ""; sendRegions(); }, 2000);
  if (B.onHover) B.onHover((on) => {
    if (!on && !dragging && press) press = null; // un clic que quedó a medias no bloquea el siguiente
    if (!menuOpen || dragging) return;
    clearTimeout(leaveTimer);
    if (!on) leaveTimer = setTimeout(closeMenu, 1500);
  });

  /* ---------- mouse: clics pasan de largo salvo sobre el muñeco, los globitos o el menú ---------- */
  let interactive = false, press = null, dragging = false, clickTimer = 0, leaveTimer = 0;
  // ¿Hay dibujo bajo el mouse? (con 3 px de margen para que sea fácil de agarrar)
  function painted(x, y) {
    const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
    const px = Math.round((x - r.left) * dpr), py = Math.round((y - r.top) * dpr), m = Math.round(3 * dpr);
    const x0 = Math.max(0, px - m), y0 = Math.max(0, py - m), w = Math.min(cv.width, px + m + 1) - x0, h = Math.min(cv.height, py + m + 1) - y0;
    if (w <= 0 || h <= 0) return false;
    const d = cv.getContext("2d", { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
    return false;
  }
  function setInteractive(on) { if (B.regions) return; if (on !== interactive) { interactive = on; B.interactive(on); } }
  window.addEventListener("mousemove", (ev) => {
    if (press && !dragging && Math.hypot(ev.screenX - press.x, ev.screenY - press.y) > 4) {
      dragging = true; doll.classList.add("dragging"); closeMenu(); B.drag("start");
    }
    if (dragging) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    let hit = !!(el && el.closest("[data-hit]"));
    if (hit && (el === cv || el === doll)) hit = painted(ev.clientX, ev.clientY);
    setInteractive(hit);
    if (menuOpen) {
      clearTimeout(leaveTimer);
      if (!hit) leaveTimer = setTimeout(closeMenu, 1500);
    }
  });
  document.addEventListener("mouseleave", () => { if (!dragging && !press) setInteractive(false); if (menuOpen) { clearTimeout(leaveTimer); leaveTimer = setTimeout(closeMenu, 1500); } });
  doll.addEventListener("mousedown", (ev) => { if (ev.button === 0) press = { x: ev.screenX, y: ev.screenY }; });
  window.addEventListener("mouseup", (ev) => {
    if (dragging) { dragging = false; press = null; doll.classList.remove("dragging"); B.drag("end"); return; }
    if (!press) return;
    press = null;
    if (ev.button !== 0 || !ev.target.closest("#doll")) return;
    // Un clic abre el menú; doble clic abre la app.
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = 0; closeMenu(); B.action({ type: "open" }); return; }
    clickTimer = setTimeout(() => { clickTimer = 0; if (menuOpen) closeMenu(); else openMenu(); }, 230);
  });
  doll.addEventListener("contextmenu", (ev) => { ev.preventDefault(); openMenu(); });

  B.onPlace((p) => { place = p; layout(); });
  B.onState((s) => { state = s; render(); });
  B.onNotify((n) => {
    if (n && n.clearAll) { for (const c of [...cards]) dismiss(c); return; }
    if (n && n.nag) { hop = performance.now() + 2000; const c = cards.find((x) => x.n.id === n.nag); if (c) { c.el.classList.remove("shake"); void c.el.offsetWidth; c.el.classList.add("shake"); } return; }
    if (n && n.celebrate) {
      burst(n.big); hop = performance.now() + 2400;
      addCard({ id: "fiesta-" + Date.now(), kind: "fiesta", title: n.celebrate });
      return;
    }
    if (n && n.clear) { const c = cards.find((x) => x.n.id === n.clear); if (c) dismiss(c); return; }
    if (n && n.id) addCard(n);
  });
  layout();
})();
