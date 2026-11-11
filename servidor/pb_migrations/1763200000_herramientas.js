/// <reference path="../pb_data/types.d.ts" />
// Herramientas del estudio: licencias y curaduría, planos con revisiones y envíos, bitácora de obra,
// directorio, materiales, horas, cobros y tarifas, ausencias, solicitudes internas y revisión de imágenes.
const AUTH = "@request.auth.id != ''";
const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
// Finanzas: Dirección, perfil maestro y el área de Administración.
const FIN = "(" + ADMIN + " || @request.auth.areas ~ 'administracion')";
const AREAS = ["arquitectura", "interior", "visualizacion", "administracion", "direccion"];

migrate((app) => {
  const txt = (name, max) => ({ name, type: "text", max });
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
  const open = { listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH };
  const users = app.findCollectionByNameOrId("users");
  const proyectos = app.findCollectionByNameOrId("proyectos");
  const tareas = app.findCollectionByNameOrId("tareas");
  const rel = (name, col, opts) => ({ name, type: "relation", collectionId: col.id, maxSelect: 1, cascadeDelete: false, ...(opts || {}) });
  const project = rel("project", proyectos, { cascadeDelete: true });

  // ---- proyectos: semáforo de estado ----
  proyectos.fields.add(new Field({ name: "salud", type: "select", maxSelect: 1, values: ["verde", "amarillo", "rojo"] }));
  proyectos.fields.add(new Field({ name: "saludNota", type: "text", max: 500 }));
  proyectos.fields.add(new Field({ name: "saludFecha", type: "text", max: 30 }));
  app.save(proyectos);

  // ---- tareas: de dónde vienen, subtareas y dependencias ----
  tareas.fields.add(new Field({ name: "origen", type: "text", max: 60 })); // "evento:<id>", "visita:<id>", "solicitud:<id>"
  tareas.fields.add(new Field({ name: "parent", type: "relation", collectionId: tareas.id, maxSelect: 1, cascadeDelete: true }));
  tareas.fields.add(new Field({ name: "dependsOn", type: "relation", collectionId: tareas.id, maxSelect: 20, cascadeDelete: false }));
  app.save(tareas);

  // ---- licencias y curaduría ----
  app.save(new Collection({
    type: "base", name: "tramites", ...open,
    fields: [
      { ...project, required: true },
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["construccion", "modificacion", "reconocimiento", "demolicion", "propiedad_horizontal", "urbanismo", "otro"] },
      txt("entidad", 200), txt("radicado", 80),
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["preparacion", "radicado", "observaciones", "respuesta", "aprobado", "negado", "desistido"] },
      txt("fechaRadicacion", 10), txt("fechaLimite", 10), txt("fechaResolucion", 10), txt("vigenciaHasta", 10),
      rel("responsable", users), txt("ruta", 1000), txt("notas", 5000),
      { name: "historial", type: "json", maxSize: 200000 },
      ...stamps,
    ],
  }));

  // ---- planos con revisiones y registro de envíos ----
  app.save(new Collection({
    type: "base", name: "planos", ...open,
    fields: [
      { ...project, required: true },
      { name: "codigo", type: "text", required: true, max: 40 }, txt("nombre", 200),
      { name: "disciplina", type: "select", maxSelect: 1, values: ["arquitectura", "estructura", "hidrosanitario", "electrico", "interiores", "paisajismo", "otro"] },
      txt("revision", 10),
      { name: "estado", type: "select", maxSelect: 1, values: ["en_proceso", "para_revision", "aprobado", "emitido"] },
      txt("ruta", 1000),
      { name: "revisiones", type: "json", maxSize: 200000 },
      rel("updatedBy", users),
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_planos_project ON planos (project)"],
  }));
  app.save(new Collection({
    type: "base", name: "envios", ...open,
    fields: [
      { ...project, required: true },
      { name: "fecha", type: "text", required: true, max: 10 }, { name: "destinatario", type: "text", required: true, max: 200 }, txt("empresa", 200),
      { name: "medio", type: "select", maxSelect: 1, values: ["correo", "impreso", "dropbox", "otro"] },
      { name: "proposito", type: "select", maxSelect: 1, values: ["aprobacion", "informacion", "construccion", "licencia", "cotizacion"] },
      { name: "items", type: "json", maxSize: 200000 }, txt("notas", 3000), rel("by", users),
      ...stamps,
    ],
  }));

  // ---- bitácora de obra ----
  app.save(new Collection({
    type: "base", name: "visitas", ...open,
    fields: [
      { ...project, required: true },
      { name: "fecha", type: "text", required: true, max: 10 }, rel("by", users), txt("asistentes", 500),
      { name: "avance", type: "number", min: 0, max: 100 }, txt("resumen", 10000), txt("ruta", 1000),
      ...stamps,
    ],
  }));

  // ---- directorio y materiales ----
  const contactos = new Collection({
    type: "base", name: "contactos", ...open,
    fields: [
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["cliente", "proveedor", "contratista", "consultor", "entidad", "otro"] },
      { name: "nombre", type: "text", required: true, max: 200 }, txt("empresa", 200), txt("cargo", 120), txt("especialidad", 200),
      txt("telefono", 60), txt("email", 200), txt("ciudad", 120), txt("notas", 3000),
      { name: "proyectos", type: "relation", collectionId: proyectos.id, maxSelect: 200, cascadeDelete: false },
      ...stamps,
    ],
  });
  app.save(contactos);
  app.save(new Collection({
    type: "base", name: "materiales", ...open,
    fields: [
      { name: "nombre", type: "text", required: true, max: 200 },
      { name: "categoria", type: "select", maxSelect: 1, values: ["piso", "muro", "cielo", "carpinteria", "mobiliario", "iluminacion", "sanitario", "cocina", "fachada", "otro"] },
      rel("proveedor", contactos), txt("referencia", 200), { name: "precio", type: "number", min: 0 }, txt("unidad", 40),
      txt("ruta", 1000), txt("notas", 3000),
      { name: "proyectos", type: "relation", collectionId: proyectos.id, maxSelect: 200, cascadeDelete: false },
      rel("by", users),
      ...stamps,
    ],
  }));

  // ---- horas, cobros y tarifas (finanzas) ----
  app.save(new Collection({
    type: "base", name: "horas",
    listRule: "user = @request.auth.id || project.leader = @request.auth.id || " + FIN,
    viewRule: "user = @request.auth.id || project.leader = @request.auth.id || " + FIN,
    createRule: "user = @request.auth.id",
    updateRule: "user = @request.auth.id || " + ADMIN,
    deleteRule: "user = @request.auth.id || " + ADMIN,
    fields: [
      { ...rel("user", users, { cascadeDelete: true }), required: true },
      { ...project, required: true }, rel("task", tareas),
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "horas", type: "number", required: true, min: 0.25, max: 24 }, txt("nota", 500),
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_horas_fecha ON horas (fecha)"],
  }));
  app.save(new Collection({
    type: "base", name: "cobros",
    listRule: "project.leader = @request.auth.id || " + FIN, viewRule: "project.leader = @request.auth.id || " + FIN,
    createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { ...project, required: true },
      { name: "concepto", type: "text", required: true, max: 200 }, { name: "valor", type: "number", required: true, min: 0 },
      txt("fechaEsperada", 10),
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["pendiente", "facturado", "pagado"] },
      txt("factura", 80), txt("fechaPago", 10), txt("notas", 1000),
      ...stamps,
    ],
  }));
  app.save(new Collection({
    type: "base", name: "tarifas",
    listRule: FIN, viewRule: FIN, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { ...rel("user", users, { cascadeDelete: true }), required: true },
      { name: "valorHora", type: "number", required: true, min: 0 },
      ...stamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tarifas_user ON tarifas (user)"],
  }));

  // ---- ausencias ----
  app.save(new Collection({
    type: "base", name: "ausencias",
    listRule: AUTH, viewRule: AUTH,
    createRule: "user = @request.auth.id || " + ADMIN, updateRule: "user = @request.auth.id || " + ADMIN, deleteRule: "user = @request.auth.id || " + ADMIN,
    fields: [
      { ...rel("user", users, { cascadeDelete: true }), required: true },
      { name: "desde", type: "text", required: true, max: 10 }, { name: "hasta", type: "text", required: true, max: 10 },
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["vacaciones", "incapacidad", "permiso", "fuera", "otro"] },
      txt("nota", 300),
      ...stamps,
    ],
  }));

  // ---- solicitudes internas entre áreas ----
  app.save(new Collection({
    type: "base", name: "solicitudes",
    listRule: AUTH, viewRule: AUTH,
    createRule: "solicitante = @request.auth.id",
    updateRule: "solicitante = @request.auth.id || " + ADMIN + " || @request.auth.areas ~ area",
    deleteRule: "solicitante = @request.auth.id || " + ADMIN,
    fields: [
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["render", "modelado", "impresion", "planos", "compra", "cotizacion", "otro"] },
      { name: "area", type: "select", required: true, maxSelect: 1, values: AREAS },
      rel("project", proyectos, { cascadeDelete: true }),
      { name: "titulo", type: "text", required: true, max: 200 }, txt("descripcion", 5000), txt("fechaNecesaria", 10),
      { name: "prioridad", type: "select", maxSelect: 1, values: ["normal", "urgente"] },
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["nueva", "aceptada", "lista", "rechazada"] },
      { ...rel("solicitante", users), required: true }, rel("atiende", users), rel("tarea", tareas),
      txt("respuesta", 2000), txt("ruta", 1000),
      ...stamps,
    ],
  }));

  // ---- revisión de imágenes con pines (la imagen se lee de su carpeta; aquí solo van los comentarios) ----
  app.save(new Collection({
    type: "base", name: "revisiones", ...open,
    fields: [
      { ...rel("task", tareas, { cascadeDelete: true }), required: true }, rel("project", proyectos, { cascadeDelete: true }),
      { name: "titulo", type: "text", required: true, max: 200 }, { name: "ruta", type: "text", required: true, max: 1000 }, txt("version", 40),
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["abierta", "resuelta"] },
      { name: "pins", type: "json", maxSize: 500000 }, rel("by", users),
      ...stamps,
    ],
  }));
}, (app) => {
  for (const name of ["revisiones", "solicitudes", "ausencias", "tarifas", "cobros", "horas", "materiales", "contactos", "visitas", "envios", "planos", "tramites"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) { /* ya no existe */ }
  }
  const tareas = app.findCollectionByNameOrId("tareas");
  for (const f of ["origen", "parent", "dependsOn"]) tareas.fields.removeByName(f);
  app.save(tareas);
  const proyectos = app.findCollectionByNameOrId("proyectos");
  for (const f of ["salud", "saludNota", "saludFecha"]) proyectos.fields.removeByName(f);
  app.save(proyectos);
});
