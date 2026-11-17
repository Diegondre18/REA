// Llamadas a la API de Telegram que usa el bot (mensajes, botones, fotos).
const API = () => $os.getenv("LAP_TG_API") || "https://api.telegram.org";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const corto = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Devuelve result o lanza un error con el código HTTP.
function tg(token, method, params, timeout) {
  const res = $http.send({
    url: API() + "/bot" + token + "/" + method, method: "POST",
    body: JSON.stringify(params || {}), headers: { "content-type": "application/json" }, timeout: timeout || 15,
  });
  const j = res.json || {};
  if (res.statusCode !== 200 || !j.ok) {
    const err = new Error((j && j.description) || ("HTTP " + res.statusCode));
    err.code = res.statusCode;
    throw err;
  }
  return j.result;
}
function enviar(token, chatId, text, extra) {
  try { return tg(token, "sendMessage", Object.assign({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }, extra || {})); }
  catch (e) { console.log("telegram enviar:", e.message); return null; }
}
function editar(token, chatId, messageId, text, botones) {
  try { tg(token, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: botones || [] } }); }
  catch (e) { if (String(e.message).indexOf("not modified") < 0) enviar(token, chatId, text, { reply_markup: { inline_keyboard: botones || [] } }); }
}
// Baja una foto que mandaron al chat y la deja lista para guardar en un registro.
function descargar(token, fileId, nombre) {
  const f = tg(token, "getFile", { file_id: fileId }, 20);
  const res = $http.send({ url: API() + "/file/bot" + token + "/" + f.file_path, method: "GET", timeout: 90 });
  if (res.statusCode !== 200) throw new Error("No pude bajar la foto (HTTP " + res.statusCode + ").");
  const ext = (/\.(jpe?g|png|webp)$/i.exec(f.file_path || "") || [".jpg"])[0].toLowerCase();
  return $filesystem.fileFromBytes(res.body, (nombre || "obra") + ext);
}
// La foto de un mensaje: la versión más grande (o una imagen mandada como archivo).
function fotoDe(msg) {
  if (msg.photo && msg.photo.length) return msg.photo[msg.photo.length - 1].file_id;
  if (msg.document && /^image\/(jpeg|png|webp)$/.test(msg.document.mime_type || "")) return msg.document.file_id;
  return "";
}

module.exports = { API, esc, corto, tg, enviar, editar, descargar, fotoDe };
