// Bot de Telegram del estudio. El servidor le pregunta a Telegram cada pocos segundos si hay mensajes
// nuevos (no hace falta abrir el NAS a internet). Cada persona vincula su chat una vez desde su perfil.
// Etapa 1: mis tareas (iniciar y entregar), mi estado y avisos (con respuesta a los toques de hombro).
const lib = require(`${__hooks}/lib.js`);

const api = require(`${__hooks}/telegram-api.js`);
const obra = require(`${__hooks}/telegram-obra.js`);
const { tg, enviar, editar, esc, corto } = api;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Menú fijo del chat, según el cargo: quien va a obra ve además acta, fotos y pendientes.
function menuDe(u) {
  const k = [[{ text: "📋 Mis tareas" }, { text: "🔔 Avisos" }], [{ text: "🟢 Mi estado" }, { text: "❓ Ayuda" }]];
  if (u && obra.puedeObra(u)) k.unshift([{ text: "📝 Acta de obra" }, { text: "📷 Fotos de obra" }, { text: "📌 Pendiente" }]);
  return { keyboard: k, resize_keyboard: true, is_persistent: true };
}
// Botones del menú y comandos escritos. Solo coinciden exactos, para no confundirlos con lo que se escribe en un acta.
const COMANDOS = {
  "📋 mis tareas": "tareas", "/tareas": "tareas", "mis tareas": "tareas", "tareas": "tareas",
  "🔔 avisos": "avisos", "/avisos": "avisos", "avisos": "avisos",
  "🟢 mi estado": "estado", "/estado": "estado", "mi estado": "estado", "estado": "estado",
  "❓ ayuda": "ayuda", "/ayuda": "ayuda", "/help": "ayuda", "ayuda": "ayuda", "/start": "ayuda", "menu": "ayuda", "menú": "ayuda",
  "📝 acta de obra": "acta", "/acta": "acta", "📷 fotos de obra": "fotos", "/fotos": "fotos", "📌 pendiente": "pendiente", "/pendiente": "pendiente",
  "/cancelar": "cancelar", "cancelar": "cancelar",
};
const ESTADOS = [
  ["disponible", "🟢 Disponible"], ["no_molestar", "🔴 No molestar"], ["reunion", "🟣 En reunión"],
  ["almuerzo", "🟠 Almuerzo"], ["pausa", "🔵 En pausa"], ["obra", "🏗 En obra"], ["fuera", "⚪ Fuera"],
];
const STATUS = { pendiente: "Por hacer", en_curso: "En curso", revision: "En revisión", terminado: "Entregada" };
const ahoraPB = () => new Date().toISOString().replace("T", " ");

/* ---------- configuración ---------- */
function config(app) {
  try { return app.findFirstRecordByFilter("bot_config", "id != ''"); } catch (e) { /* sin fila */ }
  const r = new Record(app.findCollectionByNameOrId("bot_config"));
  r.set("offset", 0);
  app.save(r);
  return r;
}

/* ---------- vínculo ---------- */
function vinculoDeChat(app, chatId) {
  try { return app.findFirstRecordByFilter("telegram", "chatId = {:c}", { c: String(chatId) }); } catch (e) { return null; }
}
function vinculoDe(app, userId) {
  try { return app.findFirstRecordByFilter("telegram", "user = {:u}", { u: userId }); } catch (e) { return null; }
}
function nuevoCodigo(app, userId) {
  let v = vinculoDe(app, userId);
  if (!v) { v = new Record(app.findCollectionByNameOrId("telegram")); v.set("user", userId); v.set("avisos", "fuera"); }
  const codigo = $security.randomStringWithAlphabet(8, ALFABETO);
  v.set("codigo", codigo);
  v.set("codigoVence", new Date(Date.now() + 30 * 60e3).toISOString());
  app.save(v);
  return codigo;
}
function vincular(app, token, msg, codigo) {
  const chatId = String(msg.chat.id);
  let v = null;
  try { v = app.findFirstRecordByFilter("telegram", "codigo = {:c}", { c: String(codigo || "").toUpperCase().trim() }); } catch (e) { /* no existe */ }
  if (!v || !v.getString("codigo") || Date.parse(v.getString("codigoVence")) < Date.now()) {
    enviar(token, chatId, "Ese código no sirve o ya venció. Abre LAP Cerebro → tu perfil → <b>Vincular Telegram</b> y vuelve a intentarlo.");
    return;
  }
  // Un chat solo puede estar con una persona.
  const otro = vinculoDeChat(app, chatId);
  if (otro && otro.id !== v.id) app.delete(otro);
  v.set("chatId", chatId);
  v.set("username", (msg.from && (msg.from.username || msg.from.first_name)) || "");
  v.set("codigo", "");
  v.set("codigoVence", "");
  if (!v.getString("avisos")) v.set("avisos", "fuera");
  app.save(v);
  const u = app.findRecordById("users", v.getString("user"));
  enviar(token, chatId, "¡Listo, " + esc(lib.primerNombre(u)) + "! Tu Telegram quedó vinculado a <b>LAP Cerebro</b>.\n\n" + ayuda(u), { reply_markup: menuDe(u) });
}

