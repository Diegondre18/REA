/// <reference path="../pb_data/types.d.ts" />
// Tareas programadas del servidor. Las horas de cron están en UTC: 13:05 UTC son las 8:05 a. m. en Bogotá.

// Lunes a viernes por la mañana: recordatorios de comités, reuniones y tareas por vencer.
cronAdd("recordatorios", "5 13 * * 1-5", () => {
  require(`${__hooks}/lib.js`).recordatorios($app);
});

// Cada madrugada: borra actividad y notificaciones con más de 30 días.
cronAdd("limpieza", "17 8 * * *", () => {
  require(`${__hooks}/lib.js`).limpiar($app);
});

// Permite al administrador lanzar los recordatorios a mano para probarlos.
routerAdd("POST", "/api/lap/recordatorios", (e) => {
  require(`${__hooks}/lib.js`).recordatorios(e.app);
  return e.json(200, { ok: true });
}, $apis.requireSuperuserAuth());
