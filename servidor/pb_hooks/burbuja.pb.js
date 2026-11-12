/// <reference path="../pb_data/types.d.ts" />
// Burbuja: tocar el hombro a alguien, responderle y el resumen de la semana de cada lunes.
routerAdd("POST", "/api/lap/toque", (e) => require(`${__hooks}/lib.js`).toque(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/toque/responder", (e) => require(`${__hooks}/lib.js`).responderToque(e), $apis.requireAuth("users"));

// Lunes 8:10 a. m. en Bogotá (13:10 UTC).
cronAdd("resumen_semana", "10 13 * * 1", () => {
  require(`${__hooks}/lib.js`).resumenSemana($app);
});

// Para probar el resumen a mano (solo administrador).
routerAdd("POST", "/api/lap/resumen-semana", (e) => {
  require(`${__hooks}/lib.js`).resumenSemana(e.app);
  return e.json(200, { ok: true });
}, $apis.requireSuperuserAuth());
