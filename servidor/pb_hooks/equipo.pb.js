/// <reference path="../pb_data/types.d.ts" />
// Reconocimientos y anuncios: avisan a quien corresponde.

onRecordCreateRequest((e) => {
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    lib.notificar(e.app, e.record.getString("para"), "gracias", lib.primerNombre(e.auth) + " te dio las gracias", e.record.getString("mensaje"), "#equipo", { de: e.auth ? e.auth.id : "" });
  } catch (err) { console.log("aviso gracias:", err); }
}, "reconocimientos");

onRecordCreateRequest((e) => {
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const yo = e.auth ? e.auth.id : "";
    const gente = lib.arr(e.app.findRecordsByFilter("users", "role != 'maestro' && role != 'pantalla'", "", 500, 0));
    for (const u of gente) {
      if (u.id === yo) continue;
      lib.notificar(e.app, u.id, "anuncio", (e.record.getBool("importante") ? "Anuncio importante de " : "Anuncio de ") + lib.primerNombre(e.auth), e.record.getString("texto"), "#inicio", { de: yo, urgente: e.record.getBool("importante") });
    }
  } catch (err) { console.log("aviso anuncio:", err); }
}, "anuncios");
