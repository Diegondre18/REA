/// <reference path="../pb_data/types.d.ts" />
// Copias de seguridad automáticas: cada madrugada (2:30 a. m. en Bogotá = 7:30 UTC), se guardan las últimas 14.
// Quedan en pb_data/backups y se pueden descargar o restaurar desde el panel de administración.
migrate((app) => {
  const settings = app.settings();
  settings.backups.cron = "30 7 * * *";
  settings.backups.cronMaxKeep = 14;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.backups.cron = "";
  app.save(settings);
});
