/// <reference path="../pb_data/types.d.ts" />
// Libretas (páginas de bloques y tableros libres tipo mini Miro), personales o compartidas con
// permiso de ver o editar, y actas de obra por proyecto.
migrate((app) => {
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const users = app.findCollectionByNameOrId("users");
  const proyectos = app.findCollectionByNameOrId("proyectos");
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];

  // ---- libretas: la dueña decide quién la ve y quién la edita ----
  const VE = "(owner = @request.auth.id || lectores.id ?= @request.auth.id || editores.id ?= @request.auth.id)";
  // Quien edita cambia el contenido y el título, pero no a quién se comparte ni de quién es.
  const EDITA = "(owner = @request.auth.id || (editores.id ?= @request.auth.id && @request.body.owner:isset = false && @request.body.lectores:isset = false && @request.body.editores:isset = false))";
  const libretas = new Collection({
    type: "base", name: "libretas",
    listRule: VE, viewRule: VE,
    createRule: AUTH + " && owner = @request.auth.id",
    updateRule: EDITA, deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "titulo", type: "text", required: true, max: 120 },
      { name: "icono", type: "text", max: 16 },
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["pagina", "tablero"] },
      { name: "lectores", type: "relation", collectionId: users.id, maxSelect: 100, cascadeDelete: false },
      { name: "editores", type: "relation", collectionId: users.id, maxSelect: 100, cascadeDelete: false },
      { name: "personal", type: "bool" }, // la página de inicio de cada persona
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_libretas_owner ON libretas (owner)"],
  });
  app.save(libretas);

  // ---- bloques de una página o elementos de un tablero ----
  const VE_I = "(libreta.owner = @request.auth.id || libreta.lectores.id ?= @request.auth.id || libreta.editores.id ?= @request.auth.id)";
  const ED_I = "(libreta.owner = @request.auth.id || libreta.editores.id ?= @request.auth.id)";
  app.save(new Collection({
    type: "base", name: "libreta_items",
    listRule: VE_I, viewRule: VE_I, createRule: ED_I, updateRule: ED_I, deleteRule: ED_I,
    fields: [
      { name: "libreta", type: "relation", required: true, collectionId: libretas.id, maxSelect: 1, cascadeDelete: true },
      { name: "tipo", type: "select", required: true, maxSelect: 1,
        values: ["texto", "h1", "h2", "lista", "numero", "check", "cita", "separador", "imagen", "enlace", "widget", "nota", "marco"] },
      { name: "texto", type: "text", max: 20000 },
      { name: "hecho", type: "bool" },
      { name: "orden", type: "number" },
      { name: "x", type: "number" }, { name: "y", type: "number" }, { name: "w", type: "number" }, { name: "h", type: "number" },
      { name: "z", type: "number" },
      { name: "color", type: "text", max: 20 },
      { name: "url", type: "text", max: 1000 },
      { name: "widget", type: "text", max: 30 },
      { name: "imagen", type: "file", maxSelect: 1, maxSize: 15 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], thumbs: ["480x0"] },
      { name: "by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_libreta_items ON libreta_items (libreta, orden)"],
  }));

  // ---- actas de obra ----
  app.save(new Collection({
    type: "base", name: "actas",
    listRule: AUTH, viewRule: AUTH, createRule: AUTH,
    // Cerrada (firmada y enviada) ya no se cambia, salvo Dirección.
    updateRule: AUTH + " && (estado != 'cerrada' || " + ADMIN + ")",
    deleteRule: "(by = @request.auth.id && estado != 'cerrada') || " + ADMIN,
    fields: [
      { name: "proyecto", type: "relation", required: true, collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true },
      { name: "numero", type: "number" },
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "hora", type: "text", max: 5 },
      { name: "lugar", type: "text", max: 200 },
      { name: "equipo", type: "relation", collectionId: users.id, maxSelect: 50, cascadeDelete: false },
      { name: "asistentes", type: "json", maxSize: 50000 }, // [{ nombre, rol, empresa }]
      { name: "avance", type: "number", min: 0, max: 100 },
      { name: "clima", type: "text", max: 60 },
      { name: "temas", type: "text", max: 20000 },
      { name: "compromisos", type: "json", maxSize: 100000 }, // [{ id, texto, resp, respNombre, fecha, hecho, tarea }]
      { name: "observaciones", type: "text", max: 10000 },
      { name: "fotos", type: "file", maxSelect: 40, maxSize: 15 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["480x0"] },
      { name: "fotosNotas", type: "json", maxSize: 50000 }, // { archivo: nota }
      { name: "firmas", type: "json", maxSize: 2000000 }, // [{ nombre, rol, img (PNG en base64), fecha }]
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["borrador", "cerrada"] },
      { name: "by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_actas_proyecto ON actas (proyecto, numero)"],
  }));
}, (app) => {
  for (const c of ["actas", "libreta_items", "libretas"]) {
    try { app.delete(app.findCollectionByNameOrId(c)); } catch (e) { /* ya no está */ }
  }
});
