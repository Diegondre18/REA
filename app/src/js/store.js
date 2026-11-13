// Datos: conexión con el servidor de la oficina (PocketBase), sincronización en vivo, consultas y acciones.
(() => {
  "use strict";
  const L = LAP;
  const desk = window.lap || null;
  const CONFIG_KEY = "lap-cerebro-config";
  const SESSION_KEY = "lap-cerebro-session";
  const ONLINE_MS = 150000; // "conectado" = latido en los últimos 2,5 minutos

  // colección del servidor → lista en state
  const COLS = {
    users: "users", proyectos: "proyectos", tareas: "tareas", eventos: "eventos", planes: "planes",
    plan_items: "planItems", vistos: "vistos", reportes: "reportes", notificaciones: "notifs", actividad: "actividad",
    // herramientas del estudio
    tramites: "tramites", planos: "planos", envios: "envios", visitas: "visitas", contactos: "contactos", materiales: "materiales",
    horas: "horas", cobros: "cobros", tarifas: "tarifas", ausencias: "ausencias", solicitudes: "solicitudes", revisiones: "revisiones", respaldos: "respaldos",
    bienestar: "bienestar", cierres: "cierres", ajustes: "ajustes", reconocimientos: "reconocimientos", anuncios: "anuncios",
    libretas: "libretas", libreta_items: "libretaItems", actas: "actas",
    proyecto_finanzas: "pfin", presupuesto: "presupuesto", contratos: "contratos", adicionales: "adicionales", pagos_proveedor: "pagosProv",
    costos: "costos", flujo: "flujo", gastos_fijos: "gastosFijos", tiempos: "tiempos", premios_semana: "premiosSemana",
  };
  const TOOL_COLS = ["tramites", "planos", "envios", "visitas", "contactos", "cobros", "ausencias", "solicitudes", "revisiones", "respaldos", "bienestar", "cierres", "ajustes", "reconocimientos", "anuncios", "libretas", "libreta_items", "actas",
    "proyecto_finanzas", "presupuesto", "contratos", "adicionales", "pagos_proveedor", "costos", "flujo", "gastos_fijos", "tiempos", "premios_semana"];

  const state = {
    mode: "boot", // boot | gate | connecting | live | offline
    gate: null, // { mode: server|login|register, error }
    me: null,
    users: [], proyectos: [], tareas: [], eventos: [], planes: [], planItems: [], vistos: [], reportes: [], notifs: [], actividad: [],
    tramites: [], planos: [], envios: [], visitas: [], contactos: [], materiales: [], horas: [], cobros: [], tarifas: [], ausencias: [], solicitudes: [], revisiones: [], respaldos: [], bienestar: [], cierres: [], ajustes: [], reconocimientos: [], anuncios: [], libretas: [], libretaItems: [], actas: [],
    pfin: [], presupuesto: [], contratos: [], adicionales: [], pagosProv: [], costos: [], flujo: [], gastosFijos: [], tiempos: [], premiosSemana: [],
    route: { name: "inicio", id: "", tab: "" },
    sheet: null, // { type, id, defaults }
    toast: null,
    update: null, // versión nueva lista para instalar
    q: "",
    serverUrl: "",
  };

  // Estados de cada persona (definidos en pixel-core.js, compartidos con la burbuja).
  L.PRESENCIAS = window.PIXCORE.PRESENCIAS;
  L.PRESENCIA = Object.fromEntries(L.PRESENCIAS.map((p) => [p.id, p]));
  const MUTE_KEY = "lap-cerebro-silencio";
  state.muted = (() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; } })();
  state.bubbleVisible = true;
  state.screenBusy = false;
  state.bellOpen = false;

  /* ---------- suscripción de la interfaz ---------- */
  const listeners = new Set();
  let raf = 0;
  function emit() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; listeners.forEach((f) => f()); });
  }
  function useStore() {
    const [, force] = L.hooks.useState(0);
    L.hooks.useEffect(() => {
      const f = () => force((n) => n + 1);
      listeners.add(f);
      f(); // ponerse al día con cambios ocurridos antes de suscribirse
      return () => listeners.delete(f);
    }, []);
    return state;
  }
  function set(patch) { Object.assign(state, patch); emit(); }
  listeners.add(() => syncBubble());

  let toastTimer = 0;
  function toast(msg) {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3600);
  }

  /* ---------- configuración y sesión ---------- */
  const config = {
    load() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch (e) { return {}; } },
    save(c) { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch (e) { /* bloqueado */ } },
  };
  // En la app de escritorio la sesión se guarda cifrada con la protección de Windows; en un navegador, en su almacenamiento.
  const session = {
    async load() {
      try {
        const raw = desk ? await desk.sessionLoad() : localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    save(token, record) {
      const raw = token ? JSON.stringify({ token, record }) : "";
      try { if (desk) desk.sessionSave(raw); else if (raw) localStorage.setItem(SESSION_KEY, raw); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* bloqueado */ }
    },
  };

  let pb = null;
  function makeClient(url) {
    // Almacén de sesión en memoria (el del SDK escribiría el token sin cifrar en localStorage).
    const probe = new PocketBase(url);
    const MemoryStore = Object.getPrototypeOf(Object.getPrototypeOf(probe.authStore)).constructor;
    const client = new PocketBase(url, new MemoryStore());
    client.autoCancellation(false);
    client.authStore.onChange((token, record) => session.save(token, record));
    return client;
  }

  const normalizeUrl = (u) => {
    let v = String(u || "").trim().replace(/\/+$/, "");
    if (v && !/^https?:\/\//i.test(v)) v = "http://" + v;
    if (/^http:\/\/[^/:]+$/i.test(v)) v += ":8090";
    return v;
  };
  async function ping(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try { return (await fetch(url + "/api/health", { signal: ctrl.signal })).ok; } catch (e) { return false; } finally { clearTimeout(timer); }
  }

  /* ---------- errores ---------- */
  function errMsg(e) {
    const status = e && typeof e.status === "number" ? e.status : -1;
    const msg = e && e.response && e.response.message;
    if (status === 0) return "No hay conexión con el servidor. Revisa la red de la oficina.";
    if (e && e.url && String(e.url).includes("/api/lap/") && msg) return msg;
    if (status === 400) {
      const fields = (e.response && e.response.data) || {};
      const f = Object.keys(fields)[0];
      if (f) return `Revisa el campo «${f}»: ${fields[f].message}`;
      // Reglas del estudio (ausencias, colores del muñeco…): el servidor explica qué pasó.
      return msg && !/^(Failed|Something went wrong)/i.test(msg) ? msg : "No tienes permiso para esto o faltan datos.";
    }
    if (status === 401) return "Tu sesión expiró. Vuelve a entrar.";
    if (status === 404 && /missing collection/i.test(String(msg || ""))) return "El servidor del estudio todavía no tiene esta función. Se actualiza solo en unos minutos (o reinicia el contenedor del NAS) y vuelve a intentar.";
    if (status === 403 || status === 404) return "No tienes permiso para hacer esto.";
    return "No se pudo guardar. Inténtalo de nuevo.";
  }
  function fail(e) {
    if (e && e.status === 0) set({ mode: "offline" });
    toast(errMsg(e));
    return null;
  }

  /* ---------- sincronización ---------- */
  function upsert(k, rec) {
    const arr = state[k];
    const i = arr.findIndex((x) => x.id === rec.id);
    state[k] = i >= 0 ? arr.map((x) => (x.id === rec.id ? rec : x)) : [...arr, rec];
  }
  function remove(k, id) { state[k] = state[k].filter((x) => x.id !== id); }

  async function loadAll() {
    const full = (c, opts) => pb.collection(c).getFullList({ batch: 500, ...opts });
    const [users, proyectos, tareas, eventos, planes, planItems, vistos, reportes, notifs, act] = await Promise.all([
      full("users"), full("proyectos"), full("tareas"), full("eventos"), full("planes"), full("plan_items"), full("vistos"), full("reportes"),
      full("notificaciones", { sort: "-created" }), pb.collection("actividad").getList(1, 80, { sort: "-created" }),
    ]);
    // Las herramientas se cargan aparte: lo que una persona no tiene permiso de ver (cobros, tarifas) llega vacío.
    const tools = await Promise.all(TOOL_COLS.map((c) => full(c).catch(() => [])));
    TOOL_COLS.forEach((c, i) => { state[COLS[c]] = tools[i]; });
    Object.assign(state, { users, proyectos, tareas, eventos, planes, planItems, vistos, reportes, notifs, actividad: act.items, mode: "live" });
    state.me = users.find((u) => u.id === pb.authStore.record.id) || pb.authStore.record;
    emit();
  }

  let beatTimer = 0;
  async function startLive() {
    state.me = pb.authStore.record;
    set({ mode: "connecting", gate: null });
    await loadAll();
    for (const col of Object.keys(COLS)) {
      const k = COLS[col];
      pb.collection(col).subscribe("*", (ev) => {
        if (k === "tareas" && ev.action === "update" && ev.record.status === "terminado" && L.onTaskFinished) {
          const was = state.tareas.find((x) => x.id === ev.record.id);
          if (was && was.status !== "terminado") L.onTaskFinished(ev.record);
        }
        if (ev.action === "delete") remove(k, ev.record.id);
        else if (k === "actividad") { if (ev.action === "create") state.actividad = [ev.record, ...state.actividad].slice(0, 80); }
        else if (k === "notifs") {
          const isNew = ev.action === "create" && !state.notifs.some((n) => n.id === ev.record.id);
          if (isNew) { state.notifs = [ev.record, ...state.notifs]; announce(ev.record); } else upsert(k, ev.record);
        } else upsert(k, ev.record);
        if (k === "users" && ev.record.id === state.me.id) state.me = ev.record;
        emit();
      }).catch(() => {});
    }
    let first = true;
    pb.realtime.subscribe("PB_CONNECT", () => { if (first) { first = false; return; } loadAll().catch(() => {}); });
    pb.realtime.onDisconnect = () => { set({ mode: "offline" }); };
    clearInterval(beatTimer);
    const beat = () => pb.collection("users").update(state.me.id, { lastSeen: new Date().toISOString() })
      .then(() => { if (state.mode === "offline") loadAll().catch(() => {}); })
      .catch((e) => { if (e && e.status === 0) set({ mode: "offline" }); });
    // Al abrir la app, cada quien llega a su puesto en la oficina.
    // Si la app estuvo cerrada más de 3 horas, el estado de ayer (almuerzo, reunión, fuera) no sigue.
    const stale = !state.me.lastSeen || Date.now() - Date.parse(String(state.me.lastSeen).replace(" ", "T")) > 3 * 3600e3;
    const fresh = stale && ["reunion", "almuerzo", "pausa", "fuera"].includes(q.presence(state.me)) ? { presencia: "disponible", presenciaRef: "" } : {};
    pb.collection("users").update(state.me.id, { lastSeen: new Date().toISOString(), puesto: true, pos: null, ...fresh })
      .then((rec) => { upsert("users", rec); state.me = rec; emit(); }).catch(() => {});
    beatTimer = setInterval(beat, 60000);
    setTimeout(autoMeeting, 3000);
  }

  // Avisos nuevos: en "No molestar" o "En reunión" solo suma al contador, salvo lo urgente
  // (cambios de fecha y lo que dice Dirección), que suena y aparece igual.
  function announce(n) {
    const pres = q.presence(state.me);
    const quiet = (pres === "no_molestar" || pres === "reunion" || pres === "pausa") && !n.urgente;
    if (quiet) { syncBubble(); return; }
    toast(n.title);
    if (!(state.muted && !n.urgente) && !(state.screenBusy && !n.urgente)) sound(n.urgente ? "urgente" : "normal");
    if (L.onNotif) L.onNotif(n);
    if (desk && desk.notify) desk.notify(n.title, n.body || "", n.route || "", !!n.urgente);
    if (desk && desk.bubbleNotify) {
      desk.bubbleNotify({ id: n.id, title: n.title, body: n.body || "", route: n.route || "", kind: n.kind || "", urgente: !!n.urgente, respuesta: n.respuesta || "" });
    }
  }

  // Sonidos propios, sin archivos: uno suave para lo normal y otro más notorio para lo urgente.
  let audio = null;
  // kind: normal | urgente | descanso (llamado a descansar) | vuelta (fin del descanso) | fiesta
  const MELODIES = {
    normal: { type: "sine", v: 0.12, len: 0.22, notes: [[660, 0], [990, 0.12]] },
    urgente: { type: "triangle", v: 0.22, len: 0.16, notes: [[880, 0], [1175, 0.13], [880, 0.32], [1175, 0.45]] },
    descanso: { type: "sine", v: 0.16, len: 0.5, notes: [[523, 0], [659, 0.22], [784, 0.44], [1047, 0.7]] },
    vuelta: { type: "sine", v: 0.13, len: 0.3, notes: [[784, 0], [659, 0.18], [784, 0.36]] },
    fiesta: { type: "triangle", v: 0.14, len: 0.14, notes: [[784, 0], [988, 0.1], [1175, 0.2], [1568, 0.32], [1175, 0.46], [1568, 0.56]] },
  };
  function sound(kind) {
    try {
      const m = MELODIES[kind === true ? "urgente" : kind === false ? "normal" : kind] || MELODIES.normal;
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const t0 = audio.currentTime + 0.02;
      for (const [f, at] of m.notes) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = m.type;
        o.frequency.value = f;
        const v = m.v, start = t0 + at, end = start + m.len;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(v, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.connect(g).connect(audio.destination);
        o.start(start); o.stop(end + 0.02);
      }
    } catch (e) { /* sin audio */ }
  }

  // Estado que ve la burbuja: el muñeco, el estado, cuántos avisos sin leer y el sonido.
  let bubbleSig = "";
  function syncBubble() {
    if (!desk || !desk.bubbleSync) return;
    const live = !!state.me && (state.mode === "live" || state.mode === "offline") && state.me.role !== "pantalla";
    const me = live ? { id: state.me.id, name: state.me.name, muneco: state.me.muneco || null } : null;
    const st = { me, presencia: live ? q.presence(state.me) : "", unread: live ? q.unread() : 0, muted: !!state.muted, theme: state.theme || "system",
      premios: live ? (L.premiosDe ? L.premiosDe(state.me) : state.me.premios || []) : [], timer: live && L.bubbleTimer ? L.bubbleTimer() : null, agua: live && L.bubbleAgua ? L.bubbleAgua() : null };
    const sig = JSON.stringify(st);
    if (sig === bubbleSig) return;
    const prev = bubbleSig ? JSON.parse(bubbleSig).unread : -1;
    bubbleSig = sig;
    desk.bubbleSync(st);
    if (desk.setBadge && st.unread !== prev) desk.setBadge(st.unread ? badgeImage(st.unread) : null, st.unread);
  }
  function badgeImage(n) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const c = cv.getContext("2d");
    c.fillStyle = "#e5484d"; c.beginPath(); c.arc(16, 16, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.font = "bold " + (n > 9 ? 16 : 20) + "px Segoe UI, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(n > 99 ? "99+" : String(n), 16, 17);
    return cv.toDataURL("image/png");
  }

  // Reuniones del calendario de la app: a la hora de inicio quedas "En reunión" y al terminar vuelves.
  const AUTO_SKIP = "lap-cerebro-reunion-omitida";
  const mins = (h) => { const [a, b] = String(h || "").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
  function meetingNow(uid) {
    const now = new Date(), t = L.todayIso(), m = now.getHours() * 60 + now.getMinutes();
    return state.eventos.find((e) => e.date === t && e.time && e.kind !== "entrega" && (e.attendees || []).includes(uid)
      && m >= mins(e.time) && m < mins(e.time) + (Number(e.duration) || 60)) || null;
  }
  function autoMeeting() {
    if (state.mode !== "live" || !state.me) return;
    const me = state.me, ev = meetingNow(me.id), pres = q.presence(me);
    let skip = ""; try { skip = localStorage.getItem(AUTO_SKIP) || ""; } catch (e) { /* bloqueado */ }
    if (ev && pres !== "reunion" && pres !== "fuera" && me.presenciaRef !== ev.id && skip !== ev.id) {
      act.setPresence("reunion", ev.id);
      toast("Empezó " + ev.title + ": quedaste En reunión");
    } else if (!ev && pres === "reunion" && me.presenciaRef) {
      act.setPresence("disponible");
    }
  }
  setInterval(autoMeeting, 30000);

  // Conecta con un servidor ya guardado. "offline" si no responde, "login" si hay que entrar.
  async function connectTo(url) {
    pb = makeClient(url);
    state.serverUrl = url;
    const saved = await session.load();
    if (saved && saved.token) pb.authStore.save(saved.token, saved.record);
    if (!pb.authStore.isValid) return (await ping(url)) ? "login" : "offline";
    try {
      await pb.collection("users").authRefresh();
      await startLive();
      return "ok";
    } catch (e) {
      if (e && e.status === 0) return "offline";
      pb.authStore.clear();
      return "login";
    }
  }

  async function boot() {
    const cfg = config.load();
    let url = cfg.url || "";
    // En el PC que es el servidor, la app lo arranca antes de conectarse.
    const hs = desk && desk.hostStatus ? await desk.hostStatus().catch(() => null) : null;
    if (hs && hs.hosting) {
      const r = await desk.hostStart();
      if (!r.ok) { set({ mode: "gate", gate: { mode: "server", error: r.error } }); return; }
      url = r.url;
      config.save({ url, host: true });
    }
    if (!url) { set({ mode: "gate", gate: { mode: "server", auto: true } }); return; }
    let r = await connectTo(url);
    // Si el servidor cambió de dirección en la red, se busca solo.
    if (r === "offline" && !(hs && hs.hosting) && desk && desk.discover) {
      const found = await desk.discover().catch(() => []);
      const other = found.find((f) => f.url !== url);
      if (other) { config.save({ url: other.url }); r = await connectTo(other.url); }
    }
    if (r === "ok") return;
    if (r === "login") { set({ mode: "gate", gate: { mode: "login" } }); return; }
    set({ mode: "gate", gate: { mode: "server", auto: true, error: `No encuentro el servidor del estudio (${url.replace(/^https?:\/\//, "")}). ¿Está prendido el PC que hace de servidor?` } });
  }

  const auth = {
    discover: () => (desk && desk.discover ? desk.discover().catch(() => []) : Promise.resolve([])),
    // Convierte este PC en el servidor del estudio. Desde ahí arranca solo cada vez que abre la app.
    async hostHere() {
      const r = await desk.hostEnable();
      if (!r.ok) return r.error || "No se pudo arrancar el servidor en este PC.";
      config.save({ url: r.url, host: true });
      state.serverUrl = r.url;
      pb = makeClient(r.url);
      set({ mode: "gate", gate: { mode: "login", hosted: true, firewall: r.firewall } });
      return "";
    },
    async stopHosting() {
      await desk.hostDisable();
      config.save({});
      auth.logout();
    },
    async maestro(email, password, name) {
      const r = await desk.hostMaestro(email, password, name);
      return r.ok ? "" : r.message || "No se pudo crear el perfil maestro.";
    },
    async connect(rawUrl) {
      const url = normalizeUrl(rawUrl);
      if (!(await ping(url))) return `No encuentro el servidor en ${url}. Revisa la dirección y que el PC o NAS del servidor esté encendido.`;
      config.save({ url });
      state.serverUrl = url;
      pb = makeClient(url);
      set({ mode: "gate", gate: { mode: "login" } });
      return "";
    },
    async login(email, password) {
      // El correo da igual en mayúsculas o minúsculas: se prueba como se escribió y en minúsculas.
      const raw = String(email || "").trim(), low = raw.toLowerCase();
      let last = null;
      for (const id of raw === low ? [raw] : [low, raw]) {
        try { await pb.collection("users").authWithPassword(id, password); await startLive(); return ""; }
        catch (e) { last = e; if (e && e.status === 0) break; }
      }
      return last && last.status === 0 ? "No hay conexión con el servidor." : "Correo o contraseña incorrectos. Revisa que la contraseña tenga las mayúsculas y minúsculas correctas.";
    },
    async register(name, email, password, team) {
      email = String(email || "").trim().toLowerCase();
      try {
        await pb.collection("users").create({ name, email, password, passwordConfirm: password, areas: [team] });
        await pb.collection("users").authWithPassword(email, password);
        await startLive();
        return "";
      } catch (e) {
        if (e && e.status === 0) return "No hay conexión con el servidor.";
        const data = (e.response && e.response.data) || {};
        // Mensajes propios del servidor: dominio de correo, equipo y cupo de Dirección.
        if (e.response && e.response.message && !/^Failed/.test(e.response.message)) return e.response.message;
        if (data.email) return "Ese correo no es válido o ya tiene una cuenta.";
        if (data.password) return "La contraseña necesita al menos 8 caracteres.";
        return "No se pudo crear la cuenta. Revisa los datos.";
      }
    },
    logout() {
      if (pb) { pb.realtime.unsubscribe().catch(() => {}); pb.authStore.clear(); }
      location.reload();
    },
    changeServer() { set({ mode: "gate", gate: { mode: "server", back: !!state.me } }); },
    gate(mode, extra) { set({ mode: "gate", gate: { mode, ...(extra || {}) } }); },
    closeGate() { if (state.me) set({ mode: "live", gate: null }); },
  };

  /* ---------- consultas ---------- */
  const q = {
    user: (id) => state.users.find((u) => u.id === id) || null,
    project: (id) => state.proyectos.find((p) => p.id === id) || null,
    task: (id) => state.tareas.find((t) => t.id === id) || null,
    event: (id) => state.eventos.find((e) => e.id === id) || null,
    name: (id) => { const u = q.user(id); return u ? (u.name || "Alguien") : "Alguien"; },
    first: (id) => (state.me && id === state.me.id ? "Tú" : L.first(q.name(id)) || "Alguien"),
    avatar: (u) => (u && u.avatar ? pb.files.getURL(u, u.avatar, { thumb: "100x100" }) : ""),
    // Dirección creativa y perfil maestro tienen los mismos permisos sobre proyectos y planes.
    isDirector: () => !!state.me && (state.me.role === "director" || state.me.role === "maestro"),
    isMaestro: () => !!state.me && state.me.role === "maestro",
    canLead: (p) => !!p && !!state.me && (p.leader === state.me.id || p.apoyo === state.me.id || q.isDirector()),
    // A cargo del proyecto: el Director creativo (siempre), quien lo dirige y el apoyo (opcional).
    creativeDirector: () => state.users.find((u) => u.role === "director") || null,
    aCargo: (p) => {
      if (!p) return [];
      const dc = q.creativeDirector();
      return [dc && { id: dc.id, rol: "Director creativo" }, p.leader && { id: p.leader, rol: "Dirige el proyecto" }, p.apoyo && { id: p.apoyo, rol: "Apoyo" }].filter(Boolean);
    },
    // El equipo del estudio, sin el perfil maestro de soporte.
    staff: () => state.users.filter((u) => u.role !== "maestro" && u.role !== "pantalla"),
    // Finanzas: Dirección, perfil maestro y el área de Administración (el líder ve los cobros de su proyecto).
    isFin: () => q.isDirector() || ((state.me && state.me.areas) || []).some((a) => a === "administracion" || a === "gestion"),
    canSeeMoney: (p) => q.isFin() || (!!p && !!state.me && (p.leader === state.me.id || p.apoyo === state.me.id)),
    contacto: (id) => state.contactos.find((c) => c.id === id) || null,
    revision: (id) => state.revisiones.find((r) => r.id === id) || null,
    // Ausencia vigente de una persona en una fecha (hoy si no se dice).
    absent: (uid, day) => { const d = day || LAP.todayIso(); return state.ausencias.find((a) => a.user === uid && a.desde <= d && a.hasta >= d) || null; },
    subtasks: (taskId) => state.tareas.filter((t) => t.parent === taskId),
    // Ausencias contra una asignación: bloquea si la tarea empieza o se entrega mientras la persona no está;
    // si la ausencia cae en medio, solo avisa.
    absenceIssues: (ids, start, due) => {
      const out = { block: [], warn: [] };
      const ini = start || due, fin = due || start;
      if (!ini) return out;
      const TXT = { vacaciones: "de vacaciones", incapacidad: "incapacitada", permiso: "de permiso", fuera: "fuera de la oficina", otro: "ausente" };
      for (const uid of ids || []) {
        for (const a of state.ausencias.filter((x) => x.user === uid && x.desde <= fin && x.hasta >= ini)) {
          const who = q.first(uid) === "Tú" ? "Tú estarás" : L.first(q.name(uid)) + " estará";
          const when = a.desde === a.hasta ? "el " + L.fmtShort(a.desde) : "del " + L.fmtShort(a.desde) + " al " + L.fmtShort(a.hasta);
          const hit = (d) => d && a.desde <= d && a.hasta >= d;
          if (hit(ini) || hit(fin)) out.block.push({ user: uid, a, text: `${who} ${TXT[a.tipo] || "ausente"} ${when}. No se le pueden asignar tareas que empiecen o se entreguen en esas fechas.` });
          else out.warn.push({ user: uid, a, text: `${who} ${TXT[a.tipo] || "ausente"} ${when}, en medio de esta tarea.` });
        }
      }
      return out;
    },
    fromOrigin: (origen) => state.tareas.filter((t) => t.origen === origen),
    roleLabel: (u) => (!u ? "" : u.role === "maestro" ? "Perfil maestro" : u.role === "director" ? "Director creativo" : u.role === "pantalla" ? "Pantalla de la oficina" : "Integrante"),
    isMember: (p) => !!p && !!state.me && (p.members || []).includes(state.me.id),
    // En su puesto: si se paró del escritorio en la oficina, está "fuera" (almuerzo, una vuelta).
    atDesk: (u) => !!u && u.puesto !== false,
    // Estado elegido en la burbuja o en el perfil (disponible, no molestar, en reunión, almuerzo, fuera).
    presence: (u) => (u && u.presencia) || "disponible",
    presenceInfo: (u) => L.PRESENCIA[(u && u.presencia) || "disponible"] || L.PRESENCIA.disponible,
    online: (u) => !!u && ((state.me && u.id === state.me.id) || (!!u.lastSeen && Date.now() - Date.parse(u.lastSeen) < ONLINE_MS)),
    workingOn: (taskId) => state.users.filter((u) => u.taskId === taskId),
    viewing: (taskId) => state.users.filter((u) => u.id !== state.me.id && u.viewing === taskId && q.online(u)),
    projectTasks: (pid) => state.tareas.filter((t) => t.project === pid),
    projectEvents: (pid) => state.eventos.filter((e) => e.project === pid).sort((a, b) => L.eventStamp(a).localeCompare(L.eventStamp(b))),
    projectPlans: (pid) => state.planes.filter((p) => p.project === pid).sort((a, b) => a.version - b.version),
    approvedPlan: (pid) => state.planes.find((p) => p.project === pid && p.status === "aprobado") || null,
    openPlan: (pid) => state.planes.find((p) => p.project === pid && (p.status === "borrador" || p.status === "en_aprobacion")) || null,
    planItems: (planId) => state.planItems.filter((i) => i.plan === planId).sort((a, b) => a.date.localeCompare(b.date) || (a.order || 0) - (b.order || 0)),
    planVistos: (planId) => state.vistos.filter((v) => v.plan === planId),
    // Integrantes que deben dar visto bueno: todos menos quien lidera.
    reviewers: (p) => (p ? (p.members || []).filter((m) => m !== p.leader && m !== p.apoyo) : []),
    // La reunión con cliente más cercana del proyecto, a partir de una fecha.
    nextClientMeeting: (pid, from) => {
      const start = from || L.todayIso();
      return state.eventos.filter((e) => e.project === pid && e.kind === "cliente" && e.date >= start)
        .sort((a, b) => L.eventStamp(a).localeCompare(L.eventStamp(b)))[0] || null;
    },
    myTasks: (uid) => state.tareas.filter((t) => (t.assignees || []).includes(uid)),
    myEvents: (uid) => state.eventos.filter((e) => (e.attendees || []).includes(uid)),
    myProjects: (uid) => state.proyectos.filter((p) => p.status !== "cerrado" && ((p.members || []).includes(uid) || p.leader === uid || p.apoyo === uid)),
    unread: () => state.notifs.filter((n) => !n.read).length,
    // Lo que está esperando una acción mía.
    pending: () => {
      const me = state.me.id;
      const out = { vistos: [], aprobar: [], reportes: [] };
      for (const plan of state.planes) {
        if (plan.status !== "en_aprobacion") continue;
        const p = q.project(plan.project); if (!p) continue;
        const vistos = q.planVistos(plan.id);
        if (q.reviewers(p).includes(me) && !vistos.some((v) => v.user === me)) out.vistos.push({ plan, project: p });
        if (p.leader === me || p.apoyo === me || q.isDirector()) {
          const ok = q.reviewers(p).filter((m) => vistos.some((v) => v.user === m && v.verdict === "ok")).length;
          out.aprobar.push({ plan, project: p, ok, total: q.reviewers(p).length, cambios: vistos.filter((v) => v.verdict === "cambios") });
        }
      }
      const t = L.todayIso(), lim = L.iso(L.addDays(L.today(), 3));
      for (const ev of state.eventos) {
        if (ev.kind !== "comite" || ev.date < t || ev.date > lim || !(ev.attendees || []).includes(me)) continue;
        if (!state.reportes.some((r) => r.event === ev.id && r.user === me)) out.reportes.push(ev);
      }
      return out;
    },
  };

  /* ---------- acciones ---------- */
  const now = () => new Date().toISOString();
  const run = async (fn) => { try { return await fn(); } catch (e) { return fail(e); } };
  const log = (kind, title, ref, project, to) =>
    pb.collection("actividad").create({ by: state.me.id, kind, title: String(title || "").slice(0, 200), ref: ref || "", project: project || "", to: to || "" }).catch(() => {});

  const act = {
    async saveTask(id, data) {
      return run(async () => {
        const prev = id ? q.task(id) : null;
        const body = { ...data, updatedBy: state.me.id };
        const next = { ...(prev || {}), ...data };
        const touched = !prev || ["assignees", "start", "due"].some((k) => k in data && JSON.stringify(data[k]) !== JSON.stringify(prev[k]));
        const clash = touched ? q.absenceIssues(next.assignees, next.start, next.due).block : [];
        if (clash.length) { toast(clash[0].text); return null; }
        if (body.status === "terminado") { body.progress = 100; if (!prev || prev.status !== "terminado") body.doneAt = L.todayIso(); }
        else if (body.status) body.doneAt = "";
        if (body.status && body.status !== "en_curso") body.stage = "";
        const rec = id ? await pb.collection("tareas").update(id, body) : await pb.collection("tareas").create({ status: "pendiente", progress: 0, ...body });
        upsert("tareas", rec); emit();
        if (!prev) log("create", rec.title, rec.id, rec.project);
        else if (body.status && prev.status !== rec.status) {
          log(rec.status === "terminado" ? "done" : "stage", rec.title, rec.id, rec.project, rec.status);
          // Al terminar, quien la tenía como trabajo actual queda libre.
          if (rec.status === "terminado" && state.me.taskId === rec.id) act.setWorking(null);
          if (rec.status === "terminado" && L.onTaskDone) L.onTaskDone(rec);
        }
        return rec;
      });
    },
    async deleteTask(id) {
      return run(async () => {
        const t = q.task(id);
        await pb.collection("tareas").delete(id);
        remove("tareas", id); emit();
        if (t) log("delete", t.title, "", t.project);
        return true;
      });
    },
    // "Estoy trabajando en esto": lo ve todo el equipo. Una tarea por hacer pasa a En curso.
    async setWorking(taskId) {
      return run(async () => {
        const t = now();
        const rec = await pb.collection("users").update(state.me.id, { taskId: taskId || "", since: taskId ? t : "", lastSeen: t });
        upsert("users", rec); state.me = rec; emit();
        const task = taskId && q.task(taskId);
        if (task) {
          if (task.status === "pendiente") await act.saveTask(task.id, { status: "en_curso" });
          log("working", task.title, task.id, task.project);
        }
        return rec;
      });
    },
    setViewing(taskId) {
      if (!pb || !state.me || (state.me.viewing || "") === (taskId || "")) return;
      pb.collection("users").update(state.me.id, { viewing: taskId || "" }).then((rec) => { upsert("users", rec); state.me = rec; }).catch(() => {});
    },
    async saveProject(id, data) {
      return run(async () => {
        const rec = id ? await pb.collection("proyectos").update(id, data) : await pb.collection("proyectos").create({ status: "activo", leader: state.me.id, ...data });
        upsert("proyectos", rec); emit();
        if (!id) log("project", rec.name, rec.id, rec.id);
        return rec;
      });
    },
    async deleteProject(id) {
      return run(async () => { await pb.collection("proyectos").delete(id); await loadAll(); return true; });
    },
    async saveEvent(id, data) {
      return run(async () => {
        const rec = id ? await pb.collection("eventos").update(id, data) : await pb.collection("eventos").create({ ...data, createdBy: state.me.id });
        upsert("eventos", rec); emit();
        if (!id) log(rec.kind === "comite" ? "comite" : "meeting", rec.title, rec.id, rec.project);
        return rec;
      });
    },
    async deleteEvent(id) {
      return run(async () => { await pb.collection("eventos").delete(id); remove("eventos", id); emit(); return true; });
    },
    async saveReport(eventId, data) {
      return run(async () => {
        const prev = state.reportes.find((r) => r.event === eventId && r.user === state.me.id);
        const rec = prev ? await pb.collection("reportes").update(prev.id, data) : await pb.collection("reportes").create({ event: eventId, user: state.me.id, ...data });
        upsert("reportes", rec); emit();
        return rec;
      });
    },
    // ---- plan de entregables ----
    async createPlan(projectId) {
      return run(async () => {
        const version = Math.max(0, ...q.projectPlans(projectId).map((p) => p.version || 0)) + 1;
        const rec = await pb.collection("planes").create({ project: projectId, version, status: "borrador", createdBy: state.me.id });
        upsert("planes", rec); emit();
        return rec;
      });
    },
    async saveItem(id, data) {
      return run(async () => {
        const prev = id ? state.planItems.find((i) => i.id === id) : null;
        const next = { ...(prev || {}), ...data };
        const clash = q.absenceIssues(next.assignees, next.date, next.end || next.date).block;
        if (clash.length && (!prev || ["assignees", "date", "end"].some((k) => k in data && JSON.stringify(data[k]) !== JSON.stringify(prev[k])))) { toast(clash[0].text); return null; }
        const rec = id ? await pb.collection("plan_items").update(id, data) : await pb.collection("plan_items").create({ key: L.key(), ...data });
        upsert("planItems", rec); emit();
        return rec;
      });
    },
    async deleteItem(id) {
      return run(async () => { await pb.collection("plan_items").delete(id); remove("planItems", id); emit(); return true; });
    },
    async planStep(planId, step) {
      return run(async () => {
        const r = await pb.send(`/api/lap/planes/${planId}/${step}`, { method: "POST" });
        await loadAll();
        return r;
      });
    },
    async setVisto(planId, verdict, comment) {
      return run(async () => {
        const prev = state.vistos.find((v) => v.plan === planId && v.user === state.me.id);
        const body = { verdict, comment: comment || "" };
        const rec = prev ? await pb.collection("vistos").update(prev.id, body) : await pb.collection("vistos").create({ plan: planId, user: state.me.id, ...body });
        upsert("vistos", rec); emit();
        return rec;
      });
    },
    // ---- notificaciones ----
    async readNotif(n) {
      if (desk && desk.bubbleNotify) desk.bubbleNotify({ clear: n.id });
      if (n.read) return;
      upsert("notifs", { ...n, read: true }); emit();
      pb.collection("notificaciones").update(n.id, { read: true }).catch(() => {});
    },
    async readAll() {
      const unread = state.notifs.filter((n) => !n.read);
      if (desk && desk.bubbleNotify) desk.bubbleNotify({ clearAll: true });
      state.notifs = state.notifs.map((n) => ({ ...n, read: true })); emit();
      for (const n of unread) pb.collection("notificaciones").update(n.id, { read: true }).catch(() => {});
    },
    // ---- personas ----
    async saveUser(id, data) {
      return run(async () => {
        const rec = await pb.collection("users").update(id, data);
        upsert("users", rec); if (id === state.me.id) state.me = rec; emit();
        return rec;
      });
    },
    reconnect() { if (pb) loadAll().catch(fail); },
    // Estado de la persona. Disponible y No molestar la dejan en su puesto; Reunión y Almuerzo la llevan
    // a la sala de juntas o la cafetería de la oficina; Fuera la saca de la oficina.
    async setPresence(value, ref) {
      if (!L.PRESENCIA[value]) return null;
      const me = state.me;
      // Si la persona cambia el estado durante una reunión automática, no se vuelve a poner solo.
      if (me.presenciaRef && !ref) { try { localStorage.setItem(AUTO_SKIP, me.presenciaRef); } catch (e) { /* bloqueado */ } }
      const body = { presencia: value, presenciaRef: ref || "", pos: null, puesto: value === "disponible" || value === "no_molestar" };
      if (L.onPresence) L.onPresence(value, ref);
      upsert("users", { ...me, ...body }); state.me = { ...me, ...body }; emit();
      return run(async () => {
        const rec = await pb.collection("users").update(me.id, { ...body, lastSeen: now() });
        upsert("users", rec); state.me = rec; emit();
        return rec;
      });
    },
    setMuted(on) {
      try { localStorage.setItem(MUTE_KEY, on ? "1" : ""); } catch (e) { /* bloqueado */ }
      set({ muted: !!on });
      toast(on ? "Sonido silenciado. Lo urgente suena igual." : "Sonido activado");
    },
    testSound(urgent) { sound(!!urgent); },
    // Tocar el hombro: le llega a la otra persona en su burbuja aunque tenga la app minimizada.
    // Dirección o el maestro le pone una contraseña nueva a otra persona.
    async setUserPassword(userId, password) {
      try { await pb.send("/api/lap/clave", { method: "POST", body: { user: userId, password } }); return ""; }
      catch (e) { return (e && e.response && e.response.message) || "No se pudo cambiar la contraseña."; }
    },
    // Cambiar la propia contraseña (pide la actual). La sesión sigue abierta con la nueva.
    async changeMyPassword(oldPassword, password) {
      if (password.length < 8) return "La contraseña nueva necesita al menos 8 caracteres.";
      try {
        const email = state.me.email;
        await pb.collection("users").update(state.me.id, { oldPassword, password, passwordConfirm: password });
        await pb.collection("users").authWithPassword(email, password);
        return "";
      } catch (e) {
        const d = (e && e.response && e.response.data) || {};
        if (d.oldPassword) return "La contraseña actual no es correcta.";
        return (e && e.response && e.response.message) || "No se pudo cambiar la contraseña.";
      }
    },
    async toque(to, mensaje) {
      return run(async () => {
        const r = await pb.send("/api/lap/toque", { method: "POST", body: { to, mensaje: mensaje || "" } });
        return r;
      });
    },
    async replyToque(n, respuesta) {
      return run(async () => {
        await pb.send("/api/lap/toque/responder", { method: "POST", body: { notif: n.id, respuesta } });
        upsert("notifs", { ...n, read: true, respuesta }); emit();
        toast(respuesta === "voy" ? "Le avisaste que vas" : respuesta === "10" ? "Le avisaste que vas en 10 minutos" : "Le avisaste que ahora no puedes");
        return true;
      });
    },
    // Oficina: posición del muñeco y si está en su puesto. Sin avisos de error: se reintenta al moverse.
    movePresence(data) {
      if (!pb || !state.me) return Promise.resolve(null);
      // Volver caminando al puesto termina el almuerzo, la reunión o el "fuera".
      if (data.puesto === true && ["reunion", "almuerzo", "pausa", "fuera"].includes(q.presence(state.me))) {
        if (state.me.presenciaRef) { try { localStorage.setItem(AUTO_SKIP, state.me.presenciaRef); } catch (e) { /* bloqueado */ } }
        data = { ...data, presencia: "disponible", presenciaRef: "" };
      }
      Object.assign(state.me, data);
      return pb.collection("users").update(state.me.id, data).then((rec) => { upsert("users", rec); state.me = rec; emit(); return rec; }).catch(() => null);
    },

    // ---- herramientas: guardado genérico (colección del servidor, id o null para crear, datos) ----
    async save(col, id, data) {
      return run(async () => {
        const rec = id ? await pb.collection(col).update(id, data) : await pb.collection(col).create(data);
        upsert(COLS[col], rec); emit();
        return rec;
      });
    },
    // Premio de la semana: lo guarda el primero que llega; si ya existe, el servidor lo rechaza en silencio.
    premioSemana(data) {
      if (!pb) return Promise.resolve(null);
      return pb.collection("premios_semana").create(data).then((rec) => { upsert("premiosSemana", rec); emit(); return rec; }).catch(() => null);
    },
    async remove(col, id) {
      return run(async () => { await pb.collection(col).delete(id); remove(COLS[col], id); emit(); return true; });
    },
    // Crea varias tareas de una vez (compromisos de un acta, pendientes de obra, plantillas).
    async createTasks(list) {
      return run(async () => {
        const out = [];
        for (const t of list) {
          const clash = q.absenceIssues(t.assignees, t.start, t.due).block;
          if (clash.length) { toast(clash[0].text); continue; }
          const rec = await pb.collection("tareas").create({ status: "pendiente", progress: 0, updatedBy: state.me.id, ...t });
          upsert("tareas", rec); out.push(rec);
        }
        emit();
        return out.length ? out : null;
      });
    },

    // ---- datos de ejemplo: solo a pedido, marcados, y se borran de un golpe ----
    async loadSample() {
      return run(async () => {
        const me = state.me.id;
        const others = q.staff().filter((u) => u.id !== me).map((u) => u.id);
        const team = [me, ...others.slice(0, 5)];
        const who = (i) => [team[i % team.length]];
        const D = (n) => L.iso(L.addDays(L.today(), n));
        const mk = (c, d) => pb.collection(c).create(d);
        toast("Cargando ejemplo…");
        // Quien dirige los proyectos de ejemplo: otra persona si quien los carga es el Director creativo.
        const lead = state.me.role === "director" ? (q.staff().find((u) => u.role !== "director") || {}).id || me : me;
        const p1 = await mk("proyectos", { name: "Torre Alameda", code: "TA-24", client: "Constructora Alameda", phase: "ejecucion", status: "activo", leader: lead, members: team, areas: ["arquitectura", "interior", "visualizacion"], start: D(-30), end: D(60), folder: "\\\\NAS-LAP\\Proyectos\\TA-24_TorreAlameda\\", sample: true });
        const p2 = await mk("proyectos", { name: "Casa Encinos", code: "CE-07", client: "Familia Encinos", phase: "anteproyecto", status: "activo", leader: lead, members: team.slice(0, 3), areas: ["arquitectura", "interior"], start: D(-10), end: D(45), sample: true });
        const r1 = await mk("eventos", { project: p1.id, kind: "cliente", title: "Presentación de fachadas al cliente", date: D(6), time: "10:00", duration: 60, attendees: team, createdBy: me, agenda: "Fachadas, lobby y avance de planos de licencia." });
        await mk("eventos", { project: p1.id, kind: "comite", title: "Comité interno Torre Alameda", date: D(1), time: "09:00", duration: 30, attendees: team, createdBy: me });
        await mk("eventos", { project: p2.id, kind: "cliente", title: "Revisión de anteproyecto", date: D(9), time: "15:00", duration: 60, attendees: team.slice(0, 3), createdBy: me });
        const T = (title, project, area, kind, status, s, e, i, extra) => mk("tareas", { title, project, area, kind, status, start: D(s), due: D(e), assignees: who(i), progress: 0, updatedBy: me, ...extra });
        await T("Fachada principal al atardecer", p1.id, "visualizacion", "render", "en_curso", -3, 2, 1, { stage: "render", progress: 60, engine: "V-Ray", resolution: "5000×2813", version: "v02", meeting: r1.id });
        await T("Lobby de doble altura", p1.id, "visualizacion", "render", "revision", -6, 1, 2, { progress: 100, engine: "Corona", resolution: "3840×2160", version: "v03", meeting: r1.id });
        await T("Planos de fachada para licencia", p1.id, "arquitectura", "planos", "en_curso", -4, 4, 0, { progress: 35 });
        await T("Selección de acabados del lobby", p1.id, "interior", "diseno", "pendiente", 1, 5, 3, { meeting: r1.id });
        await T("Radicar solicitud en curaduría", p1.id, "administracion", "gestion", "pendiente", 7, 10, 4, {});
        await T("Vista aérea con contexto", p1.id, "visualizacion", "render", "terminado", -14, -6, 1, { progress: 100, doneAt: D(-6), engine: "V-Ray", resolution: "7680×4320", version: "v02", path: "\\\\NAS-LAP\\Proyectos\\TA-24_TorreAlameda\\03_Renders\\Final\\v02\\" });
        await T("Planta arquitectónica nivel 1", p2.id, "arquitectura", "planos", "en_curso", -2, 3, 0, { progress: 50 });
        await T("Moodboard de interiores", p2.id, "interior", "presentacion", "pendiente", 0, 6, 2, {});
        const plan = await mk("planes", { project: p2.id, version: 1, status: "borrador", createdBy: me });
        const I = (date, end, content, area, kind, i, order) => mk("plan_items", { plan: plan.id, key: L.key(), date: D(date), end: D(end), content, area, kind, assignees: who(i), order });
        await I(1, 3, "Plantas y cortes del anteproyecto", "arquitectura", "planos", 0, 1);
        await I(3, 6, "Modelo 3D de volumetría", "visualizacion", "modelado", 1, 2);
        await I(5, 8, "Renders de fachada y sala", "visualizacion", "render", 1, 3);
        await I(6, 8, "Presentación para el cliente", "interior", "presentacion", 2, 4);
        await loadAll();
        toast("Ejemplo cargado. Puedes borrarlo cuando quieras.");
        return true;
      });
    },
    async clearSample() {
      return run(async () => {
        for (const p of state.proyectos.filter((x) => x.sample)) await pb.collection("proyectos").delete(p.id);
        if (state.me.taskId && !q.task(state.me.taskId)) await pb.collection("users").update(state.me.id, { taskId: "", since: "" });
        await loadAll();
        toast("Ejemplos borrados");
        return true;
      });
    },
  };

  /* ---------- modo claro u oscuro ---------- */
  const THEME_KEY = "lap-cerebro-tema";
  const THEMES = [{ id: "system", label: "Sistema" }, { id: "light", label: "Claro" }, { id: "dark", label: "Oscuro" }];
  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode); else root.removeAttribute("data-theme");
    if (desk && desk.setTheme) desk.setTheme(mode);
  }
  function setTheme(mode) {
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* bloqueado */ }
    applyTheme(mode);
    set({ theme: mode });
  }
  state.theme = (() => { try { return localStorage.getItem(THEME_KEY) || "system"; } catch (e) { return "system"; } })();
  applyTheme(state.theme);

  /* ---------- rutas ---------- */
  const VIEWS = ["inicio", "semana", "linea", "pausa", "cierre", "pantalla", "agenda", "proyectos", "proyecto", "reuniones", "evento", "area", "equipo",
    "solicitudes", "directorio", "ausencias", "finanzas", "revision", "oficina", "agentes", "libretas", "libreta", "acta", "gestion"];
  // Dirección de un archivo guardado en el servidor (fotos de libretas y actas). thumb: "480x0".
  L.pbFile = (rec, name, thumb) => (pb && rec && name ? pb.files.getURL(rec, name, thumb ? { thumb } : {}) : "");
  function parseRoute() {
    const [name, id, tab] = location.hash.replace(/^#/, "").split("/");
    if (name === "tarea" && id) {
      // Un aviso puede apuntar a una tarea: se abre su panel sobre la vista actual.
      state.sheet = { type: "task", id };
      history.replaceState(null, "", "#" + [state.route.name, state.route.id, state.route.tab].filter(Boolean).join("/"));
      emit();
      return;
    }
    state.route = { name: VIEWS.includes(name) ? name : "inicio", id: id || "", tab: tab || "" };
    state.sheet = null;
    state.q = "";
    emit();
  }
  window.addEventListener("hashchange", parseRoute);
  const go = (hash) => { if (location.hash === hash) parseRoute(); else location.hash = hash; };
  const openSheet = (type, id, defaults) => { set({ sheet: { type, id: id || null, defaults: defaults || {} } }); };
  const closeSheet = () => { set({ sheet: null }); };
  if (desk && desk.onNavigate) desk.onNavigate((route) => { if (route) go(route); });
  // Lo que se pide desde la burbuja de escritorio.
  if (desk && desk.onBubbleAction) {
    desk.onBubbleAction((a) => {
      if (!a) return;
      if (a.type === "screen-busy") { set({ screenBusy: !!a.value }); return; }
      if (a.type === "visibility") { set({ bubbleVisible: !!a.value }); return; }
      if (!state.me || !pb) return;
      const n = a.id ? state.notifs.find((x) => x.id === a.id) : null;
      if (a.type === "presence") act.setPresence(a.value);
      else if (a.type === "mute") act.setMuted(!!a.value);
      else if (a.type === "reply" && n) act.replyToque(n, a.respuesta);
      else if (a.type === "bell") set({ bellOpen: true });
      else if (a.type === "open") { if (n) act.readNotif(n); if (a.route) go(a.route); }
      else if (a.type === "custom" && L.onBubbleCustom) L.onBubbleCustom(a);
    });
    if (desk.bubbleVisible) desk.bubbleVisible().then((v) => set({ bubbleVisible: !!v })).catch(() => {});
    if (desk.screenBusy) desk.screenBusy().then((v) => set({ screenBusy: !!v })).catch(() => {});
  }
  // Versión nueva descargada en segundo plano: se ofrece reiniciar para instalarla.
  if (desk && desk.onUpdateReady) {
    desk.onUpdateReady((v) => set({ update: v }));
    desk.updateStatus().then((v) => { if (v) set({ update: v }); }).catch(() => {});
    if (desk.onUpdateState) {
      desk.onUpdateState((st) => set({ updateState: st }));
      desk.updateState().then((st) => set({ updateState: st })).catch(() => {});
    }
  }

  Object.assign(L, { state, useStore, set, toast, q, act, auth, boot, go, openSheet, closeSheet, parseRoute, desk, errMsg, THEMES, setTheme, sound, syncBubble });
})();
