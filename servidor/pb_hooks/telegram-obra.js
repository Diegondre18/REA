// Bot de Telegram, etapa 2 (Arquitectura, Diseño Interior y Dirección): acta de obra guiada, fotos de
// obra y pendientes de obra que se vuelven tareas. Lo que la persona está haciendo se guarda en
// telegram.flujo y vence a las 3 horas sin movimiento.
const lib = require(`${__hooks}/lib.js`);
const { esc, corto, enviar, editar, descargar, fotoDe } = require(`${__hooks}/telegram-api.js`);

const VENCE = 3 * 3600e3;
const PASOS = ["clima", "asistentes", "avance", "temas", "compromisos", "fotos"];
const SIG = [{ text: "Siguiente ➡", callback_data: "an" }, { text: "✅ Terminar acta", callback_data: "af" }];

function puedeObra(u) {
  const a = lib.arr(u.getStringSlice("areas"));
  return lib.esDirector(u) || a.indexOf("arquitectura") >= 0 || a.indexOf("interior") >= 0;
}
function proyectosDe(app, u) {
  const f = lib.esDirector(u) ? "status != 'cerrado'" : "status != 'cerrado' && (leader = {:u} || apoyo = {:u} || members ~ {:u})";
  return lib.arr(app.findRecordsByFilter("proyectos", f, "name", 30, 0, { u: u.id }));
}
const nombreP = (p) => (p.getString("code") ? p.getString("code") + " · " : "") + p.getString("name");
const horaBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(11, 16);
const json = (rec, k, def) => { try { const v = JSON.parse(rec.getString(k) || "null"); return v == null ? def : v; } catch (e) { return def; } };

/* ---------- lo que la persona está haciendo ---------- */
function flujo(v) {
  const f = json(v, "flujo", null);
  return f && Date.now() - (f.ts || 0) < VENCE ? f : null;
}
function ponerFlujo(app, v, f) {
  v.set("flujo", f ? Object.assign({}, f, { ts: Date.now() }) : null);
  app.save(v);
}

/* ---------- elegir proyecto ---------- */
const TITULOS = { a: "📝 <b>Acta de obra</b>\n¿De qué proyecto?", f: "📷 <b>Fotos de obra</b>\n¿De qué proyecto?", p: "📌 <b>Pendiente de obra</b>\n¿De qué proyecto?" };
function elegirProyecto(app, token, chatId, u, tipo) {
  if (!puedeObra(u)) return enviar(token, chatId, "Esto es para Arquitectura, Diseño Interior y Dirección.");
  const ps = proyectosDe(app, u);
  if (!ps.length) return enviar(token, chatId, "No estás en ningún proyecto activo. Pídele a quien lo dirige que te sume.");
  const botones = ps.map((p) => [{ text: corto(nombreP(p), 50), callback_data: "op:" + tipo + ":" + p.id }]);
  enviar(token, chatId, TITULOS[tipo], { reply_markup: { inline_keyboard: botones } });
}
function proyectoPermitido(app, u, pid) {
  try {
    const p = app.findRecordById("proyectos", pid);
    if (lib.esDirector(u)) return p;
    const ok = p.getString("leader") === u.id || p.getString("apoyo") === u.id || lib.arr(p.getStringSlice("members")).indexOf(u.id) >= 0;
    return ok ? p : null;
  } catch (e) { return null; }
}

