/// <reference path="../pb_data/types.d.ts" />
// Bot de Telegram del estudio (ver telegram-lib.js).
cronAdd("telegram_bot", "* * * * *", () => {
  require(`${__hooks}/telegram-lib.js`).ciclo($app, 50);
});

routerAdd("GET", "/api/lap/telegram", (e) => require(`${__hooks}/telegram-lib.js`).estado(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/telegram/config", (e) => require(`${__hooks}/telegram-lib.js`).guardarConfig(e), $apis.requireAuth("users"));
routerAdd("DELETE", "/api/lap/telegram/config", (e) => require(`${__hooks}/telegram-lib.js`).quitarConfig(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/telegram/codigo", (e) => require(`${__hooks}/telegram-lib.js`).codigo(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/telegram/avisos", (e) => require(`${__hooks}/telegram-lib.js`).ponerAvisos(e), $apis.requireAuth("users"));
routerAdd("POST", "/api/lap/telegram/desvincular", (e) => require(`${__hooks}/telegram-lib.js`).desvincular(e), $apis.requireAuth("users"));

// Para pruebas: corre el ciclo unos segundos ahora mismo (solo administrador del servidor).
routerAdd("POST", "/api/lap/telegram/ciclo", (e) => {
  require(`${__hooks}/telegram-lib.js`).ciclo(e.app, Number((e.requestInfo().body || {}).segundos) || 3);
  return e.json(200, { ok: true });
}, $apis.requireSuperuserAuth());
