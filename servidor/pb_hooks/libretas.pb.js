/// <reference path="../pb_data/types.d.ts" />
// Libretas y actas: número consecutivo de cada acta, aviso al compartir una libreta y avisos de @menciones.
// Las menciones se guardan en el texto así: @[Nombre](u:ID) para personas y @[CL-01](p:ID) para proyectos.

// Número de acta: el siguiente del proyecto.
onRecordCreateRequest((e) => {
  const p = e.record.getString("proyecto");
  let n = 1;
  try {
    const last = e.app.findRecordsByFilter("actas", "proyecto = {:p}", "-numero", 1, 0, { p: p });
    if (last.length) n = last[0].getInt("numero") + 1;
  } catch (err) { /* primera acta */ }
  e.record.set("numero", n);
  if (!e.record.getString("estado")) e.record.set("estado", "borrador");
  if (e.auth && !e.record.getString("by")) e.record.set("by", e.auth.id);
  e.next();
}, "actas");

onRecordCreateRequest((e) => { e.next(); try { require(`${__hooks}/libretas-lib.js`).avisarCompartida(e, null); } catch (err) { console.log("libreta compartida: " + err); } }, "libretas");
onRecordUpdateRequest((e) => {
  const antes = e.record.original();
  e.next();
  try { require(`${__hooks}/libretas-lib.js`).avisarCompartida(e, antes); } catch (err) { console.log("libreta compartida: " + err); }
}, "libretas");

onRecordCreateRequest((e) => { e.next(); try { require(`${__hooks}/libretas-lib.js`).avisarMencionLibreta(e, ""); } catch (err) { console.log("mención: " + err); } }, "libreta_items");
onRecordUpdateRequest((e) => {
  const antes = e.record.original().getString("texto");
  e.next();
  try { require(`${__hooks}/libretas-lib.js`).avisarMencionLibreta(e, antes); } catch (err) { console.log("mención: " + err); }
}, "libreta_items");

onRecordCreateRequest((e) => { e.next(); try { require(`${__hooks}/libretas-lib.js`).avisarMencionActa(e, ""); } catch (err) { console.log("mención acta: " + err); } }, "actas");
onRecordUpdateRequest((e) => {
  const antes = require(`${__hooks}/libretas-lib.js`).textoActa(e.record.original());
  e.next();
  try { require(`${__hooks}/libretas-lib.js`).avisarMencionActa(e, antes); } catch (err) { console.log("mención acta: " + err); }
}, "actas");