/* ---------- acta guiada ---------- */
function empezar(app, token, chatId, u, v, tipo, p, mid) {
  if (tipo === "f") {
    ponerFlujo(app, v, { tipo: "fotos", proyecto: p.id, n: 0 });
    return editar(token, chatId, mid, "📷 <b>Fotos de obra · " + esc(nombreP(p)) + "</b>\nManda las fotos; a cada una ponle su descripción en el pie de foto. Quedan en la pestaña Obra del proyecto.", [[{ text: "✅ Listo", callback_data: "fl" }]]);
  }
  if (tipo === "p") {
    ponerFlujo(app, v, { tipo: "pendiente", proyecto: p.id, n: 0 });
    return editar(token, chatId, mid, "📌 <b>Pendiente de obra · " + esc(nombreP(p)) + "</b>\nEscribe el pendiente (por ejemplo: <i>Falta pañete en el muro de la cocina</i>). Puedes mandar una foto con el texto en el pie de foto. Cada pendiente se vuelve una tarea para quien dirige el proyecto.", [[{ text: "✅ Listo", callback_data: "fl" }]]);
  }
  // Acta: si ya hay un borrador de hoy hecho por la misma persona, se sigue ese.
  const hoy = lib.hoy(0);
  let acta = null;
  const prev = app.findRecordsByFilter("actas", "proyecto = {:p} && by = {:u} && estado = 'borrador' && fecha = {:f}", "-numero", 1, 0, { p: p.id, u: u.id, f: hoy });
  if (prev.length) acta = prev[0];
  else {
    const last = app.findRecordsByFilter("actas", "proyecto = {:p}", "-numero", 1, 0, { p: p.id });
    const anterior = last.length ? last[0] : null;
    acta = new Record(app.findCollectionByNameOrId("actas"));
    acta.set("proyecto", p.id);
    acta.set("numero", anterior ? anterior.getInt("numero") + 1 : 1);
    acta.set("fecha", hoy);
    acta.set("hora", horaBogota());
    acta.set("lugar", anterior ? anterior.getString("lugar") : "");
    acta.set("equipo", [u.id]);
    acta.set("asistentes", []);
    acta.set("compromisos", []);
    acta.set("fotosNotas", {});
    acta.set("firmas", []);
    acta.set("avance", anterior ? anterior.getInt("avance") : 0);
    acta.set("estado", "borrador");
    acta.set("by", u.id);
    app.save(acta);
    lib.registrar(app, u.id, "create", "Acta #" + acta.getInt("numero") + " (desde Telegram)", acta.id, p.id);
  }
  ponerFlujo(app, v, { tipo: "acta", acta: acta.id, proyecto: p.id, paso: "clima" });
  editar(token, chatId, mid, "📝 <b>Acta #" + acta.getInt("numero") + " · " + esc(nombreP(p)) + "</b>" + (prev.length ? "\nSigues con el acta que empezaste hoy." : "\nVamos por partes. Puedes saltar lo que no aplique y terminar cuando quieras."), []);
  preguntar(token, chatId, "clima");
}
function preguntar(token, chatId, paso) {
  if (paso === "clima") return enviar(token, chatId, "🌤 ¿Cómo está el clima?", { reply_markup: { inline_keyboard: [[{ text: "☀️ Soleado", callback_data: "ac:Soleado" }, { text: "⛅ Nublado", callback_data: "ac:Nublado" }, { text: "🌧 Lluvia", callback_data: "ac:Lluvia" }], [{ text: "Saltar ➡", callback_data: "an" }]] } });
  if (paso === "asistentes") return enviar(token, chatId, "👥 <b>¿Quiénes asistieron?</b>\nUno por línea: <i>Nombre - cargo - empresa</i>. Puedes mandar varios mensajes.", { reply_markup: { inline_keyboard: [SIG] } });
  if (paso === "avance") {
    const fila = (a, b) => { const r = []; for (let n = a; n <= b; n += 10) r.push({ text: n + "%", callback_data: "av:" + n }); return r; };
    return enviar(token, chatId, "📈 <b>¿Avance de la obra?</b>", { reply_markup: { inline_keyboard: [fila(0, 50), fila(60, 100), [{ text: "Saltar ➡", callback_data: "an" }]] } });
  }
  if (paso === "temas") return enviar(token, chatId, "🗒 <b>¿Qué se revisó?</b>\nEscribe los temas y lo que se vio, en uno o varios mensajes.", { reply_markup: { inline_keyboard: [SIG] } });
  if (paso === "compromisos") return enviar(token, chatId, "🤝 <b>Compromisos</b>\nUno por línea: <i>Qué - responsable - fecha</i>\nEj.: <i>Entregar muestras de enchape - Constructora XYZ - 25/11</i>\nSi el responsable es alguien del estudio, se le crea la tarea.", { reply_markup: { inline_keyboard: [SIG] } });
  if (paso === "fotos") return enviar(token, chatId, "📷 <b>Fotos</b>\nManda las fotos con su descripción en el pie de foto. Lo que escribas sin foto queda en observaciones.", { reply_markup: { inline_keyboard: [[{ text: "✅ Terminar acta", callback_data: "af" }]] } });
}
function siguiente(app, token, chatId, v, f) {
  const i = PASOS.indexOf(f.paso);
  if (i < 0 || i >= PASOS.length - 1) return terminar(app, token, chatId, v, f);
  f.paso = PASOS[i + 1];
  ponerFlujo(app, v, f);
  preguntar(token, chatId, f.paso);
}
function actaDe(app, f) { try { return app.findRecordById("actas", f.acta); } catch (e) { return null; } }
function terminar(app, token, chatId, v, f) {
  ponerFlujo(app, v, null);
  const a = f && actaDe(app, f);
  if (!a) return enviar(token, chatId, "Listo.");
  let p = null;
  try { p = app.findRecordById("proyectos", a.getString("proyecto")); } catch (e) { /* nada */ }
  const tareas = app.findRecordsByFilter("tareas", "origen = {:o}", "", 100, 0, { o: "acta:" + a.id }).length;
  const partes = [
    json(a, "asistentes", []).length + " asistentes",
    (a.getString("temas") ? a.getString("temas").split("\n").filter((x) => x.trim()).length : 0) + " temas",
    (json(a, "compromisos", []).length + tareas) + " compromisos",
    lib.arr(a.getStringSlice("fotos")).length + " fotos",
  ];
  enviar(token, chatId, "✅ <b>Acta #" + a.getInt("numero") + (p ? " · " + esc(nombreP(p)) : "") + "</b> guardada como borrador: " + partes.join(", ") + ".\n\nÁbrela en Cerebro (proyecto → pestaña Obra) para revisarla, recoger las firmas y descargar el PDF.");
}

