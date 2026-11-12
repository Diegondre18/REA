/// <reference path="../pb_data/types.d.ts" />
// Respaldo externo. La app del PC servidor pide aquí una copia completa de la base (solo desde el mismo PC
// y con la clave que guarda en pb_data/lap_respaldo.key), la lleva a la carpeta elegida y cuenta cómo le fue.

routerAdd("POST", "/api/lap/respaldo/crear", (e) => {
  const lib = require(`${__hooks}/respaldo-lib.js`);
  lib.autorizar(e);
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const name = "lap_" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".zip";
  e.app.createBackup(e.request.context(), name);
  return e.json(200, { name: name, dir: e.app.dataDir() + "/backups" });
});

routerAdd("POST", "/api/lap/respaldo/resultado", (e) => {
  const lib = require(`${__hooks}/respaldo-lib.js`);
  lib.autorizar(e);
  lib.registrar(e.app, e.requestInfo().body || {});
  return e.json(200, { ok: true });
});

// Todos los días a la 1:20 p. m. en Bogotá (18:20 UTC): si hace más de 2 días no hay respaldo, avisa a Dirección.
cronAdd("respaldo_revision", "20 18 * * *", () => {
  require(`${__hooks}/respaldo-lib.js`).revisar($app);
});
