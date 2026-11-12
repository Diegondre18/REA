/// <reference path="../pb_data/types.d.ts" />
// Burbuja y estados: el estado de cada persona (disponible, no molestar, en reunión, almuerzo, fuera)
// y avisos con remitente, urgencia y respuesta (para "tocar el hombro").
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new Field({ name: "presencia", type: "select", maxSelect: 1, values: ["disponible", "no_molestar", "reunion", "almuerzo", "fuera"] }));
  // Reunión que puso el estado sola (para quitarlo al terminar); vacío si lo eligió la persona.
  users.fields.add(new Field({ name: "presenciaRef", type: "text", max: 40 }));
  app.save(users);

  const notifs = app.findCollectionByNameOrId("notificaciones");
  notifs.fields.add(new Field({ name: "de", type: "text", max: 40 }));
  notifs.fields.add(new Field({ name: "urgente", type: "bool" }));
  notifs.fields.add(new Field({ name: "respuesta", type: "text", max: 20 }));
  app.save(notifs);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["presencia", "presenciaRef"]) users.fields.removeByName(f);
  app.save(users);
  const notifs = app.findCollectionByNameOrId("notificaciones");
  for (const f of ["de", "urgente", "respuesta"]) notifs.fields.removeByName(f);
  app.save(notifs);
});