// Responsable del estudio por nombre o primer nombre (sin tildes ni mayúsculas); solo si hay uno.
const plano = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
function personaPorNombre(app, txt) {
  const t = plano(txt);
  if (!t) return null;
  const gente = lib.arr(app.findRecordsByFilter("users", "role != 'pantalla'", "", 500, 0));
  const exactos = gente.filter((g) => plano(g.getString("name")) === t);
  if (exactos.length === 1) return exactos[0];
  const primeros = gente.filter((g) => plano(g.getString("name")).split(" ")[0] === t.split(" ")[0]);
  return primeros.length === 1 && t.split(" ").length === 1 ? primeros[0] : null;
}
// "25/11", "25/11/2026", "2026-11-25"; si no hay fecha, en una semana.
function fechaDe(txt) {
  const s = String(txt || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s);
  if (m) {
    const hoy = lib.hoy(0);
    let y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : hoy.slice(0, 4);
    let iso = y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    if (!m[3] && iso < hoy) iso = (Number(y) + 1) + iso.slice(4);
    return iso;
  }
  return lib.hoy(7);
}
function crearTarea(app, u, pid, titulo, para, origen, nota) {
  const t = new Record(app.findCollectionByNameOrId("tareas"));
  t.set("title", corto(titulo, 300));
  t.set("project", pid);
  t.set("status", "pendiente");
  t.set("progress", 0);
  t.set("assignees", [para]);
  t.set("start", lib.hoy(0));
  t.set("due", nota && nota.due ? nota.due : lib.hoy(7));
  t.set("origen", origen);
  t.set("updatedBy", u.id);
  app.save(t);
  lib.registrar(app, u.id, "create", t.getString("title"), t.id, pid);
  if (para !== u.id) lib.notificar(app, para, "tarea", "Nueva tarea: " + corto(titulo, 150), lib.nombreCompleto(u) + " la anotó en obra, para el " + lib.fechaCorta(t.getString("due")) + ".", "#tarea/" + t.id, { de: u.id });
  return t;
}

