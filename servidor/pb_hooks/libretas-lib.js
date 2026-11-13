/// <reference path="../pb_data/types.d.ts" />
// Funciones de libretas.pb.js (en el servidor, cada aviso necesita sus funciones en un módulo aparte).
function menciones(texto) {
  const out = [];
  const re = /@\[[^\]]{1,80}\]\(u:([a-z0-9]{15})\)/g;
  let m;
  while ((m = re.exec(String(texto || "")))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

// Aviso cuando a alguien le comparten una libreta (o le dan permiso de editarla).
function avisarCompartida(e, antes) {
  const lib = require(`${__hooks}/lib.js`);
  const nombre = e.auth ? e.auth.getString("name") : "Alguien";
  const titulo = e.record.getString("titulo");
  const prevL = antes ? antes.getStringSlice("lectores") : [];
  const prevE = antes ? antes.getStringSlice("editores") : [];
  for (const u of e.record.getStringSlice("editores")) {
    if (u === e.record.getString("owner") || prevE.includes(u)) continue;
    lib.notificar(e.app, u, "libreta", nombre + " te invitó a editar «" + titulo + "»", "La encuentras en Libretas → Compartidas conmigo.", "#libreta/" + e.record.id, { de: e.auth ? e.auth.id : "" });
  }
  for (const u of e.record.getStringSlice("lectores")) {
    if (u === e.record.getString("owner") || prevL.includes(u) || prevE.includes(u) || e.record.getStringSlice("editores").includes(u)) continue;
    lib.notificar(e.app, u, "libreta", nombre + " compartió contigo «" + titulo + "»", "Puedes verla en Libretas → Compartidas conmigo.", "#libreta/" + e.record.id, { de: e.auth ? e.auth.id : "" });
  }
}
// @menciones en libretas: solo avisa a quien puede abrir esa libreta.
function avisarMencionLibreta(e, antesTexto) {
  const lib = require(`${__hooks}/lib.js`);
  const nuevos = menciones(e.record.getString("texto")).filter((u) => !menciones(antesTexto).includes(u));
  if (!nuevos.length) return;
  const libreta = e.app.findRecordById("libretas", e.record.getString("libreta"));
  const pueden = [libreta.getString("owner"), ...libreta.getStringSlice("lectores"), ...libreta.getStringSlice("editores")];
  const nombre = e.auth ? e.auth.getString("name") : "Alguien";
  for (const u of nuevos) {
    if (e.auth && u === e.auth.id) continue;
    if (!pueden.includes(u)) continue;
    lib.notificar(e.app, u, "mencion", nombre + " te mencionó en «" + libreta.getString("titulo") + "»",
      String(e.record.getString("texto")).replace(/@\[([^\]]+)\]\([up]:[a-z0-9]{15}\)/g, "@$1").slice(0, 200), "#libreta/" + libreta.id, { de: e.auth ? e.auth.id : "" });
  }
}
// @menciones en actas (temas, observaciones y compromisos).
function textoActa(r) {
  let comp = [];
  try { comp = JSON.parse(JSON.stringify(r.get("compromisos") || [])); } catch (err) { comp = []; }
  return [r.getString("temas"), r.getString("observaciones"), ...(Array.isArray(comp) ? comp.map((c) => (c && c.texto) || "") : [])].join("\n");
}
function avisarMencionActa(e, antes) {
  const lib = require(`${__hooks}/lib.js`);
  const nuevos = menciones(textoActa(e.record)).filter((u) => !menciones(antes).includes(u));
  if (!nuevos.length) return;
  let proyecto = "";
  try { proyecto = e.app.findRecordById("proyectos", e.record.getString("proyecto")).getString("name"); } catch (err) { /* sin proyecto */ }
  const nombre = e.auth ? e.auth.getString("name") : "Alguien";
  for (const u of nuevos) {
    if (e.auth && u === e.auth.id) continue;
    lib.notificar(e.app, u, "mencion", nombre + " te mencionó en el acta #" + e.record.getInt("numero") + (proyecto ? " de " + proyecto : ""),
      "", "#acta/" + e.record.id, { de: e.auth ? e.auth.id : "" });
  }
}

module.exports = { menciones, avisarCompartida, avisarMencionLibreta, textoActa, avisarMencionActa };
