/// <reference path="../pb_data/types.d.ts" />
// Vida del equipo: reconocimientos entre compañeros, anuncios de Dirección y vasos de agua en el bienestar.
migrate((app) => {
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base", name: "reconocimientos",
    listRule: AUTH, viewRule: AUTH,
    createRule: "de = @request.auth.id && para != @request.auth.id",
    updateRule: null, deleteRule: "de = @request.auth.id",
    fields: [
      { name: "de", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "para", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "mensaje", type: "text", required: true, max: 280 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_reconocimientos_para ON reconocimientos (para, created)"],
  }));
  app.save(new Collection({
    type: "base", name: "anuncios",
    listRule: AUTH, viewRule: AUTH, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "texto", type: "text", required: true, max: 400 },
      { name: "hasta", type: "text", required: true, max: 10 },
      { name: "importante", type: "bool" },
      { name: "by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }));
  const b = app.findCollectionByNameOrId("bienestar");
  b.fields.add(new Field({ name: "agua", type: "number", min: 0 }));
  app.save(b);
}, (app) => {
  for (const c of ["reconocimientos", "anuncios"]) app.delete(app.findCollectionByNameOrId(c));
  const b = app.findCollectionByNameOrId("bienestar");
  b.fields.removeByName("agua");
  app.save(b);
});