function ayuda(u) {
  return "Desde aquí puedes:\n" +
    "📋 <b>Mis tareas</b>: ver tus tareas, marcar en cuál estás trabajando y entregarlas.\n" +
    "🟢 <b>Mi estado</b>: disponible, en reunión, en obra, fuera…\n" +
    "🔔 <b>Avisos</b>: te llegan aquí cuando no estás en el computador, y puedes responder cuando te tocan el hombro.\n" +
    (u && obra.puedeObra(u)
      ? "📝 <b>Acta de obra</b>: te pregunto paso a paso (clima, asistentes, avance, temas, compromisos y fotos) y queda como borrador en Cerebro.\n" +
        "📷 <b>Fotos de obra</b>: fotos con su descripción, a la pestaña Obra del proyecto.\n" +
        "📌 <b>Pendiente</b>: lo que falta en obra se vuelve una tarea para quien dirige el proyecto.\n" +
        "Escribe <b>cancelar</b> para dejar lo que estés haciendo."
      : "");
}

/* ---------- tareas ---------- */
function misTareas(app, uid) {
  const ts = lib.arr(app.findRecordsByFilter("tareas", "status != 'terminado' && assignees ~ {:u}", "due", 50, 0, { u: uid }));
  ts.sort((a, b) => (a.getString("due") || "9999") < (b.getString("due") || "9999") ? -1 : 1);
  return ts.slice(0, 15);
}
function proyectoTxt(app, pid) {
  if (!pid) return "";
  try { const p = app.findRecordById("proyectos", pid); return (p.getString("code") ? p.getString("code") + " · " : "") + p.getString("name"); } catch (e) { return ""; }
}
function cuando(due) {
  if (!due) return "";
  const h = lib.hoy(0), m = lib.hoy(1);
  if (due < h) return "⚠ atrasada (" + lib.fechaCorta(due) + ")";
  if (due === h) return "vence hoy";
  if (due === m) return "vence mañana";
  return "para el " + lib.fechaCorta(due);
}
function listaTareas(app, u) {
  const ts = misTareas(app, u.id);
  if (!ts.length) return { text: "No tienes tareas abiertas. 🎉", botones: [] };
  const trabajo = u.getString("taskId");
  const botones = ts.map((t) => {
    const icono = t.id === trabajo ? "⚙ " : t.getString("due") && t.getString("due") < lib.hoy(0) ? "⚠ " : "";
    return [{ text: icono + corto(t.getString("title"), 48), callback_data: "tv:" + t.id }];
  });
  return { text: "📋 <b>Tus tareas</b> (" + ts.length + ")\nToca una para trabajar en ella o entregarla." + (trabajo ? "\n⚙ = en la que estás trabajando." : ""), botones };
}
function detalleTarea(app, u, t) {
  const trabajando = u.getString("taskId") === t.id;
  const lineas = ["<b>" + esc(t.getString("title")) + "</b>"];
  const p = proyectoTxt(app, t.getString("project"));
  if (p) lineas.push("📁 " + esc(p));
  lineas.push("Estado: " + (STATUS[t.getString("status")] || t.getString("status")) + (t.getString("due") ? " · " + cuando(t.getString("due")) : ""));
  if (trabajando) lineas.push("⚙ Estás trabajando en esta.");
  const botones = [];
  if (t.getString("status") !== "terminado") {
    botones.push([trabajando ? { text: "⏸ Dejar de trabajar en esto", callback_data: "td:" + t.id } : { text: "▶ Estoy trabajando en esto", callback_data: "ti:" + t.id }]);
    botones.push([{ text: "✅ Entregar", callback_data: "te:" + t.id }]);
  }
  botones.push([{ text: "← Mis tareas", callback_data: "tl" }]);
  return { text: lineas.join("\n"), botones };
}
// Solo quien tiene la tarea asignada (o Dirección) la puede mover desde Telegram.
function tareaPermitida(app, u, id) {
  let t;
  try { t = app.findRecordById("tareas", id); } catch (e) { return null; }
  if (lib.arr(t.getStringSlice("assignees")).indexOf(u.id) < 0 && !lib.esDirector(u)) return null;
  return t;
}
function iniciar(app, u, t) {
  u.set("taskId", t.id);
  u.set("since", new Date().toISOString());
  app.save(u);
  if (t.getString("status") === "pendiente") { t.set("status", "en_curso"); t.set("updatedBy", u.id); app.save(t); }
  lib.registrar(app, u.id, "working", t.getString("title"), t.id, t.getString("project"));
}
function dejar(app, u) {
  u.set("taskId", "");
  u.set("since", "");
  app.save(u);
}
function entregar(app, u, t) {
  t.set("status", "terminado");
  t.set("progress", 100);
  t.set("doneAt", lib.hoy(0));
  t.set("stage", "");
  t.set("updatedBy", u.id);
  app.save(t);
  if (u.getString("taskId") === t.id) dejar(app, u);
  lib.registrar(app, u.id, "done", t.getString("title"), t.id, t.getString("project"), "terminado");
}

