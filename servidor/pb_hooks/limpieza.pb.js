/// <reference path="../pb_data/types.d.ts" />
// Cada madrugada borra la actividad con más de 30 días.
cronAdd("limpiar_actividad", "17 3 * * *", () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().replace("T", " ");
  const old = $app.findRecordsByFilter("actividad", "created < {:cutoff}", "", 1000, 0, { cutoff });
  for (const r of old) $app.delete(r);
});