function textoActa(app, token, chatId, u, v, f, text) {
  const a = actaDe(app, f);
  if (!a) { ponerFlujo(app, v, null); return enviar(token, chatId, "No encontré el acta. Empieza otra desde el menú."); }
  if (a.getString("estado") === "cerrada") { ponerFlujo(app, v, null); return enviar(token, chatId, "Esa acta ya está cerrada; no se puede cambiar."); }
  const lineas = text.split("\n").map((x) => x.trim()).filter(Boolean);
  if (f.paso === "clima") { a.set("clima", corto(text, 60)); app.save(a); return siguiente(app, token, chatId, v, f); }
  if (f.paso === "avance") {
    const n = parseInt(text, 10);
    if (isNaN(n) || n < 0 || n > 100) return enviar(token, chatId, "Escribe un número de 0 a 100, o toca un botón.");
    a.set("avance", n); app.save(a); return siguiente(app, token, chatId, v, f);
  }
  if (f.paso === "asistentes") {
    const lista = json(a, "asistentes", []);
    for (const l of lineas) { const p = l.split(/\s+[-–]\s+|\s*,\s*/); lista.push({ nombre: corto(p[0], 120), rol: corto(p[1] || "", 120), empresa: corto(p[2] || "", 120) }); }
    a.set("asistentes", lista); app.save(a);
    return enviar(token, chatId, "✓ Van " + lista.length + " asistentes. Escribe más o sigue.", { reply_markup: { inline_keyboard: [SIG] } });
  }
  if (f.paso === "temas") {
    const prev = a.getString("temas");
    a.set("temas", corto((prev ? prev + "\n" : "") + lineas.map((l) => (/^[-•*]/.test(l) ? l : "- " + l)).join("\n"), 20000)); app.save(a);
    return enviar(token, chatId, "✓ Anotado. Escribe más o sigue.", { reply_markup: { inline_keyboard: [SIG] } });
  }
  if (f.paso === "compromisos") {
    const comps = json(a, "compromisos", []);
    const hechos = [];
    for (const l of lineas) {
      const p = l.split(/\s+[-–]\s+/);
      const texto = corto(p[0], 500), resp = (p[1] || "").trim(), fecha = fechaDe(p[2]);
      const quien = resp && personaPorNombre(app, resp);
      if (quien) { crearTarea(app, u, a.getString("proyecto"), texto, quien.id, "acta:" + a.id, { due: fecha }); hechos.push("tarea para " + lib.nombreCompleto(quien)); }
      else { comps.push({ id: $security.randomString(8), texto, resp, fecha, hecho: false }); hechos.push(resp ? "a cargo de " + resp : "sin responsable"); }
    }
    a.set("compromisos", comps); app.save(a);
    return enviar(token, chatId, "✓ " + hechos.length + (hechos.length === 1 ? " compromiso" : " compromisos") + " (" + hechos.join(", ") + "). Escribe más o sigue.", { reply_markup: { inline_keyboard: [SIG] } });
  }
  // Paso de fotos: el texto suelto va a observaciones.
  const prev = a.getString("observaciones");
  a.set("observaciones", corto((prev ? prev + "\n" : "") + text, 10000)); app.save(a);
  return enviar(token, chatId, "✓ Anotado en observaciones.", { reply_markup: { inline_keyboard: [[{ text: "✅ Terminar acta", callback_data: "af" }]] } });
}
function fotoActa(app, token, chatId, v, f, msg) {
  const a = actaDe(app, f);
  if (!a || a.getString("estado") === "cerrada") return enviar(token, chatId, "No hay un acta abierta para esa foto.");
  if (lib.arr(a.getStringSlice("fotos")).length >= 40) return enviar(token, chatId, "El acta ya tiene 40 fotos, el máximo.");
  const file = descargar(token, fotoDe(msg), "acta-" + a.getInt("numero"));
  a.set("fotos+", file);
  app.save(a);
  const nombres = lib.arr(a.getStringSlice("fotos"));
  const nota = String(msg.caption || "").trim();
  if (nota) { const notas = json(a, "fotosNotas", {}); notas[nombres[nombres.length - 1]] = corto(nota, 500); a.set("fotosNotas", notas); app.save(a); }
  enviar(token, chatId, "📷 Foto " + nombres.length + " guardada en el acta" + (nota ? "" : " (sin descripción)") + ".", { reply_markup: { inline_keyboard: [f.paso === "fotos" ? [{ text: "✅ Terminar acta", callback_data: "af" }] : SIG] } });
}

/* ---------- fotos sueltas y pendientes ---------- */
function guardarFoto(app, token, u, pid, msg, nota) {
  const r = new Record(app.findCollectionByNameOrId("fotos_obra"));
  r.set("proyecto", pid);
  r.set("foto", descargar(token, fotoDe(msg), "obra"));
  r.set("nota", corto(nota || "", 1000));
  r.set("fecha", lib.hoy(0));
  r.set("by", u.id);
  app.save(r);
  return r;
}
function liderDe(app, pid, u) {
  try { const p = app.findRecordById("proyectos", pid); return p.getString("leader") || p.getString("apoyo") || u.id; } catch (e) { return u.id; }
}
const LISTO = { reply_markup: { inline_keyboard: [[{ text: "✅ Listo", callback_data: "fl" }]] } };

