/// <reference path="../pb_data/types.d.ts" />
// Telegram, etapa 2: lo que la persona está haciendo en el chat (acta, fotos, pendiente) y las fotos de
// obra sueltas de cada proyecto.
migrate((app) => {
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const users = app.findCollectionByNameOrId("users");
  const proyectos = app.findCollectionByNameOrId("proyectos");

  const tg = app.findCollectionByNameOrId("telegram");
  tg.fields.add(new Field({ name: "flujo", type: "json", maxSize: 20000 }));
  app.save(tg);

  app.save(new Collection({
    type: "base", name: "fotos_obra",
    listRule: AUTH, viewRule: AUTH, createRule: AUTH,
    updateRule: "by = @request.auth.id || " + ADMIN, deleteRule: "by = @request.auth.id || " + ADMIN,
    fields: [
      { name: "proyecto", type: "relation", required: true, collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true },
      { name: "foto", type: "file", required: true, maxSelect: 1, maxSize: 15 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["480x0"] },
      { name: "nota", type: "text", max: 1000 },
      { name: "fecha", type: "text", max: 10 },
      { name: "by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_fotos_obra_proyecto ON fotos_obra (proyecto, created)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("fotos_obra")); } catch (e) { /* ya no está */ }
  const tg = app.findCollectionByNameOrId("telegram");
  tg.fields.removeByName("flujo");
  app.save(tg);
});