/* ---------- estado ---------- */
function estadoActual(u) {
  if (u.getString("presencia") === "fuera" && u.getString("estado") === "En obra") return "obra";
  return u.getString("presencia") || "disponible";
}
function menuEstado(u) {
  const cur = estadoActual(u);
  const nombre = (ESTADOS.find((x) => x[0] === cur) || ESTADOS[0])[1];
  const botones = [];
  for (let i = 0; i < ESTADOS.length; i += 2) botones.push(ESTADOS.slice(i, i + 2).map((x) => ({ text: (x[0] === cur ? "✓ " : "") + x[1], callback_data: "p:" + x[0] })));
  return { text: "Tu estado ahora: <b>" + nombre + "</b>\n¿Cuál quieres poner?", botones };
}
function ponerEstado(app, u, valor) {
  const obra = valor === "obra";
  const pres = obra ? "fuera" : valor;
  u.set("presencia", pres);
  u.set("presenciaRef", "");
  u.set("pos", null);
  u.set("puesto", pres === "disponible" || pres === "no_molestar");
  if (obra) u.set("estado", "En obra");
  else if (u.getString("estado") === "En obra") u.set("estado", "");
  app.save(u);
}

/* ---------- avisos ---------- */
function avisosPendientes(app, uid) {
  return lib.arr(app.findRecordsByFilter("notificaciones", "user = {:u} && read = false", "-created", 8, 0, { u: uid }));
}
function textoAviso(n) {
  return (n.getBool("urgente") ? "❗ " : "🔔 ") + "<b>" + esc(n.getString("title")) + "</b>" + (n.getString("body") ? "\n" + esc(n.getString("body")) : "");
}
function botonesAviso(n) {
  if (n.getString("kind") === "toque" && n.getString("de") && !n.getString("respuesta")) {
    return [[{ text: "Voy", callback_data: "tq:" + n.id + ":voy" }, { text: "En 10 min", callback_data: "tq:" + n.id + ":10" }, { text: "Ahora no", callback_data: "tq:" + n.id + ":no" }]];
  }
  return [];
}
// ¿La persona está frente al computador con la app abierta? (latido en los últimos 3 minutos)
function enElPC(u) {
  const ls = Date.parse(String(u.getString("lastSeen") || "").replace(" ", "T"));
  return !!ls && Date.now() - ls < 180e3 && u.getString("presencia") !== "fuera";
}
// Manda a Telegram los avisos nuevos de quienes tienen el bot vinculado.
function enviarAvisos(app, cfg) {
  const token = cfg.getString("token");
  let desde = cfg.getString("lastNotif");
  if (!desde) { cfg.set("lastNotif", ahoraPB()); app.save(cfg); return; }
  const ns = lib.arr(app.findRecordsByFilter("notificaciones", "created > {:t}", "created", 50, 0, { t: desde }));
  if (!ns.length) return;
  const cache = {};
  for (const n of ns) {
    desde = n.getString("created");
    const uid = n.getString("user");
    if (!(uid in cache)) cache[uid] = vinculoDe(app, uid);
    const v = cache[uid];
    if (!v || !v.getString("chatId") || n.getBool("read")) continue;
    const modo = v.getString("avisos") || "fuera";
    if (modo === "nunca") continue;
    let u;
    try { u = app.findRecordById("users", uid); } catch (e) { continue; }
    if (modo === "fuera" && enElPC(u)) continue;
    const silencio = u.getString("presencia") === "no_molestar" && !n.getBool("urgente");
    const botones = botonesAviso(n);
    enviar(token, v.getString("chatId"), textoAviso(n), Object.assign({ disable_notification: silencio }, botones.length ? { reply_markup: { inline_keyboard: botones } } : {}));
  }
  cfg.set("lastNotif", desde);
  app.save(cfg);
}
const RESPUESTAS = { voy: " va para allá", "10": " te busca en 10 minutos", no: " ahora no puede" };
function responderToque(app, u, notifId, r) {
  if (!RESPUESTAS[r]) return "Respuesta no válida.";
  let n;
  try { n = app.findRecordById("notificaciones", notifId); } catch (e) { return "Ese aviso ya no existe."; }
  if (n.getString("user") !== u.id || n.getString("kind") !== "toque" || !n.getString("de")) return "Ese aviso no es tuyo.";
  if (n.getString("respuesta")) return "Ya habías respondido.";
  n.set("respuesta", r);
  n.set("read", true);
  app.save(n);
  lib.notificar(app, n.getString("de"), "toque_resp", lib.primerNombre(u) + RESPUESTAS[r], n.getString("body"), "#oficina", { de: u.id, urgente: lib.esDirector(u) });
  return r === "voy" ? "Le avisaste que vas." : r === "10" ? "Le avisaste que vas en 10 minutos." : "Le avisaste que ahora no puedes.";
}