// Mensaje (texto o foto) mientras hay algo en curso. Devuelve true si lo atendió.
function onFlujo(app, token, chatId, u, v, msg) {
  const f = flujo(v);
  if (!f) return false;
  const text = String(msg.text || "").trim();
  const foto = fotoDe(msg);
  if (f.tipo === "acta") {
    if (foto) fotoActa(app, token, chatId, v, f, msg);
    else if (text) textoActa(app, token, chatId, u, v, f, text);
    else return false;
    if (flujo(v)) ponerFlujo(app, v, flujo(v)); // renueva el plazo
    return true;
  }
  if (f.tipo === "fotos") {
    if (foto) { guardarFoto(app, token, u, f.proyecto, msg, msg.caption); f.n = (f.n || 0) + 1; ponerFlujo(app, v, f); enviar(token, chatId, "📷 " + f.n + (f.n === 1 ? " foto guardada." : " fotos guardadas."), LISTO); return true; }
    if (text) { enviar(token, chatId, "Manda la foto con este texto en el pie de foto, o toca Listo.", LISTO); return true; }
    return false;
  }
  if (f.tipo === "pendiente") {
    const nota = foto ? String(msg.caption || "").trim() : text;
    if (foto && !nota) { const r = guardarFoto(app, token, u, f.proyecto, msg, ""); f.foto = r.id; ponerFlujo(app, v, f); enviar(token, chatId, "Guardé la foto. Ahora escribe el pendiente.", LISTO); return true; }
    if (!nota) return false;
    const para = liderDe(app, f.proyecto, u);
    const t = crearTarea(app, u, f.proyecto, nota, para, "obra:telegram");
    if (foto) guardarFoto(app, token, u, f.proyecto, msg, "Pendiente: " + nota);
    else if (f.foto) { try { const r = app.findRecordById("fotos_obra", f.foto); r.set("nota", corto("Pendiente: " + nota, 1000)); app.save(r); } catch (e) { /* nada */ } }
    f.foto = ""; f.n = (f.n || 0) + 1; ponerFlujo(app, v, f);
    let quien = "ti";
    try { quien = para === u.id ? "ti" : lib.nombreCompleto(app.findRecordById("users", para)); } catch (e) { /* nada */ }
    enviar(token, chatId, "📌 Pendiente creado como tarea para <b>" + esc(quien) + "</b>, para el " + lib.fechaCorta(t.getString("due")) + ". ¿Otro? Escríbelo o toca Listo.", LISTO);
    return true;
  }
  return false;
}

// Botones de esta etapa. Devuelve el texto corto para la notificación del botón, o null si no era de aquí.
function onBoton(app, token, chatId, mid, u, v, k, id, extra) {
  if (k === "op") {
    const p = proyectoPermitido(app, u, extra);
    if (!p || !puedeObra(u)) return "No tienes ese proyecto.";
    empezar(app, token, chatId, u, v, id, p, mid);
    return "";
  }
  const f = flujo(v);
  if (k === "fl") {
    const que = { fotos: ["foto en el proyecto", "fotos en el proyecto"], pendiente: ["pendiente como tarea", "pendientes como tareas"], gasto: ["gasto registrado", "gastos registrados"], pago: ["pago registrado", "pagos registrados"] }[f && f.tipo];
    ponerFlujo(app, v, null);
    editar(token, chatId, mid, "✅ Listo." + (f && f.n && que ? (f.n === 1 ? " Quedó 1 " + que[0] + "." : " Quedaron " + f.n + " " + que[1] + ".") : ""), []);
    return "";
  }
  if (!f || f.tipo !== "acta") return k === "an" || k === "af" || k === "ac" || k === "av" ? "Ya no hay un acta en curso." : null;
  if (k === "af") { editar(token, chatId, mid, "Terminando el acta…", []); terminar(app, token, chatId, v, f); return ""; }
  const a = actaDe(app, f);
  if (k === "ac" && a) { a.set("clima", id); app.save(a); editar(token, chatId, mid, "🌤 Clima: <b>" + esc(id) + "</b>", []); siguiente(app, token, chatId, v, f); return ""; }
  if (k === "av" && a) { a.set("avance", Number(id) || 0); app.save(a); editar(token, chatId, mid, "📈 Avance: <b>" + (Number(id) || 0) + "%</b>", []); siguiente(app, token, chatId, v, f); return ""; }
  if (k === "an") { editar(token, chatId, mid, "✓", []); siguiente(app, token, chatId, v, f); return ""; }
  return null;
}
function cancelar(app, token, chatId, v) {
  const f = flujo(v);
  ponerFlujo(app, v, null);
  enviar(token, chatId, f && f.tipo === "acta" ? "Dejé el acta como borrador; la puedes seguir en Cerebro." : "Listo, cancelado.");
}

module.exports = { puedeObra, elegirProyecto, onFlujo, onBoton, flujo, ponerFlujo, cancelar };
