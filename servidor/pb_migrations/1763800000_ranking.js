/// <reference path="../pb_data/types.d.ts" />
// Ranking de la oficina: puntos de la semana que cada quien publica (pausas y descansos asistidos).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new Field({ name: "puntos", type: "json", maxSize: 500 }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("puntos");
  app.save(users);
});
