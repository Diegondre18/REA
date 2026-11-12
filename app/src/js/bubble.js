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
    const ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    if (!state || !state.me) return;
    const k = Math.max(3, Math.round(3.6 * dpr)), ow = Math.max(1, Math.round(k * 0.35));
    const pres = state.presencia || "disponible";
    const cfg = PX.withExtra(PX.config(state.me), pres, state.premios, t);
    // Salta al llegar un aviso; si no, respira de vez en cuando.
    let lift = 0, frame = 0, flip = false;
    if (hop > 0) {
      const p = (t % 400) / 400;
      lift = Math.round(Math.sin(p * Math.PI) * 4);
      frame = p < 0.5 ? 1 : 3; flip = Math.floor(t / 400) % 2 === 1;
    } else if (Math.floor(t / 3000) % 3 === 0 && (t % 3000) < 500) lift = 1;
    const x = Math.round((w * dpr - 12 * k) / 2), y = Math.round(h * dpr - 22 * k - 14 * dpr) - lift * Math.round(dpr);
    PX.drawFigure(ctx, x, y, cfg, "front", frame, false, flip, k, ow);
    // Vaso de agua que se llena durante el día.
    if (state.agua) {
      const u = Math.max(2, Math.round(2 * dpr)), gx = Math.round(4 * dpr), gh = 9 * u, gw = 6 * u, gy = Math.round(h * dpr - 18 * dpr) - gh;
      const lvl = Math.min(1, state.agua.n / Math.max(1, state.agua.meta));
      ctx.fillStyle = "#2a2228"; ctx.fillRect(gx - u, gy, u, gh); ctx.fillRect(gx + gw, gy, u, gh); ctx.fillRect(gx - u, gy + gh, gw + 2 * u, u);
      ctx.fillStyle = "rgba(200,225,238,0.55)"; ctx.fillRect(gx, gy, gw, gh);
      const fh = Math.round(gh * lvl);
      ctx.fillStyle = "#4aa8ff"; ctx.fillRect(gx, gy + gh - fh, gw, fh);
    }
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

  /* ---------- mouse: clics pasan de largo salvo sobre el muñeco, los globitos o el menú ---------- */
  let interactive = false, press = null, dragging = false, clickTimer = 0, leaveTimer = 0;
  function setInteractive(on) { if (on !== interactive) { interactive = on; B.interactive(on); } }
  window.addEventListener("mousemove", (ev) => {
    if (press && !dragging && Math.hypot(ev.screenX - press.x, ev.screenY - press.y) > 4) {
      dragging = true; doll.classList.add("dragging"); closeMenu(); B.drag("start");
    }
    if (dragging) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const hit = !!(el && el.closest("[data-hit]"));
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
