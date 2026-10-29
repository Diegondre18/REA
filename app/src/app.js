(() => {
  "use strict";

  const STAGES = [
    { id: "cola", label: "En cola" },
    { id: "escena", label: "Escena" },
    { id: "render", label: "Renderizando" },
    { id: "post", label: "Postproducción" },
    { id: "revision", label: "Revisión" },
    { id: "guardado", label: "Guardado" },
  ];
  const STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s]));
  const BOARD = ["cola", "escena", "render", "post", "revision"];
  const WORKING = ["escena", "render", "post"];
  const TYPES = ["Exterior", "Interior", "Aérea", "Detalle", "Recorrido 360", "Animación"];
  const ENGINES = ["V-Ray", "Corona", "D5 Render", "Lumion", "Enscape", "Twinmotion", "Unreal Engine", "Blender Cycles"];
  const RESOLUTIONS = ["1920×1080", "3840×2160", "5000×2813", "6000×4000", "7680×4320"];
  const FEED_DAYS = 30;

  const state = {
    renders: [], entregas: [], equipo: [], actividad: [], people: {},
    view: "resumen", q: "", archProj: "", weeks: 8, shift: 0,
    mode: "connecting", ready: false, canWrite: true, me: null, team: false,
    sheet: null, confirmDelete: false, gate: null,
  };
  const desk = window.lap || null;

  /* ---------- utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 864e5;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const diff = (a, b) => Math.round((b - a) / DAY);
  const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / DAY + 1) / 7);
  };
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const INI = ["D", "L", "M", "M", "J", "V", "S"];
  const fmtShort = (d) => `${d.getDate()} ${MES[d.getMonth()]}`;
  const relDay = (s) => {
    const d = parse(s); if (!d) return "Sin fecha";
    const n = diff(today(), d);
    if (n === 0) return "Hoy";
    if (n === 1) return "Mañana";
    if (n === -1) return "Ayer";
    if (n < 0) return `Hace ${-n} días`;
    if (n < 7) return `En ${n} días`;
    return fmtShort(d);
  };
  const relTime = (stamp) => {
    const t = Date.parse(stamp); if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "hace un momento";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    const d = new Date(t);
    return diff(new Date(d.getFullYear(), d.getMonth(), d.getDate()), today()) === 1 ? "ayer" : fmtShort(d);
  };
  const dueClass = (r) => {
    const d = parse(r.due); if (!d || r.status === "guardado") return "";
    const n = diff(today(), d);
    return n < 0 ? "late" : n <= 2 ? "soon" : "";
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999");
  const stripId = ({ id, ...rest }) => rest;
  const nowIso = () => new Date().toISOString();

  function filtered() {
    const q = state.q.trim().toLowerCase();
    if (!q) return state.renders;
    return state.renders.filter((r) =>
      [r.title, r.project, r.artist, r.type, r.engine, r.path, r.version, STAGE[r.status]?.label]
        .some((v) => String(v || "").toLowerCase().includes(q)));
  }

  /* ---------- personas ---------- */
  // "Conectado" = la app abierta y latiendo en los últimos 2,5 minutos.
  const ONLINE_MS = 150000;
  const isOnline = (u) => u.id === state.me || (!!u.lastSeen && Date.now() - Date.parse(u.lastSeen) < ONLINE_MS);
  const personName = (id) => {
    if (!id) return "Tú";
    const p = state.people[id];
    const n = (p && p.name) || "";
    if (id === state.me) return n ? `${n} (tú)` : "Tú";
    return n || "Alguien del equipo";
  };
  const firstName = (id) => {
    const n = (id && state.people[id] && state.people[id].name) || "";
    if (n) return n.split(/\s+/)[0];
    return !id || id === state.me ? "Tú" : "Alguien";
  };
  const avatar = (id, cls = "") => {
    const p = id && state.people[id];
    const title = esc(personName(id));
    return p && p.avatarUrl
      ? `<img class="av ${cls}" src="${esc(p.avatarUrl)}" alt="" title="${title}">`
      : `<span class="av ${cls}" title="${title}">${esc(initials((p && p.name) || personName(id)))}</span>`;
  };

  function roster() {
    return state.equipo
      .map((u) => ({ id: u.id, renderId: u.renderId || null, since: u.since, lastSeen: u.lastSeen, online: isOnline(u) }))
      .filter((p) => p.online || p.renderId || p.lastSeen)
      .sort((a, b) => (b.online - a.online) || ((b.renderId ? 1 : 0) - (a.renderId ? 1 : 0)) || personName(a.id).localeCompare(personName(b.id), "es"));
  }
  const workingOn = (rid) => state.equipo.filter((e) => e.renderId === rid).map((e) => e.id);
  const viewingNow = (rid) => state.equipo.filter((u) => u.id !== state.me && u.viewing === rid && isOnline(u)).map((u) => u.id);
  function faces(rid) {
    const w = workingOn(rid);
    const v = viewingNow(rid).filter((id) => !w.includes(id));
    if (!w.length && !v.length) return "";
    return `<span class="faces">${w.slice(0, 3).map((id) => avatar(id)).join("")}${v.slice(0, 2).map((id) => avatar(id, "viewing")).join("")}</span>`;
  }

  // Avisa al equipo qué render tiene abierto esta persona (solo cuando cambia).
  let lastViewing = null;
  function sendPresence() {
    if (!store.pb || !state.me) return;
    const renderId = state.sheet && state.sheet.kind === "render" && state.sheet.id ? state.sheet.id : "";
    if (renderId === lastViewing) return;
    lastViewing = renderId;
    store.pb.collection("users").update(state.me, { viewing: renderId, lastSeen: nowIso() }).catch(() => {});
  }

  /* ---------- datos: servidor PocketBase de la oficina, o este PC en modo de prueba ---------- */
  const CONFIG_KEY = "lap-cerebro-config";
  const LOCAL_KEY = "lap-cerebro-local";
  const config = {
    load() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch (e) { return {}; } },
    save(c) { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch (e) { /* bloqueado */ } },
  };
  const pbDate = (s) => (s ? String(s).replace(" ", "T") : "");
  const fromRecord = ({ collectionId, collectionName, expand, created, updated, ...rest }) =>
    ({ ...rest, createdAt: pbDate(created), updatedAt: pbDate(updated) });
  const toRecord = ({ id, createdAt, updatedAt, collectionId, collectionName, expand, created, updated, ...rest }) => rest;
  const fromEvent = (r) => ({ id: r.id, t: pbDate(r.created), by: r.by || null, kind: r.kind, renderId: r.renderId || null, title: r.title, project: r.project, to: r.to });

  const store = {
    pb: null,
    local: false,
    beat: 0,

    setUser(u) {
      const row = { id: u.id, name: u.name || "", renderId: u.renderId || null, since: u.since || "", lastSeen: u.lastSeen || "", viewing: u.viewing || "" };
      const i = state.equipo.findIndex((x) => x.id === u.id);
      if (i >= 0) state.equipo[i] = row; else state.equipo.push(row);
      state.people[u.id] = {
        name: u.name || (u.email ? u.email.split("@")[0] : ""),
        avatarUrl: u.avatar ? this.pb.files.getURL(u, u.avatar, { thumb: "64x64" }) : "",
      };
    },
    upsert(col, row) {
      const arr = state[col];
      const i = arr.findIndex((x) => x.id === row.id);
      if (i >= 0) arr[i] = row; else arr.push(row);
    },

    async loadAll() {
      const pb = this.pb;
      const [r, e, u, a] = await Promise.all([
        pb.collection("renders").getFullList({ batch: 500 }),
        pb.collection("entregas").getFullList({ batch: 500 }),
        pb.collection("users").getFullList({ batch: 200 }),
        pb.collection("actividad").getList(1, 40, { sort: "-created" }),
      ]);
      state.renders = r.map(fromRecord);
      state.entregas = e.map(fromRecord);
      state.equipo = []; u.forEach((x) => this.setUser(x));
      state.actividad = a.items.map(fromEvent);
      state.mode = "live"; state.ready = true;
      schedule(); refreshSheetPresence();
    },

    async startLive() {
      const pb = this.pb;
      state.me = pb.authStore.record.id;
      state.team = true;
      state.mode = "connecting";
      closeGate();
      schedule();
      await this.loadAll();
      const live = (col, map) => pb.collection(col).subscribe("*", (ev) => {
        if (ev.action === "delete") state[col] = state[col].filter((x) => x.id !== ev.record.id);
        else this.upsert(col, map(ev.record));
        schedule(); refreshSheetPresence();
      });
      await Promise.all([
        live("renders", fromRecord),
        live("entregas", fromRecord),
        pb.collection("users").subscribe("*", (ev) => {
          if (ev.action === "delete") state.equipo = state.equipo.filter((x) => x.id !== ev.record.id);
          else this.setUser(ev.record);
          schedule(); refreshSheetPresence();
        }),
        pb.collection("actividad").subscribe("*", (ev) => {
          if (ev.action !== "create") return;
          state.actividad = [fromEvent(ev.record), ...state.actividad.filter((x) => x.id !== ev.record.id)].slice(0, 40);
          schedule();
        }),
      ]);
      // Al recuperar la conexión se vuelve a leer todo, por si algo cambió mientras tanto.
      let first = true;
      pb.realtime.subscribe("PB_CONNECT", () => { if (first) { first = false; return; } this.loadAll().catch(() => {}); });
      pb.realtime.onDisconnect = () => { state.mode = "offline"; schedule(); };
      clearInterval(this.beat);
      const beat = () => pb.collection("users").update(state.me, { lastSeen: nowIso() }).then(() => {
        if (state.mode === "offline") this.loadAll().catch(() => {});
      }).catch((e) => { if (e && e.status === 0) { state.mode = "offline"; schedule(); } });
      beat();
      this.beat = setInterval(beat, 60000);
    },

    startLocal() {
      this.local = true;
      state.mode = "local"; state.team = false; state.me = null;
      try {
        const j = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
        state.renders = Array.isArray(j.renders) ? j.renders : [];
        state.entregas = Array.isArray(j.entregas) ? j.entregas : [];
        state.actividad = Array.isArray(j.actividad) ? j.actividad : [];
      } catch (e) { /* bloqueado */ }
      state.ready = true;
      closeGate();
      schedule();
    },
    saveLocal() {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ renders: state.renders, entregas: state.entregas, actividad: state.actividad.slice(0, 50) })); } catch (e) { /* bloqueado */ }
    },

    // Crea (sin id) o actualiza; devuelve el id del registro.
    async put(col, id, data) {
      if (this.local) {
        const rid = id || newId(col[0]);
        this.upsert(col, { ...data, id: rid });
        this.saveLocal(); schedule();
        return rid;
      }
      const c = this.pb.collection(col);
      const rec = id ? await c.update(id, toRecord(data)) : await c.create(toRecord(data));
      this.upsert(col, fromRecord(rec)); schedule();
      return rec.id;
    },
    async patch(col, id, data) {
      if (this.local) {
        const row = state[col].find((x) => x.id === id);
        if (row) Object.assign(row, data);
        this.saveLocal(); schedule();
        return;
      }
      const rec = await this.pb.collection(col).update(id, toRecord(data));
      this.upsert(col, fromRecord(rec)); schedule();
    },
    async del(col, id) {
      if (!this.local) await this.pb.collection(col).delete(id);
      state[col] = state[col].filter((x) => x.id !== id);
      if (this.local) this.saveLocal();
      schedule();
    },
    async log(kind, r, extra = {}) {
      const ev = { by: state.me || "", kind, renderId: r.id || "", title: r.title || "", project: r.project || "", to: extra.to || "" };
      try {
        if (this.local) { state.actividad.unshift({ ...ev, by: null, id: newId("a"), t: nowIso() }); this.saveLocal(); schedule(); }
        else await this.pb.collection("actividad").create(ev);
      } catch (e) { /* la actividad es secundaria */ }
    },
    async setWorking(renderId) {
      if (this.local || !state.me) return;
      const now = nowIso();
      const rec = await this.pb.collection("users").update(state.me, { renderId: renderId || "", since: renderId ? now : "", lastSeen: now });
      this.setUser(rec); schedule(); refreshSheetPresence();
    },
  };

  function writeError(e) {
    const status = e && typeof e.status === "number" ? e.status : -1;
    if (status === 0) {
      state.mode = "offline"; schedule();
      toast("No hay conexión con el servidor. Revisa la red de la oficina e inténtalo de nuevo.");
    } else if (status === 401 || status === 403) {
      toast("Tu sesión expiró. Vuelve a entrar.");
      showGate("login");
    } else if (status === 400) {
      const fields = (e.response && e.response.data) || {};
      const first = Object.keys(fields)[0];
      toast(first ? `Revisa el campo «${first}»: ${fields[first].message}` : "El servidor rechazó los datos. Revisa el formulario.");
    } else {
      toast("No se pudo guardar. Inténtalo de nuevo.");
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function copyPath(text, el) {
    const fallback = () => {
      if (el) { const range = document.createRange(); range.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      toast("Ruta seleccionada. Cópiala con Ctrl+C.");
    };
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (!p) return fallback();
      p.then(() => toast("Ruta copiada"), fallback);
    } catch (e) { fallback(); }
  }

  /* ---------- fragmentos ---------- */
  const SYM = (cls = "sym") => `<svg class="${cls}" viewBox="0 0 88.89 76.26" aria-hidden="true"><use href="#lap-sym"/></svg>`;
  const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" stroke="currentColor" stroke-width="1.3"/></svg>`;
  const ICON_FOLDER = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6v5.5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-7Z" stroke="currentColor" stroke-width="1.2"/></svg>`;
  const chip = (s) => `<span class="chip" data-s="${esc(s)}">${esc(STAGE[s]?.label || s)}</span>`;
  const sampleChip = (r) => (r.sample ? `<span class="chip sample plain">Ejemplo</span>` : "");
  const glyph = (s) => `<span class="glyph ${s === "render" ? "live" : s === "guardado" ? "fill" : ""}" data-s="${esc(s)}"></span>`;
  const progress = (r) => {
    const p = Math.max(0, Math.min(100, Number(r.progress) || 0));
    return `<span class="bar-track" data-s="${esc(r.status)}" title="${p}%"><i style="width:${p}%"></i></span>`;
  };
  const pathBlock = (r) => r.path
    ? `<div class="path-wrap"><span class="path">${esc(r.path)}</span>${desk ? `<button class="btn icon ghost sm" data-act="open-path" data-id="${esc(r.id)}" aria-label="Abrir carpeta" title="Abrir carpeta">${ICON_FOLDER}</button>` : ""}<button class="btn icon ghost sm" data-act="copy" data-id="${esc(r.id)}" aria-label="Copiar ruta" title="Copiar ruta">${ICON_COPY}</button></div>`
    : `<span class="muted">Sin ruta</span>`;
  const panelHead = (title, link) => `<div class="panel-head"><h2><span class="sl">/</span>${title}</h2>${link || ""}</div>`;

  function emptyState() {
    if (!state.ready) {
      return `<div class="glass empty">${SYM()}<h2>Cargando el tablero del equipo</h2><p>En un momento aparecen los renders, el cronograma y el archivo.</p></div>`;
    }
    const acts = state.canWrite
      ? `<div class="acts"><button class="btn primary" data-act="new-render">Registrar el primer render</button><button class="btn" data-act="load-sample">Ver con datos de ejemplo</button></div>`
      : "";
    return `<div class="glass empty">${SYM()}
      <div class="eyebrow">Visualización 3D</div>
      <h2>Todavía no hay renders registrados</h2>
      <p>Cada render pasa por cola, escena, render, post y revisión. Al guardarlo queda en el archivo con la ruta de su carpeta.</p>${acts}
    </div>`;
  }

  /* ---------- vistas ---------- */
  function renderTeam() {
    if (!state.team) return "";
    const people = roster();
    const online = people.filter((p) => p.online).length;
    const cards = people.map((p) => {
      const r = p.renderId && state.renders.find((x) => x.id === p.renderId);
      const what = r
        ? `Trabajando en <b>${esc(r.title)}</b>${r.project ? ` · ${esc(r.project)}` : ""}`
        : p.online ? "Conectado, sin render asignado" : `Visto ${esc(relTime(p.lastSeen) || "antes")}`;
      return `<div class="person ${!p.online && !r ? "idle" : ""}" ${r ? `data-act="edit" data-id="${esc(r.id)}" role="button" tabindex="0"` : ""}>
        <span class="av-wrap">${avatar(p.id)}${p.online ? `<span class="dot" title="Conectado ahora"></span>` : ""}</span>
        <span style="min-width:0;display:grid;gap:1px">
          <span class="who"><span>${esc(personName(p.id))}</span></span>
          <span class="what">${what}</span>
          ${r && p.since ? `<span class="tag">Desde ${esc(relTime(p.since))}</span>` : ""}
        </span>
      </div>`;
    }).join("");
    return `<article class="glass panel span-12">
      ${panelHead("Equipo ahora", `<span class="tag">${online ? `${plural(online, "persona conectada", "personas conectadas")}` : "Nadie más conectado"}</span>`)}
      ${people.length ? `<div class="team">${cards}</div>` : `<p class="note">Aquí aparece quién está conectado y en qué render trabaja cada persona.</p>`}
    </article>`;
  }

  function eventText(a) {
    const who = `<b>${esc(firstName(a.by))}</b>`;
    const exists = a.renderId && state.renders.some((r) => r.id === a.renderId);
    const t = `<q ${exists ? `data-act="edit" data-id="${esc(a.renderId)}"` : ""}>${esc(a.title)}</q>`;
    switch (a.kind) {
      case "create": return `${who} registró ${t}`;
      case "stage": return `${who} movió ${t} a ${esc(STAGE[a.to]?.label || a.to)}`;
      case "saved": return `${who} guardó ${t} en el archivo`;
      case "edit": return `${who} actualizó ${t}`;
      case "delete": return `${who} eliminó ${t}`;
      case "working": return `${who} empezó a trabajar en ${t}`;
      case "entrega": return `${who} programó la entrega ${t}`;
      default: return `${who} cambió ${t}`;
    }
  }

  function renderFeed() {
    const items = state.actividad.slice(0, 12);
    return `<article class="glass panel span-5">
      ${panelHead("Actividad")}
      <div class="feed">${items.length ? items.map((a) => `
        <div class="ev">${avatar(a.by)}<p>${eventText(a)}</p><time datetime="${esc(a.t)}">${esc(relTime(a.t))}</time></div>`).join("")
        : `<p class="note">Cada cambio de etapa, guardado o render nuevo queda registrado aquí.</p>`}
      </div>
    </article>`;
  }

  function renderResumen() {
    const el = $("#v-resumen");
    if (!state.renders.length && !state.entregas.length) {
      const team = state.ready ? renderTeam() : "";
      el.innerHTML = (team ? `<div class="grid" style="margin-bottom:20px">${team}</div>` : "") + emptyState();
      return;
    }
    const R = filtered();
    const t = today();
    const weekEnd = addDays(monday(t), 6);
    const active = R.filter((r) => r.status !== "guardado");
    const working = active.filter((r) => WORKING.includes(r.status)).sort(byDue);
    const rendering = active.filter((r) => r.status === "render");
    const review = active.filter((r) => r.status === "revision");
    const late = active.filter((r) => { const d = parse(r.due); return d && d < t; });
    const saved = R.filter((r) => r.status === "guardado").sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    const saved30 = saved.filter((r) => { const d = parse(r.savedAt); return d && diff(d, t) <= 30; });
    const weekEntregas = state.entregas.filter((e) => { const d = parse(e.date); return d && d >= t && d <= weekEnd; });

    const upcoming = [
      ...state.entregas.map((e) => ({ kind: "entrega", id: e.id, title: e.title, project: e.project, date: e.date })),
      ...active.filter((r) => r.due).map((r) => ({ kind: "render", id: r.id, title: r.title, project: r.project, date: r.due, status: r.status })),
    ].filter((u) => { const d = parse(u.date); return d && diff(t, d) <= 14 && (u.kind === "render" || d >= t); })
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

    const dayName = DIAS[t.getDay()];
    const metric = (n, label, alert) => `<div class="metric ${alert && n ? "alert" : ""} ${!n ? "zero" : ""}" role="listitem"><b>${n}</b><span>${label}</span></div>`;
    el.innerHTML = `
      <div class="hero">
        <div>
          <div class="eyebrow">${dayName[0].toUpperCase() + dayName.slice(1)} ${t.getDate()} de ${MES_L[t.getMonth()]} · Semana ${isoWeek(t)}</div>
          <h1><span class="sl">//</span>${rendering.length ? `<em>${plural(rendering.length, "render", "renders")}</em> en máquina` : "Ningún render en máquina"}${weekEntregas.length ? ` y ${plural(weekEntregas.length, "entrega", "entregas")} esta semana` : ""}.</h1>
        </div>
        <div class="metrics glass" role="list">
          ${metric(active.length, "En producción")}${metric(rendering.length, "Renderizando")}${metric(review.length, "En revisión")}${metric(late.length, "Atrasados", true)}${metric(saved30.length, "Guardados 30 d")}
        </div>
      </div>
      <div class="grid" style="margin-top:20px">
        ${renderTeam()}
        <article class="glass panel span-7">
          ${panelHead("Trabajándose ahora", `<a class="link" href="#en-curso">Tablero</a>`)}
          <div class="rows">${working.length ? working.map((r) => `
            <div class="row" data-act="edit" data-id="${esc(r.id)}" tabindex="0">
              ${glyph(r.status)}
              <div style="min-width:0">
                <div class="row-title">${esc(r.title)}</div>
                <div class="row-meta"><span>${esc(r.project || "Sin proyecto")}</span>${r.type ? `<span>+ ${esc(r.type)}</span>` : ""}${r.engine ? `<span class="mono">${esc(r.engine)}</span>` : ""}${sampleChip(r)}</div>
              </div>
              <div class="row-side">
                <div class="inline">${faces(r.id)}${chip(r.status)}</div>
                <div class="inline">${r.status === "render" || Number(r.progress) > 0 ? progress(r) : ""}<span class="due ${dueClass(r)}">${esc(relDay(r.due))}</span></div>
              </div>
            </div>`).join("") : `<p class="note">Nada en escena, render ni post en este momento.</p>`}
          </div>
        </article>
        <article class="glass panel span-5">
          ${panelHead("Próximos 14 días", `<a class="link" href="#cronograma">Cronograma</a>`)}
          <div class="rows">${upcoming.length ? upcoming.map((u) => {
            const d = parse(u.date); const n = diff(t, d);
            return `<div class="row" data-act="${u.kind === "entrega" ? "edit-entrega" : "edit"}" data-id="${esc(u.id)}" tabindex="0">
              ${u.kind === "entrega" ? `<span class="ms" style="position:static;transform:none;padding:0"><i></i></span>` : glyph(u.status)}
              <div style="min-width:0"><div class="row-title">${esc(u.title)}</div><div class="row-meta"><span>${u.kind === "entrega" ? "Entrega" : "Fecha de render"} · ${esc(u.project || "Sin proyecto")}</span></div></div>
              <div class="row-side"><span class="due ${n < 0 ? "late" : n <= 2 ? "soon" : ""}">${esc(relDay(u.date))}</span><span class="mono muted">${fmtShort(d)}</span></div>
            </div>`;
          }).join("") : `<p class="note">Sin entregas ni fechas en las próximas dos semanas.</p>`}
          </div>
        </article>
        <article class="glass panel span-7">
          ${panelHead("Recién guardados", `<a class="link" href="#archivo">Archivo</a>`)}
          <div class="rows">${saved.length ? saved.slice(0, 5).map((r) => `
            <div class="row" style="grid-template-columns:16px minmax(0,1fr);cursor:default">
              ${glyph("guardado")}
              <div style="min-width:0;display:grid;gap:6px">
                <div><div class="row-title" data-act="edit" data-id="${esc(r.id)}" style="cursor:pointer">${esc(r.title)}</div>
                <div class="row-meta"><span>${esc(r.project || "Sin proyecto")}</span>${r.version ? `<span class="mono">${esc(r.version)}</span>` : ""}<span>· ${esc(relDay(r.savedAt))}</span>${sampleChip(r)}</div></div>
                ${pathBlock(r)}
              </div>
            </div>`).join("") : `<p class="note">Cuando un render se marca como guardado aparece aquí con la ruta de su carpeta.</p>`}
          </div>
        </article>
        ${renderFeed()}
      </div>`;
  }

  function renderCronograma() {
    const el = $("#v-cronograma");
    const t = today();
    const start = addDays(monday(t), -7 + state.shift * 7);
    const days = state.weeks * 7;
    const end = addDays(start, days - 1);
    const R = filtered().filter((r) => r.start || r.due);
    const undated = filtered().filter((r) => !r.start && !r.due && r.status !== "guardado").length;

    const projects = new Map();
    const group = (k) => { if (!projects.has(k)) projects.set(k, { renders: [], entregas: [] }); return projects.get(k); };
    for (const r of R) group(r.project || "Sin proyecto").renders.push(r);
    for (const e of state.entregas) group(e.project || "Sin proyecto").entregas.push(e);

    const wrapW = Math.max(300, Math.floor($(".top").getBoundingClientRect().width) - 2);
    const labelW = wrapW < 640 ? 140 : 230;
    const dayW = Math.max(state.weeks > 8 ? 16 : 22, Math.floor((wrapW - labelW) / days));
    const pos = (d) => diff(start, d);

    const weeksHtml = Array.from({ length: state.weeks }, (_, i) => {
      const w = addDays(start, i * 7);
      return `<span><b>S${isoWeek(w)}</b>${fmtShort(w)}</span>`;
    }).join("");
    const daysHtml = dayW >= 18 ? Array.from({ length: days }, (_, i) => {
      const d = addDays(start, i);
      return `<span class="${diff(d, t) === 0 ? "t" : ""}">${dayW >= 26 ? d.getDate() : INI[d.getDay()]}</span>`;
    }).join("") : "";

    let body = "";
    for (const [name, g] of [...projects.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))) {
      const ms = g.entregas.map((e) => {
        const d = parse(e.date); if (!d || d < start || d > end) return "";
        return `<button class="ms" style="left:${pos(d) * dayW + dayW / 2}px" data-act="edit-entrega" data-id="${esc(e.id)}" title="${esc(e.title)} · ${fmtShort(d)}"><i></i><span>${esc(e.title)}</span></button>`;
      }).join("");
      body += `<div class="g-row g-proj"><div class="g-label"><b>${esc(name)}</b><small>${plural(g.renders.length, "render", "renders")}</small></div><div class="g-lane">${ms}</div></div>`;
      for (const r of g.renders.sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due))) {
        let s = parse(r.start) || parse(r.due);
        let e = parse(r.due) || parse(r.start);
        if (e < s) [s, e] = [e, s];
        let bar = "";
        if (!(e < start || s > end)) {
          const a = Math.max(0, pos(s)), b = Math.min(days - 1, pos(e));
          const left = a * dayW + 2, width = Math.max(dayW - 4, (b - a + 1) * dayW - 4);
          const p = r.status === "guardado" ? 100 : Math.max(0, Math.min(100, Number(r.progress) || 0));
          bar = `<button class="bar ${dueClass(r) === "late" ? "late" : ""}" data-s="${esc(r.status)}" style="left:${left}px;width:${width}px;--p:${p}%" data-act="edit" data-id="${esc(r.id)}" title="${esc(r.title)} · ${esc(STAGE[r.status]?.label || "")} · ${fmtShort(s)} a ${fmtShort(e)}">${faces(r.id)}<span>${esc(r.title)}</span></button>`;
        }
        body += `<div class="g-row"><div class="g-label"><b>${esc(r.title)}</b><small>${esc([STAGE[r.status]?.label, r.artist].filter(Boolean).join(" · "))}</small></div><div class="g-lane">${bar}</div></div>`;
      }
    }
    const todayPos = pos(t);
    const todayLine = todayPos >= 0 && todayPos < days ? `<div class="today-line" style="left:${labelW + todayPos * dayW + dayW / 2}px"></div>` : "";

    el.innerHTML = `
      <div class="view-title"><h1><span class="sl">//</span>Cronograma</h1><span class="muted light">${fmtShort(start)} a ${fmtShort(end)} ${end.getFullYear()}</span></div>
      <div class="toolbar" style="margin:14px 0">
        <div class="seg" role="group" aria-label="Rango">
          ${[4, 8, 12].map((w) => `<button data-act="weeks" data-w="${w}" aria-pressed="${state.weeks === w}">${w} semanas</button>`).join("")}
        </div>
        <div class="seg" role="group" aria-label="Mover">
          <button data-act="shift" data-d="-1" aria-label="Semana anterior">‹</button>
          <button data-act="shift" data-d="0" aria-pressed="${state.shift === 0}">Hoy</button>
          <button data-act="shift" data-d="1" aria-label="Semana siguiente">›</button>
        </div>
        <div class="legend">${STAGES.map((s) => chip(s.id)).join("")}</div>
        <span class="spacer"></span>
        ${state.canWrite ? `<button class="btn" data-act="new-entrega"><span class="ms" style="position:static;transform:none;padding:0"><i></i></span> Nueva entrega</button>` : ""}
      </div>
      ${projects.size ? `<div class="glass gantt-card"><div class="g-scroll"><div class="g-inner" style="--day:${dayW}px;--days:${days};--label:${labelW}px;width:${labelW + dayW * days}px">
        <div class="g-row g-head"><div class="g-label">Proyecto y vista</div><div class="g-lane" style="background:none"><div class="g-weeks">${weeksHtml}</div>${daysHtml ? `<div class="g-days">${daysHtml}</div>` : ""}</div></div>
        ${body}${todayLine}
      </div></div></div>` : emptyState()}
      ${undated ? `<p class="note">${plural(undated, "render activo no tiene", "renders activos no tienen")} fechas y no aparece${undated === 1 ? "" : "n"} en el cronograma.</p>` : ""}`;
  }

  function renderBoard() {
    const el = $("#v-en-curso");
    const R = filtered();
    const cols = BOARD.map((s) => {
      const items = R.filter((r) => r.status === s).sort(byDue);
      return `<div class="glass col" data-col="${s}">
        <div class="col-head">${glyph(s)}<h2>${esc(STAGE[s].label)}</h2><span class="mono">${items.length}</span></div>
        ${items.map((r) => {
          const busy = workingOn(r.id).length > 0;
          return `
          <div class="card ${busy ? "busy" : ""}" draggable="${state.canWrite}" data-id="${esc(r.id)}" data-act="edit" tabindex="0">
            <div class="card-title">${esc(r.title)}</div>
            <div class="card-meta"><span>${esc(r.project || "Sin proyecto")}</span>${r.type ? `<span>+ ${esc(r.type)}</span>` : ""}${sampleChip(r)}</div>
            ${r.engine || r.resolution ? `<div class="card-meta mono">${esc([r.engine, r.resolution].filter(Boolean).join(" · "))}</div>` : ""}
            ${s === "render" || s === "post" || Number(r.progress) > 0 ? progress(r) : ""}
            <div class="card-foot"><span class="due ${dueClass(r)}">${esc(r.due ? relDay(r.due) : "Sin fecha")}</span>${faces(r.id) || (r.artist ? `<span class="av" title="${esc(r.artist)}">${esc(initials(r.artist))}</span>` : "")}</div>
          </div>`;
        }).join("")}
      </div>`;
    }).join("");
    el.innerHTML = `
      <div class="view-title"><h1><span class="sl">//</span>En curso</h1><span class="muted light">${state.canWrite ? "Arrastra una tarjeta para cambiar su etapa. Para guardarla en el archivo, ábrela y agrega la ruta." : "Solo lectura"}</span></div>
      <div style="margin-top:14px">${state.renders.length ? `<div class="board">${cols}</div>` : emptyState()}</div>`;
  }

  function renderArchivo() {
    const el = $("#v-archivo");
    const all = filtered().filter((r) => r.status === "guardado");
    const projs = [...new Set(all.map((r) => r.project || "Sin proyecto"))].sort((a, b) => a.localeCompare(b, "es"));
    if (state.archProj && !projs.includes(state.archProj)) state.archProj = "";
    const list = all.filter((r) => !state.archProj || (r.project || "Sin proyecto") === state.archProj)
      .sort((a, b) => (a.project || "").localeCompare(b.project || "", "es") || (b.savedAt || "").localeCompare(a.savedAt || ""));
    let rows = "", last = null;
    for (const r of list) {
      const p = r.project || "Sin proyecto";
      if (p !== last) { rows += `<div class="arch-group">${ICON_FOLDER}<b>${esc(p)}</b><span class="mono muted">${list.filter((x) => (x.project || "Sin proyecto") === p).length}</span></div>`; last = p; }
      const sd = parse(r.savedAt);
      rows += `<div class="arch-row">
        <div><div class="t" data-act="edit" data-id="${esc(r.id)}">${esc(r.title)}</div><small>${esc([r.type, r.artist].filter(Boolean).join(" · "))} ${sampleChip(r)}</small></div>
        <div class="mono">${esc(r.version || "—")}</div>
        <div class="mono">${esc([r.resolution, r.engine].filter(Boolean).join(" · ") || "—")}</div>
        <div class="mono">${sd ? fmtShort(sd) : "—"}</div>
        ${pathBlock(r)}
      </div>`;
    }
    el.innerHTML = `
      <div class="view-title"><h1><span class="sl">//</span>Archivo</h1><span class="muted light">${plural(all.length, "render guardado", "renders guardados")}</span></div>
      ${projs.length > 1 ? `<div class="filters" style="margin:14px 0"><button data-act="arch-proj" data-p="" aria-pressed="${!state.archProj}">Todos</button>${projs.map((p) => `<button data-act="arch-proj" data-p="${esc(p)}" aria-pressed="${state.archProj === p}">${esc(p)}</button>`).join("")}</div>` : `<div style="height:14px"></div>`}
      ${list.length ? `<div class="glass arch">
        <div class="arch-row head"><div>Render</div><div>Versión</div><div>Formato</div><div>Guardado</div><div>Carpeta</div></div>
        ${rows}</div>` : state.renders.length ? `<div class="glass empty">${SYM()}<h2>Nada guardado todavía</h2><p>Abre un render, agrega la ruta de su carpeta y márcalo como guardado.</p></div>` : emptyState()}`;
  }

  /* ---------- panel lateral ---------- */
  function datalist(id, values) {
    return `<datalist id="${id}">${[...new Set(values.filter(Boolean))].sort().map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>`;
  }

  function openRender(id) {
    const r = id ? state.renders.find((x) => x.id === id) : null;
    if (id && !r) return;
    const t = today();
    state.sheet = { kind: "render", id: r ? r.id : null, draft: r ? { ...r } : { status: "cola", progress: 0, start: iso(t), due: iso(addDays(t, 5)), type: "Exterior" } };
    state.confirmDelete = false;
    renderSheet(); sendPresence();
  }
  function openEntrega(id) {
    const e = id ? state.entregas.find((x) => x.id === id) : null;
    if (id && !e) return;
    state.sheet = { kind: "entrega", id: e ? e.id : null, draft: e ? { ...e } : { date: iso(addDays(today(), 7)) } };
    state.confirmDelete = false;
    renderSheet(); sendPresence();
  }
  function closeSheet() { state.sheet = null; renderSheet(); sendPresence(); }

  // Quién más tiene abierto este render y quién lo está trabajando.
  function presenceHtml() {
    const sh = state.sheet;
    if (!sh || sh.kind !== "render" || !sh.id || !state.team) return "";
    const others = viewingNow(sh.id).filter((id) => id !== state.me);
    const workers = workingOn(sh.id);
    const mine = workers.includes(state.me);
    const otherWorkers = workers.filter((id) => id !== state.me);
    let html = "";
    if (others.length) {
      html += `<div class="presence-note"><span class="faces">${others.map((id) => avatar(id)).join("")}</span><p>${esc(others.map(firstName).join(", "))} ${others.length === 1 ? "también tiene" : "también tienen"} abierto este render. Si varios guardan, queda el último cambio.</p></div>`;
    }
    const label = otherWorkers.length
      ? `<b>${esc(otherWorkers.map(firstName).join(", "))}</b> ${otherWorkers.length === 1 ? "está trabajando" : "están trabajando"} en este render${mine ? ", y tú también" : ""}.`
      : mine ? `<b>Tú</b> estás trabajando en este render.` : "Nadie lo tiene marcado como su trabajo actual.";
    html += `<div class="work-box"><p>${label}</p>${state.canWrite ? `<button type="button" class="btn sm ${mine ? "on" : ""}" data-act="toggle-working">${mine ? "Dejar de trabajar en esto" : "Estoy trabajando en esto"}</button>` : ""}</div>`;
    return html;
  }
  function refreshSheetPresence() {
    const box = $("#sheet-presence");
    if (box) box.innerHTML = presenceHtml();
  }

  function renderSheet() {
    const root = $("#sheet-root");
    const sh = state.sheet;
    if (!sh) { root.innerHTML = ""; return; }
    const d = sh.draft;
    const ro = state.canWrite ? "" : "disabled";
    const projects = [...state.renders.map((r) => r.project), ...state.entregas.map((e) => e.project)];
    const teamNames = state.equipo.map((e) => state.people[e.id] && state.people[e.id].name).filter(Boolean);
    let body = "", title = "";
    if (sh.kind === "render") {
      title = sh.id ? "Editar render" : "Nuevo render";
      const editedBy = sh.id && d.updatedAt ? `<p class="meta-line">Última edición ${d.updatedBy || state.mode === "local" ? `de ${esc(personName(d.updatedBy))} ` : ""}${esc(relTime(d.updatedAt))}</p>` : "";
      body = `
        <div id="sheet-presence" style="display:grid;gap:10px">${presenceHtml()}</div>
        <div class="fld"><label for="f-title">Vista o nombre del render</label><input id="f-title" value="${esc(d.title)}" placeholder="Fachada principal al atardecer" ${ro} required></div>
        <div class="two">
          <div class="fld"><label for="f-project">Proyecto</label><input id="f-project" list="dl-proj" value="${esc(d.project)}" placeholder="Nombre del proyecto" ${ro}></div>
          <div class="fld"><label for="f-type">Tipo</label><select id="f-type" ${ro}>${TYPES.map((x) => `<option ${d.type === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        </div>
        <div class="fld"><span class="lbl">Etapa</span><div class="stages" role="group" aria-label="Etapa">${STAGES.map((s) => `<button type="button" data-act="stage" data-st="${s.id}" data-s="${s.id}" aria-pressed="${d.status === s.id}" ${ro}>${s.label}</button>`).join("")}</div></div>
        <div class="fld"><label for="f-progress">Avance del render</label><div class="range-row"><input id="f-progress" type="range" min="0" max="100" step="5" value="${Number(d.progress) || 0}" ${ro}><span class="mono" id="f-progress-v" style="width:40px;text-align:right">${Number(d.progress) || 0}%</span></div></div>
        <div class="two">
          <div class="fld"><label for="f-start">Inicio</label><input id="f-start" type="date" value="${esc(d.start)}" ${ro}></div>
          <div class="fld"><label for="f-due">Entrega</label><input id="f-due" type="date" value="${esc(d.due)}" ${ro}></div>
        </div>
        <div class="two">
          <div class="fld"><label for="f-artist">Responsable</label><input id="f-artist" list="dl-artist" value="${esc(d.artist)}" placeholder="Quién lo trabaja" ${ro}></div>
          <div class="fld"><label for="f-engine">Motor</label><input id="f-engine" list="dl-engine" value="${esc(d.engine)}" placeholder="V-Ray, Corona, D5…" ${ro}></div>
        </div>
        <div class="two">
          <div class="fld"><label for="f-resolution">Resolución</label><input id="f-resolution" class="mono" list="dl-res" value="${esc(d.resolution)}" placeholder="3840×2160" ${ro}></div>
          <div class="fld"><label for="f-version">Versión</label><input id="f-version" class="mono" value="${esc(d.version)}" placeholder="v01" ${ro}></div>
        </div>
        <div class="fld"><label for="f-path">Ruta de la carpeta</label><div class="pick-row"><input id="f-path" class="mono" value="${esc(d.path)}" placeholder="\\\\NAS\\Proyectos\\2026\\Proyecto\\03_Renders\\Final\\" ${ro}>${desk && state.canWrite ? `<button type="button" class="btn" data-act="pick-folder">Elegir…</button>` : ""}${desk && d.path ? `<button type="button" class="btn icon" data-act="open-draft-path" aria-label="Abrir carpeta" title="Abrir carpeta">${ICON_FOLDER}</button>` : ""}</div>
          <span class="hint">Dónde quedó el archivo final. Se necesita para marcarlo como guardado.</span><span class="err" id="f-path-err" hidden></span></div>
        <div class="fld"><label for="f-notes">Notas</label><textarea id="f-notes" placeholder="Comentarios del cliente, cámara, HDRI, ajustes de post" ${ro}>${esc(d.notes)}</textarea></div>
        ${editedBy}
        ${d.sample ? `<p class="note" style="padding:0">Este render es un ejemplo. Bórralo cuando cargues tus datos.</p>` : ""}
        ${datalist("dl-proj", projects)}${datalist("dl-artist", [...teamNames, ...state.renders.map((r) => r.artist)])}
        ${datalist("dl-engine", [...ENGINES, ...state.renders.map((r) => r.engine)])}${datalist("dl-res", [...RESOLUTIONS, ...state.renders.map((r) => r.resolution)])}`;
    } else {
      title = sh.id ? "Editar entrega" : "Nueva entrega";
      body = `
        <div class="fld"><label for="f-title">Entrega o hito</label><input id="f-title" value="${esc(d.title)}" placeholder="Presentación a cliente" ${ro} required></div>
        <div class="two">
          <div class="fld"><label for="f-project">Proyecto</label><input id="f-project" list="dl-proj" value="${esc(d.project)}" ${ro}></div>
          <div class="fld"><label for="f-date">Fecha</label><input id="f-date" type="date" value="${esc(d.date)}" ${ro}></div>
        </div>
        <div class="fld"><label for="f-notes">Notas</label><textarea id="f-notes" placeholder="Qué se entrega y en qué formato" ${ro}>${esc(d.notes)}</textarea></div>
        ${datalist("dl-proj", projects)}`;
    }
    const del = sh.id && state.canWrite
      ? (state.confirmDelete
        ? `<button type="button" class="btn danger" data-act="delete-confirm">Confirmar eliminación</button><button type="button" class="btn ghost" data-act="delete-cancel">No eliminar</button>`
        : `<button type="button" class="btn ghost danger" data-act="delete">Eliminar</button>`)
      : "";
    root.innerHTML = `
      <div class="scrim" data-act="close"></div>
      <form class="sheet glass" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" novalidate>
        <div class="sheet-head"><h2 id="sheet-title"><span class="sl">/</span>${title}</h2><button type="button" class="btn icon ghost" data-act="close" aria-label="Cerrar"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>
        <div class="sheet-body">${body}</div>
        <div class="sheet-foot">${del}<span class="spacer"></span>
          <button type="button" class="btn ghost" data-act="close">${state.canWrite ? "Cancelar" : "Cerrar"}</button>
          ${state.canWrite ? `<button type="submit" class="btn primary">${sh.id ? "Guardar" : "Crear"}</button>` : ""}
        </div>
      </form>`;
    const first = $("#f-title");
    if (first && !sh.id) first.focus();
  }

  function readDraft() {
    const sh = state.sheet; const d = sh.draft;
    const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : undefined; };
    d.title = v("f-title"); d.project = v("f-project"); d.notes = v("f-notes");
    if (sh.kind === "render") {
      d.type = v("f-type"); d.start = v("f-start"); d.due = v("f-due"); d.artist = v("f-artist");
      d.engine = v("f-engine"); d.resolution = v("f-resolution"); d.version = v("f-version"); d.path = v("f-path");
      d.progress = Number(v("f-progress")) || 0;
    } else {
      d.date = v("f-date");
    }
    return d;
  }

  async function submitSheet() {
    const sh = state.sheet; if (!sh || !state.canWrite) return;
    const d = readDraft();
    if (!d.title) { $("#f-title").focus(); toast("Escribe un nombre antes de guardar."); return; }
    const col = sh.kind === "render" ? "renders" : "entregas";
    const now = nowIso();
    let kind = sh.id ? "edit" : sh.kind === "render" ? "create" : "entrega";
    let to = null;
    if (sh.kind === "render") {
      if (d.status === "guardado" && !d.path) {
        const err = $("#f-path-err"); err.textContent = "Agrega la ruta de la carpeta para guardarlo en el archivo."; err.hidden = false; $("#f-path").focus(); return;
      }
      const prev = sh.id ? state.renders.find((r) => r.id === sh.id) : null;
      if (d.status === "guardado" && (!prev || prev.status !== "guardado" || !d.savedAt)) { d.savedAt = iso(today()); d.progress = 100; }
      if (d.status !== "guardado") delete d.savedAt;
      if (d.start && d.due && d.due < d.start) [d.start, d.due] = [d.due, d.start];
      if (prev && prev.status !== d.status) { kind = d.status === "guardado" ? "saved" : "stage"; to = d.status; }
      if (!prev && d.status === "guardado") kind = "saved";
    }
    const data = stripId({ ...d, updatedAt: now, ...(state.me ? { updatedBy: state.me } : {}), ...(sh.id ? {} : { createdAt: now }) });
    for (const k of Object.keys(data)) if (data[k] === undefined || data[k] === "") delete data[k];
    if (kind === "saved" && desk && d.path) {
      desk.pathExists(d.path).then((r) => { if (!r.exists) toast("Guardado. Ojo: desde este PC no encuentro esa carpeta; revisa la ruta o la unidad de red."); });
    }
    try {
      const id = await store.put(col, sh.id, data);
      store.log(kind, { ...data, id }, to ? { to } : {});
      if (kind === "saved" && workingOn(id).includes(state.me)) store.setWorking(null).catch(() => {});
      toast(sh.id ? "Cambios guardados" : (sh.kind === "render" ? "Render creado" : "Entrega creada"));
      closeSheet();
    } catch (e) { writeError(e); }
  }

  async function deleteCurrent() {
    const sh = state.sheet; if (!sh || !sh.id) return;
    const col = sh.kind === "render" ? "renders" : "entregas";
    const row = state[col].find((x) => x.id === sh.id) || {};
    try {
      await store.del(col, sh.id);
      if (sh.kind === "render") store.log("delete", { ...row, id: null });
      toast("Eliminado");
      closeSheet();
    } catch (e) { writeError(e); }
  }

  async function toggleWorking() {
    const sh = state.sheet; if (!sh || !sh.id) return;
    const mine = workingOn(sh.id).includes(state.me);
    try {
      await store.setWorking(mine ? null : sh.id);
      if (!mine) {
        const r = state.renders.find((x) => x.id === sh.id);
        if (r) store.log("working", r);
        toast("Listo. El equipo ve que estás en este render.");
      } else toast("Ya no apareces trabajando en este render.");
    } catch (e) { writeError(e); }
  }

  /* ---------- ejemplos (solo a pedido y marcados) ---------- */
  async function loadSample() {
    if (!state.canWrite) return;
    const t = today();
    const D = (n) => iso(addDays(t, n));
    const nas = (p, rest) => `\\\\NAS-LAP\\Proyectos\\${t.getFullYear()}\\${p}\\03_Renders\\${rest}\\`;
    const R = [
      ["Fachada principal al atardecer", "Torre Alameda", "Exterior", "render", 64, -3, 2, "Diego", "V-Ray", "5000×2813", "v02"],
      ["Lobby de doble altura", "Torre Alameda", "Interior", "post", 85, -6, 1, "Mariana", "Corona", "3840×2160", "v03"],
      ["Vista aérea con contexto urbano", "Torre Alameda", "Aérea", "escena", 20, -1, 6, "Luis", "V-Ray", "7680×4320", "v01"],
      ["Roof garden con alberca", "Torre Alameda", "Exterior", "cola", 0, 4, 10, "Diego", "D5 Render", "3840×2160", "v01"],
      ["Sala comedor con luz de mañana", "Casa Encinos", "Interior", "revision", 100, -8, 0, "Sofía", "Corona", "5000×2813", "v04"],
      ["Recámara principal", "Casa Encinos", "Interior", "render", 22, -1, 3, "Sofía", "Corona", "3840×2160", "v01"],
      ["Recorrido 360 de la suite", "Hotel Marea", "Recorrido 360", "escena", 10, 0, 9, "Luis", "Unreal Engine", "8192×4096", "v01"],
      ["Animación de aproximación", "Hotel Marea", "Animación", "cola", 0, 7, 20, "Mariana", "D5 Render", "1920×1080", "v01"],
      ["Fachada poniente", "Corporativo Lomas", "Exterior", "post", 70, -4, -1, "Diego", "V-Ray", "5000×2813", "v02"],
    ].map(([title, project, type, status, progress, s, e, artist, engine, resolution, version]) =>
      ({ title, project, type, status, progress, start: D(s), due: D(e), artist, engine, resolution, version }));
    const S = [
      ["Fachada posterior con alberca", "Casa Encinos", "Exterior", -10, -2, "Sofía", "Corona", "5000×2813", "v03", "CasaEncinos", "Final\\v03"],
      ["Acceso vehicular nocturno", "Hotel Marea", "Exterior", -14, -6, "Luis", "V-Ray", "3840×2160", "v02", "HotelMarea", "Final\\v02"],
      ["Restaurante en terraza", "Hotel Marea", "Interior", -20, -12, "Mariana", "Corona", "5000×2813", "v05", "HotelMarea", "Final\\v05"],
      ["Planta tipo de oficinas", "Corporativo Lomas", "Interior", -9, -4, "Diego", "Enscape", "3840×2160", "v01", "CorporativoLomas", "Marketing\\v01"],
    ].map(([title, project, type, s, e, artist, engine, resolution, version, folder, rest]) =>
      ({ title, project, type, status: "guardado", progress: 100, start: D(s), due: D(e), savedAt: D(e), artist, engine, resolution, version, path: nas(folder, rest) }));
    const E = [
      ["Revisión con el arquitecto", "Casa Encinos", 1],
      ["Entrega preliminar a cliente", "Torre Alameda", 2],
      ["Presentación a inversionistas", "Corporativo Lomas", 5],
      ["Paquete para marketing", "Hotel Marea", 14],
    ].map(([title, project, n]) => ({ title, project, date: D(n) }));
    toast("Cargando ejemplo…");
    try {
      for (const r of [...R, ...S]) await store.put("renders", null, { ...r, sample: true });
      for (const e of E) await store.put("entregas", null, { ...e, sample: true });
      toast("Ejemplo cargado. Puedes borrarlo cuando quieras.");
    } catch (e) { writeError(e); }
  }

  async function clearSample() {
    if (!state.canWrite) return;
    try {
      const ids = new Set(state.renders.filter((x) => x.sample).map((x) => x.id));
      for (const id of ids) await store.del("renders", id);
      for (const e of state.entregas.filter((x) => x.sample)) await store.del("entregas", e.id);
      if (state.me && state.equipo.some((e) => e.id === state.me && ids.has(e.renderId))) await store.setWorking(null);
      toast("Ejemplos borrados");
    } catch (e) { writeError(e); }
  }

  /* ---------- marco ---------- */
  function renderChrome() {
    const sync = $("#sync");
    sync.dataset.mode = state.mode;
    sync.querySelector("span").textContent = { connecting: "Conectando", live: "En vivo", local: "Modo de prueba", offline: "Sin conexión" }[state.mode];
    sync.title = state.mode === "live" ? "Los cambios se comparten con todo el equipo al instante." : state.mode === "local" ? "Los datos se guardan solo en este PC." : "Reintentando la conexión con el servidor.";
    const cfg = config.load();
    $("#server-btn").textContent = store.local ? "Modo de prueba · Conectar a un servidor" : cfg.url ? `${personName(state.me)} · ${cfg.url.replace(/^https?:\/\//, "")}` : "";
    $("#btn-new").hidden = !state.canWrite;
    const active = state.renders.filter((r) => BOARD.includes(r.status)).length;
    const saved = state.renders.filter((r) => r.status === "guardado").length;
    $("#c-curso").textContent = active || "";
    $("#c-archivo").textContent = saved || "";
    document.querySelectorAll(".nav a").forEach((a) => { if (a.dataset.view === state.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.querySelectorAll("[data-section]").forEach((s) => { s.hidden = s.dataset.section !== state.view; });

    const on = roster().filter((p) => p.online);
    $("#online").innerHTML = state.team && on.length
      ? on.slice(0, 5).map((p) => avatar(p.id)).join("") + (on.length > 5 ? `<span class="more">+${on.length - 5}</span>` : "")
      : "";
    $("#online").title = on.length ? `Conectados: ${on.map((p) => personName(p.id)).join(", ")}` : "";

    const banner = $("#banner");
    const samples = state.renders.some((r) => r.sample) || state.entregas.some((e) => e.sample);
    if (samples) {
      banner.hidden = false;
      banner.className = "banner glass";
      banner.innerHTML = `<p><strong>Estás viendo datos de ejemplo.</strong> Los proyectos y renders marcados como ejemplo son ficticios.</p>${state.canWrite ? `<button class="btn sm" data-act="clear-sample">Borrar ejemplos</button>` : ""}`;
    } else if (state.mode === "local") {
      banner.hidden = false;
      banner.className = "banner glass";
      banner.innerHTML = `<p><strong>Modo de prueba.</strong> Los datos se guardan solo en este PC y nadie más los ve. Conéctate al servidor de la oficina para trabajar en equipo.</p><button class="btn sm" data-act="settings">Conectar a un servidor</button>`;
    } else if (state.mode === "offline") {
      banner.hidden = false;
      banner.className = "banner glass";
      banner.innerHTML = `<p><strong>Sin conexión con el servidor.</strong> Lo que ves puede estar desactualizado. La app reintenta sola cada minuto.</p><button class="btn sm" data-act="reconnect">Reintentar ahora</button>`;
    } else {
      banner.hidden = true;
    }
  }

  function renderAll() {
    renderChrome();
    if (state.view === "resumen") renderResumen();
    else if (state.view === "cronograma") renderCronograma();
    else if (state.view === "en-curso") renderBoard();
    else renderArchivo();
  }
  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (!dragId) renderAll(); else pendingRender = true; });
  }
  let pendingRender = false;

  /* ---------- conexión: servidor, entrar, crear cuenta ---------- */
  const normalizeUrl = (u) => {
    let v = String(u || "").trim().replace(/\/+$/, "");
    if (v && !/^https?:\/\//i.test(v)) v = "http://" + v;
    if (v && !/:\d+$/.test(v.replace(/^https?:\/\//i, "")) && /^http:\/\/[^/]+$/i.test(v)) v += ":8090";
    return v;
  };
  async function ping(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url + "/api/health", { signal: ctrl.signal });
      return r.ok;
    } catch (e) { return false; } finally { clearTimeout(timer); }
  }

  function showGate(mode, error = "") {
    const cfg = config.load();
    const user = store.pb && store.pb.authStore.record;
    const dismissable = mode === "account" || (mode === "server" && (store.local || state.mode === "live"));
    state.gate = { mode, dismissable };
    let inner = "";
    if (mode === "server") {
      inner = `
        <h1><span class="sl">//</span>Conectar</h1>
        <p>Escribe la dirección del servidor del Cerebro en la oficina. Te la da quien lo instaló, por ejemplo <span class="mono">192.168.1.20:8090</span>.</p>
        <form id="gate-server">
          <div class="fld"><label for="g-url">Servidor</label><input id="g-url" class="mono" value="${esc(cfg.url || "")}" placeholder="192.168.1.20:8090" autocomplete="off" required></div>
          <button class="btn primary block" type="submit">Conectar</button>
        </form>
        <div class="alt"><button type="button" data-act="gate-local">Probar sin servidor, solo en este PC</button>${dismissable ? `<button type="button" data-act="gate-close">Cancelar</button>` : ""}</div>`;
    } else if (mode === "login") {
      inner = `
        <h1><span class="sl">//</span>Entrar</h1>
        <p>Usa tu cuenta del Cerebro. Es la misma en todos los PC de la oficina.</p>
        <form id="gate-login">
          <div class="fld"><label for="g-email">Correo</label><input id="g-email" type="email" autocomplete="username" required></div>
          <div class="fld"><label for="g-pass">Contraseña</label><input id="g-pass" type="password" autocomplete="current-password" required></div>
          <button class="btn primary block" type="submit">Entrar</button>
        </form>
        <div class="alt"><button type="button" data-act="gate-mode" data-mode="register">Crear mi cuenta</button><button type="button" data-act="gate-mode" data-mode="server">Cambiar de servidor</button></div>`;
    } else if (mode === "register") {
      inner = `
        <h1><span class="sl">//</span>Crear cuenta</h1>
        <p>Tu nombre es el que verá el equipo junto a los renders en los que trabajas.</p>
        <form id="gate-register">
          <div class="fld"><label for="g-name">Nombre</label><input id="g-name" autocomplete="name" required></div>
          <div class="fld"><label for="g-email">Correo</label><input id="g-email" type="email" autocomplete="username" required></div>
          <div class="fld"><label for="g-pass">Contraseña</label><input id="g-pass" type="password" autocomplete="new-password" minlength="8" required><span class="hint">Mínimo 8 caracteres.</span></div>
          <button class="btn primary block" type="submit">Crear cuenta y entrar</button>
        </form>
        <div class="alt"><button type="button" data-act="gate-mode" data-mode="login">Ya tengo cuenta</button></div>`;
    } else if (mode === "account") {
      inner = `
        <h1><span class="sl">//</span>Tu cuenta</h1>
        <div class="fld"><span class="lbl">Persona</span><p style="color:var(--fg)">${esc((user && user.name) || "")} <span class="muted">${esc((user && user.email) || "")}</span></p></div>
        <div class="fld"><span class="lbl">Servidor</span><p class="mono" style="color:var(--fg)">${esc(cfg.url || "")}</p></div>
        <div class="alt" style="justify-content:flex-start;gap:16px"><button type="button" data-act="gate-mode" data-mode="server">Cambiar de servidor</button><button type="button" data-act="logout">Cerrar sesión</button></div>
        <button class="btn block" type="button" data-act="gate-close">Listo</button>
        <p class="meta-line" id="g-version"></p>`;
    }
    $("#gate-root").innerHTML = `<div class="gate"><div class="gate-card glass">
      <svg class="sym" viewBox="0 0 88.89 76.26" aria-hidden="true"><use href="#lap-sym"/></svg>
      ${inner}
      <p class="err" id="g-err" ${error ? "" : "hidden"}>${esc(error)}</p>
    </div></div>`;
    if (mode === "account" && desk) desk.appInfo().then((i) => { const v = $("#g-version"); if (v) v.textContent = `LAP Cerebro ${i.version}`; });
    const first = $("#gate-root input");
    if (first) first.focus();
  }
  function closeGate() { state.gate = null; $("#gate-root").innerHTML = ""; }
  const gateError = (msg) => { const e = $("#g-err"); if (e) { e.textContent = msg; e.hidden = false; } };
  const busy = (form, on) => form.querySelectorAll("button, input").forEach((x) => { x.disabled = on; });

  async function gateSubmit(form) {
    const v = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
    busy(form, true);
    try {
      if (form.id === "gate-server") {
        const url = normalizeUrl(v("g-url"));
        if (!(await ping(url))) { gateError(`No encuentro el servidor en ${url}. Revisa la dirección y que el PC o NAS del servidor esté encendido.`); return; }
        config.save({ url, local: false });
        location.reload();
      } else if (form.id === "gate-login") {
        await store.pb.collection("users").authWithPassword(v("g-email"), $("#g-pass").value);
        await store.startLive();
      } else if (form.id === "gate-register") {
        const pass = $("#g-pass").value;
        await store.pb.collection("users").create({ name: v("g-name"), email: v("g-email"), password: pass, passwordConfirm: pass, emailVisibility: false });
        await store.pb.collection("users").authWithPassword(v("g-email"), pass);
        await store.startLive();
      }
    } catch (e) {
      const status = e && e.status;
      if (status === 0) gateError("No hay conexión con el servidor.");
      else if (form.id === "gate-login") gateError("Correo o contraseña incorrectos.");
      else if (form.id === "gate-register") {
        const data = (e.response && e.response.data) || {};
        gateError(data.email ? "Ese correo no es válido o ya tiene una cuenta." : data.password ? "La contraseña necesita al menos 8 caracteres." : "No se pudo crear la cuenta. Revisa los datos.");
      } else gateError("Algo falló. Inténtalo de nuevo.");
    } finally {
      if (document.body.contains(form)) busy(form, false);
    }
  }

  function logout() {
    if (store.pb) { store.pb.realtime.unsubscribe().catch(() => {}); store.pb.authStore.clear(); }
    location.reload();
  }

  async function boot() {
    const cfg = config.load();
    if (cfg.local) { store.startLocal(); return; }
    if (!cfg.url) { state.ready = true; showGate("server"); return; }
    store.pb = new PocketBase(cfg.url);
    store.pb.autoCancellation(false);
    if (store.pb.authStore.isValid) {
      try {
        await store.pb.collection("users").authRefresh();
        await store.startLive();
        return;
      } catch (e) {
        if (e && e.status === 0) {
          state.ready = true;
          showGate("server", `No encuentro el servidor en ${cfg.url}. ¿Está encendido el PC o NAS del servidor?`);
          return;
        }
      }
    }
    state.ready = true;
    showGate("login");
  }

  /* ---------- rutas ---------- */
  const VIEWS = ["resumen", "cronograma", "en-curso", "archivo"];
  function route() {
    const h = location.hash.replace("#", "");
    state.view = VIEWS.includes(h) ? h : "resumen";
    renderAll(); sendPresence();
  }
  window.addEventListener("hashchange", route);

  /* ---------- eventos ---------- */
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    switch (act) {
      case "new-render": openRender(null); break;
      case "new-entrega": openEntrega(null); break;
      case "edit": ev.stopPropagation(); openRender(id); break;
      case "edit-entrega": openEntrega(id); break;
      case "close": closeSheet(); break;
      case "copy": {
        ev.stopPropagation();
        const r = state.renders.find((x) => x.id === id);
        if (r) copyPath(r.path, el.parentElement.querySelector(".path"));
        break;
      }
      case "stage": {
        if (!state.canWrite) break;
        state.sheet.draft = readDraft();
        state.sheet.draft.status = el.dataset.st;
        if (el.dataset.st === "guardado") state.sheet.draft.progress = 100;
        renderSheet();
        break;
      }
      case "toggle-working": toggleWorking(); break;
      case "open-path": {
        ev.stopPropagation();
        const r = state.renders.find((x) => x.id === id);
        if (r && desk) desk.openPath(r.path).then((res) => { if (!res.ok) toast("No encuentro esa carpeta desde este PC. Revisa que la unidad de red esté conectada."); });
        break;
      }
      case "open-draft-path": {
        const v = $("#f-path") && $("#f-path").value.trim();
        if (v && desk) desk.openPath(v).then((res) => { if (!res.ok) toast("No encuentro esa carpeta desde este PC."); });
        break;
      }
      case "pick-folder": {
        if (!desk) break;
        const input = $("#f-path");
        desk.pickFolder(input.value).then((dir) => { if (dir) { input.value = dir; const e = $("#f-path-err"); if (e) e.hidden = true; } });
        break;
      }
      case "settings": showGate(store.local || !store.pb ? "server" : "account"); break;
      case "gate-close": closeGate(); break;
      case "gate-mode": showGate(el.dataset.mode); break;
      case "gate-local": config.save({ ...config.load(), local: true }); store.startLocal(); break;
      case "logout": logout(); break;
      case "reconnect": if (store.pb) store.loadAll().catch(writeError); break;
      case "delete": state.sheet.draft = readDraft(); state.confirmDelete = true; renderSheet(); break;
      case "delete-cancel": state.sheet.draft = readDraft(); state.confirmDelete = false; renderSheet(); break;
      case "delete-confirm": deleteCurrent(); break;
      case "weeks": state.weeks = Number(el.dataset.w); renderAll(); break;
      case "shift": { const d = Number(el.dataset.d); state.shift = d === 0 ? 0 : state.shift + d; renderAll(); break; }
      case "arch-proj": state.archProj = el.dataset.p; renderAll(); break;
      case "load-sample": loadSample(); break;
      case "clear-sample": clearSample(); break;
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && state.gate) { if (state.gate.dismissable) closeGate(); return; }
    if (ev.key === "Escape" && state.sheet) closeSheet();
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".row[data-act], .card[data-act], .person[data-act]")) { ev.preventDefault(); ev.target.click(); }
  });
  document.addEventListener("submit", (ev) => {
    if (ev.target.id === "sheet") { ev.preventDefault(); submitSheet(); }
    else if (ev.target.id && ev.target.id.startsWith("gate-")) { ev.preventDefault(); gateSubmit(ev.target); }
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id === "q") { state.q = ev.target.value; renderAll(); }
    if (ev.target.id === "f-progress") $("#f-progress-v").textContent = `${ev.target.value}%`;
    if (ev.target.id === "f-path") { const e = $("#f-path-err"); if (e) e.hidden = true; }
  });

  // Arrastrar entre columnas del tablero
  let dragId = null;
  document.addEventListener("dragstart", (ev) => {
    const c = ev.target.closest && ev.target.closest(".card");
    if (!c || !state.canWrite) return;
    dragId = c.dataset.id; c.classList.add("dragging");
    try { ev.dataTransfer.setData("text/plain", dragId); ev.dataTransfer.effectAllowed = "move"; } catch (e) { /* ignorar */ }
  });
  document.addEventListener("dragend", (ev) => {
    const c = ev.target.closest && ev.target.closest(".card"); if (c) c.classList.remove("dragging");
    document.querySelectorAll(".col.over").forEach((x) => x.classList.remove("over"));
    dragId = null;
    if (pendingRender) { pendingRender = false; schedule(); }
  });
  document.addEventListener("dragover", (ev) => {
    const col = ev.target.closest && ev.target.closest(".col");
    if (!col || !dragId) return;
    ev.preventDefault();
    document.querySelectorAll(".col.over").forEach((x) => x !== col && x.classList.remove("over"));
    col.classList.add("over");
  });
  document.addEventListener("drop", async (ev) => {
    const col = ev.target.closest && ev.target.closest(".col");
    if (!col || !dragId) return;
    ev.preventDefault();
    col.classList.remove("over");
    const r = state.renders.find((x) => x.id === dragId);
    const to = col.dataset.col;
    dragId = null;
    if (!r || r.status === to) return;
    try {
      await store.patch("renders", r.id, { status: to, updatedAt: nowIso(), ...(state.me ? { updatedBy: state.me } : {}) });
      store.log("stage", r, { to });
      toast(`Movido a ${STAGE[to].label}`);
    } catch (e) { writeError(e); }
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.view === "cronograma") renderCronograma(); }, 150);
  });
  // Los tiempos relativos ("hace 5 min") se refrescan solos.
  setInterval(() => { if (!state.sheet) schedule(); }, 60000);

  route();
  boot();
})();
