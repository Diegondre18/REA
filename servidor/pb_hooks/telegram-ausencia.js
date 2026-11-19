// Bot de Telegram: "🕔 Me ausento". Para todos. Registra una ausencia de un día, completa o por horas
// ("salgo a las 5", "llego a las 10"), avisa qué entregas propias chocan y deja cancelarla.
const lib = require(`${__hooks}/lib.js`);
const { esc, enviar, editar } = require(`${__hooks}/telegram-api.js`);
const obra = require(`${__hooks}/telegram-obra.js`);

const TIPOS = [["permiso", "Permiso"], ["fuera", "Fuera de la oficina"], ["otro", "Otro"]];
const ESTAS = { permiso: "de permiso", fuera: "fuera de la oficina", otro: "ausente" };
const SALE = ["12:00", "13:00", "15:00", "16:00", "17:00"];
const LLEGA = ["09:00", "10:00", "11:00", "12:00", "14:00"];

// "25/11", "25/11/2026", "2026-11-25" → fecha ISO; si no es una fecha, "".
function fechaDe(txt) {
  const s = String(txt || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s);
  if (!m) return "";
  const hoy = lib.hoy(0);
  const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : hoy.slice(0, 4);
  let iso = y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  if (!m[3] && iso < hoy) iso = (Number(y) + 1) + iso.slice(4);
  const d = new Date(iso + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : ""; // descarta 31/02 y similares
}
// "5pm", "5:30 pm", "17", "17:30", "3 y media" no → "HH:MM" o "".
function horaDe(txt) {
  const s = String(txt || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return "";
  let h = Number(m[1]); const min = Number(m[2] || 0);
  if (m[3] && m[3][0] === "p" && h < 12) h += 12;
  if (m[3] && m[3][0] === "a" && h === 12) h = 0;
  if (!m[3] && h >= 1 && h <= 6) h += 12; // "salgo a las 5" en la oficina es de la tarde
  if (h > 23 || min > 59) return "";
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}
const hora12 = (h) => { if (!h) return ""; const [H, M] = h.split(":").map(Number); return ((H % 12) || 12) + ":" + String(M).padStart(2, "0") + (H < 12 ? " am" : " pm"); };
const diaTxt = (iso) => (iso === lib.hoy(0) ? "hoy" : iso === lib.hoy(1) ? "mañana" : "el " + lib.fechaCorta(iso));

function empezar(app, token, chatId, u, v) {
  obra.ponerFlujo(app, v, { tipo: "ausencia", paso: "dia" });
  enviar(token, chatId, "🕔 <b>Me ausento</b>\n¿Qué día? Toca un botón o escribe la fecha (por ejemplo <i>25/11</i>).", {
    reply_markup: { inline_keyboard: [[{ text: "Hoy", callback_data: "au:d:" + lib.hoy(0) }, { text: "Mañana", callback_data: "au:d:" + lib.hoy(1) }], [{ text: "Cancelar", callback_data: "au:x:" }]] },
  });
}
function preguntarCuanto(token, chatId, f, mid) {
  const txt = "🕔 " + diaTxt(f.dia) + (lib.festivo(f.dia) ? " (festivo: " + lib.festivo(f.dia) + ")" : !lib.esHabil(f.dia) ? " (fin de semana)" : "") + ". ¿Cuánto tiempo?";
  const b = [[{ text: "Todo el día", callback_data: "au:c:todo" }], [{ text: "Salgo a las…", callback_data: "au:c:sale" }, { text: "Llego a las…", callback_data: "au:c:llega" }]];
  if (mid) editar(token, chatId, mid, txt, b); else enviar(token, chatId, txt, { reply_markup: { inline_keyboard: b } });
}
function preguntarHora(token, chatId, f, mid) {
  const lista = f.cuanto === "sale" ? SALE : LLEGA;
  const txt = (f.cuanto === "sale" ? "¿A qué hora sales" : "¿A qué hora llegas") + " " + diaTxt(f.dia) + "? Toca una o escríbela (por ejemplo <i>3:30 pm</i>).";
  const b = [lista.map((h) => ({ text: hora12(h), callback_data: "au:h:" + h.replace(":", "") }))];
  if (mid) editar(token, chatId, mid, txt, b); else enviar(token, chatId, txt, { reply_markup: { inline_keyboard: b } });
}
function preguntarTipo(token, chatId, f, mid) {
  const cuando = f.cuanto === "sale" ? " desde las " + hora12(f.hora) : f.cuanto === "llega" ? " hasta las " + hora12(f.hora) : " todo el día";
  const txt = "🕔 " + diaTxt(f.dia) + cuando + ". ¿De qué tipo?";
  const b = [TIPOS.map((t) => ({ text: t[1], callback_data: "au:t:" + t[0] }))];
  if (mid) editar(token, chatId, mid, txt, b); else enviar(token, chatId, txt, { reply_markup: { inline_keyboard: b } });
}
function crear(app, token, chatId, u, v, f, tipo, mid) {
  const a = new Record(app.findCollectionByNameOrId("ausencias"));
  a.set("user", u.id); a.set("desde", f.dia); a.set("hasta", f.dia); a.set("tipo", tipo);
  a.set("horaDesde", f.cuanto === "sale" ? f.hora : ""); a.set("horaHasta", f.cuanto === "llega" ? f.hora : "");
  a.set("nota", "Desde Telegram");
  app.save(a);
  obra.ponerFlujo(app, v, null);
  // Entregas propias que chocan con la ausencia.
  const tareas = lib.arr(app.findRecordsByFilter("tareas", "status != 'terminado' && assignees ~ {:u} && (due = {:d} || start = {:d})", "", 50, 0, { u: u.id, d: f.dia }));
  const choca = tareas.filter((t) => lib.cubre(a, t.getString("due"), t.getString("dueTime")) || lib.cubre(a, t.getString("start"), t.getString("startTime")));
  const cuando = f.cuanto === "sale" ? " desde las " + hora12(f.hora) : f.cuanto === "llega" ? " hasta las " + hora12(f.hora) : "";
  let txt = "✅ Listo: quedó registrado que " + diaTxt(f.dia) + " estás " + (ESTAS[tipo] || "ausente") + cuando + ". Nadie te podrá poner entregas en ese rato.";
  if (choca.length) txt += "\n\n⚠ Ya tenías " + (choca.length === 1 ? "esta entrega" : "estas entregas") + " ese día:\n" + choca.slice(0, 6).map((t) => "• " + esc(t.getString("title")) + (t.getString("dueTime") ? " (" + hora12(t.getString("dueTime")) + ")" : " (sin hora: confirma a qué hora es)")).join("\n") + "\nAvísale a quien dirige el proyecto.";
  editar(token, chatId, mid, txt, [[{ text: "Cancelar esta ausencia", callback_data: "au:z:" + a.id }]]);
}

// Texto mientras se registra la ausencia (fecha u hora escritas). Devuelve true si lo atendió.
function onFlujo(app, token, chatId, u, v, msg) {
  const f = obra.flujo(v);
  if (!f || f.tipo !== "ausencia") return false;
  const text = String(msg.text || "").trim();
  if (!text) return false;
  if (f.paso === "dia") {
    const d = fechaDe(text);
    if (!d) { enviar(token, chatId, "No entendí la fecha. Escríbela así: <i>25/11</i>."); return true; }
    if (d < lib.hoy(0)) { enviar(token, chatId, "Esa fecha ya pasó. Escribe una de hoy en adelante."); return true; }
    f.dia = d; f.paso = "cuanto"; obra.ponerFlujo(app, v, f); preguntarCuanto(token, chatId, f); return true;
  }
  if (f.paso === "hora") {
    const h = horaDe(text);
    if (!h) { enviar(token, chatId, "No entendí la hora. Escríbela así: <i>3:30 pm</i> o <i>15:30</i>."); return true; }
    f.hora = h; f.paso = "tipo"; obra.ponerFlujo(app, v, f); preguntarTipo(token, chatId, f); return true;
  }
  enviar(token, chatId, "Toca uno de los botones de arriba, o escribe <b>cancelar</b>.");
  return true;
}
// Botones "au:…". Devuelve el texto para la notificación del botón, o null si no era de aquí.
function onBoton(app, token, chatId, mid, u, v, k, id, extra) {
  if (k !== "au") return null;
  if (id === "z") { // cancelar una ausencia ya creada
    let a; try { a = app.findRecordById("ausencias", extra); } catch (e) { return "Esa ausencia ya no existe."; }
    if (a.getString("user") !== u.id) return "Esa ausencia no es tuya.";
    app.delete(a);
    editar(token, chatId, mid, "Cancelaste la ausencia.", []);
    return "Cancelada";
  }
  if (id === "x") { obra.ponerFlujo(app, v, null); editar(token, chatId, mid, "Listo, no se registró nada.", []); return ""; }
  const f = obra.flujo(v);
  if (!f || f.tipo !== "ausencia") return "Empieza de nuevo con 🕔 Me ausento.";
  if (id === "d") { if (extra < lib.hoy(0)) return "Esa fecha ya pasó."; f.dia = extra; f.paso = "cuanto"; obra.ponerFlujo(app, v, f); preguntarCuanto(token, chatId, f, mid); return ""; }
  if (id === "c" && f.dia) {
    f.cuanto = extra;
    if (extra === "todo") { f.paso = "tipo"; obra.ponerFlujo(app, v, f); preguntarTipo(token, chatId, f, mid); return ""; }
    f.paso = "hora"; obra.ponerFlujo(app, v, f); preguntarHora(token, chatId, f, mid); return "";
  }
  if (id === "h" && f.dia) { f.hora = extra.slice(0, 2) + ":" + extra.slice(2); f.paso = "tipo"; obra.ponerFlujo(app, v, f); preguntarTipo(token, chatId, f, mid); return ""; }
  if (id === "t" && f.dia && TIPOS.some((t) => t[0] === extra)) { crear(app, token, chatId, u, v, f, extra, mid); return "Registrada"; }
  return "Empieza de nuevo con 🕔 Me ausento.";
}

module.exports = { empezar, onFlujo, onBoton, horaDe, fechaDe };
