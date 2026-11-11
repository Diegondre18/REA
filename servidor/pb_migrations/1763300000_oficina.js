/// <reference path="../pb_data/types.d.ts" />
// Oficina en pixel art: el muñeco de cada persona, su posición y si está en su puesto.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new Field({ name: "muneco", type: "json", maxSize: 2000 }));
  users.fields.add(new Field({ name: "pos", type: "json", maxSize: 500 }));
  users.fields.add(new Field({ name: "puesto", type: "bool" }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["muneco", "pos", "puesto"]) users.fields.removeByName(f);
  app.save(users);
});
