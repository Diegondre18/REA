// Avisos de la burbuja en su propia ventana, al lado del muñeco. La ventana mide lo que muestra:
// máximo 3 avisos, "+N avisos más" y siempre el botón "Cerrar todos". Sin avisos, se esconde.
(() => {
  "use strict";
  const B = window.bubble;
  const $ = (id) => document.getElementById(id);
  const lista = $("lista"), box = $("cards"), more = $("more"), todos = $("todos");
  const MAX = 3;
  let cards = []; // { n, el, timer }
  let abajo = true;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Le dice al programa principal cuánto alto necesita la ventana (0 = esconderla).
  let lastH = -1;
  function size() {
    const h = cards.length ? Math.ceil(lista.getBoundingClientRect().height) + 16 : 0;
    if (h !== lastH) { lastH = h; B.size(h); }
  }
  new ResizeObserver(size).observe(lista);

  function dismiss(c) {
    clearTimeout(c.timer);
    c.el.remove();
    cards = cards.filter((x) => x !== c);
    renderMore();
  }
  // Lo urgente y lo que espera respuesta (toques, Pomodoro, pausas) va siempre arriba y a la vista;
  // después, lo más reciente.
  const peso = (c) => (c.n.urgente || c.n.sticky || c.n.kind === "toque" ? 0 : 1);
  function renderMore() {
    cards.sort((a, b) => peso(a) - peso(b) || b.t - a.t);
    for (const c of cards) box.appendChild(c.el);
    cards.forEach((c, i) => { c.el.hidden = i >= MAX; });
    const extra = cards.length - MAX;
    more.hidden = extra <= 0;
    more.textContent = extra > 0 ? `+${extra} ${extra === 1 ? "aviso más" : "avisos más"}` : "";
    todos.textContent = cards.length > 1 ? "Cerrar todos" : "Cerrar";
    size();
  }
  // Los avisos normales se cierran solos; lo urgente y los descansos esperan respuesta.
  function arm(c) {
    clearTimeout(c.timer);
    if (c.n.urgente || c.n.sticky) return;
    c.timer = setTimeout(() => dismiss(c), c.n.kind === "toque" ? 45000 : 10000);
  }
  function addCard(n) {
    const prev = cards.find((c) => c.n.id === n.id);
    if (prev) return; // el mismo aviso no se repite
    const el = document.createElement("div");
    el.className = "card" + (n.urgente ? " urgente" : "") + (n.kind === "bienestar" ? " bienestar" : "") + (n.kind === "fiesta" ? " fiesta" : "");
    el.setAttribute("role", "button");
    const acts = n.kind === "toque" && !n.respuesta
      ? `<div class="acts"><button type="button" data-r="voy">Voy</button><button type="button" data-r="10">En 10 min</button><button type="button" data-r="no">Ahora no</button></div>`
      : n.actions && n.actions.length ? `<div class="acts">${n.actions.map((x) => `<button type="button" data-c="${esc(x.a)}">${esc(x.label)}</button>`).join("")}</div>` : "";
    el.innerHTML = `${n.urgente ? `<span class="tag">${n.kind === "toque" ? "Dirección" : "Importante"}</span>` : ""}<b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ""}${acts}<button type="button" class="x" aria-label="Cerrar">×</button>`;
    const c = { n, el, timer: 0, t: Date.now() + Math.random() };
    el.addEventListener("click", (ev) => {
      const r = ev.target.closest("[data-r]");
      if (ev.target.closest(".x")) { B.action({ type: "seen", id: n.id }); dismiss(c); return; }
      if (r) { B.action({ type: "reply", id: n.id, respuesta: r.dataset.r }); dismiss(c); return; }
      const cc = ev.target.closest("[data-c]");
      if (cc) { B.action({ type: "custom", id: n.id, act: cc.dataset.c }); dismiss(c); return; }
      if (n.kind === "bienestar") return;
      if (n.kind !== "fiesta") B.action({ type: "open", id: n.id, route: n.route || "" });
      dismiss(c);
    });
    el.addEventListener("mouseenter", () => clearTimeout(c.timer));
    el.addEventListener("mouseleave", () => arm(c));
    cards.unshift(c);
    box.insertBefore(el, box.firstChild);
    arm(c);
    renderMore();
  }
  function clearAll() { for (const c of [...cards]) dismiss(c); }

  todos.addEventListener("click", () => { for (const c of cards) B.action({ type: "seen", id: c.n.id }); clearAll(); });
  more.addEventListener("click", () => B.action({ type: "bell" }));

  setInterval(() => { if (B.alive) B.alive(); }, 2000);

  B.onPlace((p) => { abajo = !!p.abajo; document.body.classList.toggle("abajo", abajo); });
  B.onState((s) => {
    const root = document.documentElement;
    if (s && (s.theme === "light" || s.theme === "dark")) root.setAttribute("data-theme", s.theme); else root.removeAttribute("data-theme");
  });
  B.onNotify((n) => {
    if (!n) return;
    if (n.clearAll) { clearAll(); return; }
    if (n.nag) { const c = cards.find((x) => x.n.id === n.nag); if (c) { c.el.classList.remove("shake"); void c.el.offsetWidth; c.el.classList.add("shake"); } return; }
    if (n.celebrate) { addCard({ id: "fiesta-" + Date.now(), kind: "fiesta", title: n.celebrate }); return; }
    if (n.clear) { const c = cards.find((x) => x.n.id === n.clear); if (c) dismiss(c); return; }
    if (n.id) addCard(n);
  });
  size();
})();