/* ---------- mensajes y botones ---------- */
function persona(app, v) {
  try { return app.findRecordById("users", v.getString("user")); } catch (e) { return null; }
}
function onMensaje(app, token, msg) {
  if (!msg || !msg.chat || msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);
  const text = String(msg.text || "").trim();
  const v = vinculoDeChat(app, chatId);
  // "/start CÓDIGO" (desde el enlace) o, si el chat aún no está vinculado, el código solo.
  const m = /^\/(?:start|vincular)\s+([A-Za-z0-9]{6,12})$/.exec(text) || (!v && /^([A-HJ-NP-Z2-9]{8})$/.exec(text.toUpperCase()));
  if (m) return vincular(app, token, msg, m[1]);
  const u = v && persona(app, v);
  if (!u) {
    enviar(token, chatId, "Hola 👋 Soy el bot de <b>LAP Cerebro</b>.\nPara usarme, abre la app → tu perfil → <b>Vincular Telegram</b>.", { reply_markup: { remove_keyboard: true } });
    return;
  }
  const cmd = COMANDOS[text.toLowerCase()];
  if (cmd === "cancelar") return obra.cancelar(app, token, chatId, v);
  if (!cmd && obra.onFlujo(app, token, chatId, u, v, msg)) return;
  if (cmd === "tareas") { const l = listaTareas(app, u); return enviar(token, chatId, l.text, { reply_markup: { inline_keyboard: l.botones } }); }
  if (cmd === "estado") { const e = menuEstado(u); return enviar(token, chatId, e.text, { reply_markup: { inline_keyboard: e.botones } }); }
  if (cmd === "acta" || cmd === "fotos" || cmd === "pendiente") return obra.elegirProyecto(app, token, chatId, u, cmd === "acta" ? "a" : cmd === "fotos" ? "f" : "p");
  if (cmd === "avisos") {
    const ns = avisosPendientes(app, u.id);
    if (!ns.length) return enviar(token, chatId, "No tienes avisos sin leer. ✅");
    for (const n of ns.slice().reverse()) { const b = botonesAviso(n); enviar(token, chatId, textoAviso(n), b.length ? { reply_markup: { inline_keyboard: b } } : {}); }
    return enviar(token, chatId, "Son tus " + ns.length + " avisos sin leer más recientes.", { reply_markup: { inline_keyboard: [[{ text: "Marcar todos como leídos", callback_data: "nr" }]] } });
  }
  if (!cmd && api.fotoDe(msg)) return enviar(token, chatId, obra.puedeObra(u) ? "¿A dónde va la foto? Elige primero 📝 Acta de obra, 📷 Fotos de obra o 📌 Pendiente, y vuelve a mandarla." : "Por ahora las fotos se suben desde el acta o las fotos de obra.", { reply_markup: menuDe(u) });
  return enviar(token, chatId, ayuda(u), { reply_markup: menuDe(u) });
}
function onBoton(app, token, cq) {
  const chatId = String(cq.message && cq.message.chat ? cq.message.chat.id : "");
  const mid = cq.message ? cq.message.message_id : 0;
  const data = String(cq.data || "");
  let aviso = "";
  const v = vinculoDeChat(app, chatId);
  const u = v && persona(app, v);
  if (!u) { try { tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Primero vincula tu cuenta desde tu perfil en LAP Cerebro." }); } catch (e) { /* nada */ } return; }
  const [k, id, extra] = data.split(":");
  const deObra = obra.onBoton(app, token, chatId, mid, u, v, k, id, extra);
  if (deObra !== null) { try { tg(token, "answerCallbackQuery", Object.assign({ callback_query_id: cq.id }, deObra ? { text: deObra } : {})); } catch (e) { /* nada */ } return; }
  if (k === "tl") { const l = listaTareas(app, u); editar(token, chatId, mid, l.text, l.botones); }
  else if (k === "tv" || k === "ti" || k === "td" || k === "te" || k === "tc") {
    const t = tareaPermitida(app, u, id);
    if (!t) aviso = "No encontré esa tarea o ya no está asignada a ti.";
    else if (k === "ti") { iniciar(app, u, t); aviso = "Trabajando en: " + corto(t.getString("title"), 60); const d = detalleTarea(app, u, t); editar(token, chatId, mid, d.text, d.botones); }
    else if (k === "td") { dejar(app, u); aviso = "Listo"; const d = detalleTarea(app, u, t); editar(token, chatId, mid, d.text, d.botones); }
    else if (k === "te") {
      editar(token, chatId, mid, "¿Entregar <b>" + esc(t.getString("title")) + "</b>?", [[{ text: "✅ Sí, entregar", callback_data: "tc:" + t.id }, { text: "Cancelar", callback_data: "tv:" + t.id }]]);
    } else if (k === "tc") {
      if (t.getString("status") !== "terminado") entregar(app, u, t);
      aviso = "¡Entregada! 🎉";
      editar(token, chatId, mid, "✅ Entregaste <b>" + esc(t.getString("title")) + "</b>.", [[{ text: "← Mis tareas", callback_data: "tl" }]]);
    } else { const d = detalleTarea(app, u, t); editar(token, chatId, mid, d.text, d.botones); }
  } else if (k === "p") {
    if (!ESTADOS.some((x) => x[0] === id)) aviso = "Estado no válido.";
    else { ponerEstado(app, u, id); const e = menuEstado(u); editar(token, chatId, mid, e.text, e.botones); aviso = "Estado actualizado"; }
  } else if (k === "tq") {
    aviso = responderToque(app, u, id, extra);
    editar(token, chatId, mid, (cq.message.text ? esc(cq.message.text) : "Aviso") + "\n\n<i>" + esc(aviso) + "</i>", []);
  } else if (k === "nr") {
    for (const n of lib.arr(app.findRecordsByFilter("notificaciones", "user = {:u} && read = false", "", 500, 0, { u: u.id }))) { n.set("read", true); app.save(n); }
    editar(token, chatId, mid, "Todos tus avisos quedaron leídos. ✅", []);
  }
  try { tg(token, "answerCallbackQuery", Object.assign({ callback_query_id: cq.id }, aviso ? { text: aviso } : {})); } catch (e) { /* nada */ }
}

/* ---------- ciclo ---------- */
// Corre cada minuto (cron) y se queda ~50 s preguntando a Telegram por mensajes nuevos.
function ciclo(app, segundos) {
  const st = app.store();
  const lock = st.get("tg_lock") || 0;
  if (Date.now() - lock < 75000) return;
  st.set("tg_lock", Date.now());
  const fin = Date.now() + (segundos || 50) * 1000;
  try {
    while (Date.now() < fin) {
      const cfg = config(app);
      const token = cfg.getString("token");
      if (!token) break;
      try { enviarAvisos(app, cfg); } catch (e) { console.log("telegram avisos:", e.message); }
      let ups = [];
      try {
        ups = tg(token, "getUpdates", { offset: cfg.getInt("offset"), timeout: 8, allowed_updates: ["message", "callback_query"] }, 20) || [];
        if (cfg.getString("error")) { cfg.set("error", ""); app.save(cfg); }
      } catch (e) {
        cfg.set("error", corto(e.message, 280));
        app.save(cfg);
        if (e.code === 401 || e.code === 404 || e.code === 409) break; // clave mala u otro programa usando el bot
        continue;
      }
      for (const up of ups) {
        try {
          if (up.message) onMensaje(app, token, up.message);
          else if (up.callback_query) onBoton(app, token, up.callback_query);
        } catch (e) { console.log("telegram mensaje:", e.message); }
        cfg.set("offset", up.update_id + 1);
        app.save(cfg);
      }
    }
  } finally { st.set("tg_lock", 0); }
}

/* ---------- rutas de la app ---------- */
function estado(e) {
  const cfg = config(e.app);
  const v = vinculoDe(e.app, e.auth.id);
  const out = { configurado: !!cfg.getString("token"), botUser: cfg.getString("botUser"), vinculado: !!(v && v.getString("chatId")), username: v ? v.getString("username") : "", avisos: (v && v.getString("avisos")) || "fuera" };
  if (lib.esDirector(e.auth)) out.error = cfg.getString("error");
  return e.json(200, out);
}
function guardarConfig(e) {
  if (!lib.esDirector(e.auth)) throw new ForbiddenError("Solo Dirección conecta el bot de Telegram.");
  const token = String((e.requestInfo().body || {}).token || "").trim();
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new BadRequestError("Esa no parece una clave de bot. Cópiala completa del mensaje de @BotFather (números, dos puntos y letras).");
  let me;
  try { me = tg(token, "getMe", {}, 15); } catch (err) { throw new BadRequestError("Telegram no aceptó esa clave (" + err.message + "). Revisa que esté completa."); }
  try { tg(token, "deleteWebhook", {}, 15); } catch (err) { /* no tenía */ }
  const cfg = config(e.app);
  cfg.set("token", token);
  cfg.set("botUser", me.username || "");
  cfg.set("offset", 0);
  cfg.set("lastNotif", ahoraPB());
  cfg.set("error", "");
  e.app.save(cfg);
  return e.json(200, { ok: true, botUser: me.username || "" });
}
function quitarConfig(e) {
  if (!lib.esDirector(e.auth)) throw new ForbiddenError("Solo Dirección desconecta el bot.");
  const cfg = config(e.app);
  cfg.set("token", ""); cfg.set("botUser", ""); cfg.set("error", "");
  e.app.save(cfg);
  return e.json(200, { ok: true });
}
function codigo(e) {
  const cfg = config(e.app);
  if (!cfg.getString("token")) throw new BadRequestError("Dirección todavía no ha conectado el bot de Telegram.");
  const c = nuevoCodigo(e.app, e.auth.id);
  const bot = cfg.getString("botUser");
  return e.json(200, { codigo: c, botUser: bot, link: bot ? "https://t.me/" + bot + "?start=" + c : "" });
}
function ponerAvisos(e) {
  const modo = String((e.requestInfo().body || {}).avisos || "");
  if (["siempre", "fuera", "nunca"].indexOf(modo) < 0) throw new BadRequestError("Opción no válida.");
  const v = vinculoDe(e.app, e.auth.id);
  if (!v) throw new BadRequestError("Primero vincula tu Telegram.");
  v.set("avisos", modo);
  e.app.save(v);
  return e.json(200, { ok: true });
}
function desvincular(e) {
  const v = vinculoDe(e.app, e.auth.id);
  if (v) {
    const cfg = config(e.app);
    if (cfg.getString("token") && v.getString("chatId")) enviar(cfg.getString("token"), v.getString("chatId"), "Desvinculaste tu Telegram de LAP Cerebro. Ya no te llegarán avisos por aquí.", { reply_markup: { remove_keyboard: true } });
    e.app.delete(v);
  }
  return e.json(200, { ok: true });
}

module.exports = { ciclo, estado, guardarConfig, quitarConfig, codigo, ponerAvisos, desvincular, tg };
