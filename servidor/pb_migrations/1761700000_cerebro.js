/// <reference path="../pb_data/types.d.ts" />
// Esquema del Cerebro de Visualización: renders, entregas y actividad, más el
// estado de cada persona (en qué trabaja y cuándo estuvo conectada) en "users".
const AUTH = "@request.auth.id != ''";
const STATUS = ["cola", "escena", "render", "post", "revision", "guardado"];

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const name of ["renderId", "since", "lastSeen", "viewing"]) {
    users.fields.add(new Field({ name, type: "text", max: 40 }));
  }
  users.listRule = AUTH;
  users.viewRule = AUTH;
  users.createRule = ""; // registro abierto: el servidor solo es visible dentro de la red de la oficina
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);

  const txt = (name, max) => ({ name, type: "text", max });
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
  const open = { listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH };

  app.save(new Collection({
    type: "base", name: "renders", ...open,
    fields: [
      { name: "title", type: "text", required: true, max: 200 },
      txt("project", 200), txt("type", 60),
      { name: "status", type: "select", required: true, maxSelect: 1, values: STATUS },
      { name: "progress", type: "number", min: 0, max: 100 },
      txt("start", 10), txt("due", 10), txt("savedAt", 10),
      txt("artist", 120), txt("engine", 80), txt("resolution", 40), txt("version", 40),
      txt("path", 1000), txt("notes", 5000),
      { name: "sample", type: "bool" },
      { name: "updatedBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_renders_status ON renders (status)"],
  }));

  app.save(new Collection({
    type: "base", name: "entregas", ...open,
    fields: [
      { name: "title", type: "text", required: true, max: 200 },
      txt("project", 200), txt("date", 10), txt("notes", 5000),
      { name: "sample", type: "bool" },
      ...stamps,
    ],
  }));

  // La actividad solo se crea (a nombre de quien la escribe) y se borra sola a los 30 días.
  app.save(new Collection({
    type: "base", name: "actividad",
    listRule: AUTH, viewRule: AUTH,
    createRule: AUTH + " && @request.body.by = @request.auth.id",
    updateRule: null, deleteRule: null,
    fields: [
      { name: "by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["create", "stage", "saved", "edit", "delete", "working", "entrega"] },
      txt("renderId", 40), txt("title", 200), txt("project", 200), txt("to", 20),
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_actividad_created ON actividad (created)"],
  }));
}, (app) => {
  for (const name of ["actividad", "entregas", "renders"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) { /* ya no existe */ }
  }
  const users = app.findCollectionByNameOrId("users");
  for (const name of ["renderId", "since", "lastSeen", "viewing"]) users.fields.removeByName(name);
  app.save(users);
});
