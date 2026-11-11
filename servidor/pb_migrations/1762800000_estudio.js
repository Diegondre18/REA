/// <reference path="../pb_data/types.d.ts" />
// Versión 2: el Cerebro pasa de renders a todo el estudio.
// Proyectos, tareas (antes "renders"), eventos (reuniones con cliente, comités y entregas),
// planes de entregables con vistos buenos, reportes de comité y notificaciones.
const AUTH = "@request.auth.id != ''";
const DIRECTOR = "@request.auth.role = 'director'";
const AREAS = ["arquitectura", "interior", "visualizacion", "administracion", "direccion"];
const KINDS = ["diseno", "planos", "modelado", "render", "presentacion", "documento", "obra", "gestion", "otro"];

migrate((app) => {
  const txt = (name, max) => ({ name, type: "text", max });
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
  const open = { listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH };

  // ---- personas: área, rol y estado ----
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("renderId");
  users.fields.add(new Field({ name: "taskId", type: "text", max: 40 }));
  users.fields.add(new Field({ name: "role", type: "select", maxSelect: 1, values: ["director", "miembro"] }));
  users.fields.add(new Field({ name: "areas", type: "select", maxSelect: 5, values: AREAS }));
  users.fields.add(new Field({ name: "cargo", type: "text", max: 120 }));
  users.fields.add(new Field({ name: "estado", type: "text", max: 80 }));
  // Cada quien edita su perfil, menos su rol; el director edita a cualquiera.
  users.updateRule = "(id = @request.auth.id && @request.body.role:changed = false) || " + DIRECTOR;
  users.deleteRule = "id = @request.auth.id || " + DIRECTOR;
  app.save(users);

  // ---- proyectos ----
  const LEADER = "(leader = @request.auth.id || " + DIRECTOR + ")";
  const proyectos = new Collection({
    type: "base", name: "proyectos",
    listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: LEADER, deleteRule: LEADER,
    fields: [
      { name: "name", type: "text", required: true, max: 200 },
      txt("code", 20), txt("client", 200),
      { name: "phase", type: "select", maxSelect: 1, values: ["anteproyecto", "basico", "ejecucion", "licencia", "obra", "cerrado"] },
      { name: "status", type: "select", maxSelect: 1, values: ["activo", "pausado", "cerrado"] },
      { name: "leader", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "members", type: "relation", collectionId: users.id, maxSelect: 60, cascadeDelete: false },
      { name: "areas", type: "select", maxSelect: 5, values: AREAS },
      txt("start", 10), txt("end", 10), txt("folder", 1000), txt("notes", 5000),
      { name: "sample", type: "bool" },
      ...stamps,
    ],
  });
  app.save(proyectos);

  // ---- eventos: reuniones con cliente, comités internos y entregas ----
  const eventos = new Collection({
    type: "base", name: "eventos", ...open,
    fields: [
      { name: "project", type: "relation", collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["cliente", "comite", "entrega", "interna"] },
      { name: "title", type: "text", required: true, max: 200 },
      { name: "date", type: "text", required: true, max: 10 },
      txt("time", 5),
      { name: "duration", type: "number", min: 0, max: 1440 },
      { name: "attendees", type: "relation", collectionId: users.id, maxSelect: 60, cascadeDelete: false },
      txt("place", 300), txt("meetUrl", 500), txt("agenda", 5000), txt("acta", 20000), txt("calendarId", 300),
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_eventos_date ON eventos (date)"],
  });
  app.save(eventos);

  // ---- planes de entregables ----
  const PLAN_LEADER = "(project.leader = @request.auth.id || " + DIRECTOR + ")";
  const planes = new Collection({
    type: "base", name: "planes",
    listRule: AUTH, viewRule: AUTH,
    // El estado solo cambia por las rutas /api/lap/planes/…, que validan vistos buenos y sincronizan.
    createRule: AUTH + " && " + PLAN_LEADER + " && @request.body.status = 'borrador'",
    updateRule: PLAN_LEADER + " && @request.body.status:changed = false",
    deleteRule: PLAN_LEADER + " && status = 'borrador'",
    fields: [
      { name: "project", type: "relation", required: true, collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true },
      { name: "version", type: "number", min: 1 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["borrador", "en_aprobacion", "aprobado", "reemplazado"] },
      txt("notes", 5000),
      { name: "createdBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "approvedBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      txt("approvedAt", 30), txt("sentAt", 30),
      ...stamps,
    ],
  });
  app.save(planes);

  const ITEM_RULE = "plan.status = 'borrador' && (plan.project.leader = @request.auth.id || " + DIRECTOR + ")";
  app.save(new Collection({
    type: "base", name: "plan_items",
    listRule: AUTH, viewRule: AUTH, createRule: AUTH + " && " + ITEM_RULE, updateRule: ITEM_RULE, deleteRule: ITEM_RULE,
    fields: [
      { name: "plan", type: "relation", required: true, collectionId: planes.id, maxSelect: 1, cascadeDelete: true },
      { name: "key", type: "text", required: true, max: 40 }, // se conserva entre versiones del plan
      { name: "date", type: "text", required: true, max: 10 },
      txt("end", 10),
      { name: "content", type: "text", required: true, max: 500 },
      { name: "area", type: "select", maxSelect: 1, values: AREAS },
      { name: "kind", type: "select", maxSelect: 1, values: KINDS },
      { name: "assignees", type: "relation", collectionId: users.id, maxSelect: 60, cascadeDelete: false },
      { name: "meeting", type: "relation", collectionId: eventos.id, maxSelect: 1, cascadeDelete: false },
      { name: "order", type: "number" },
      ...stamps,
    ],
  }));

  // Visto bueno de cada integrante: solo lo escribe la propia persona y solo mientras el plan está en aprobación.
  const VISTO = "user = @request.auth.id && plan.status = 'en_aprobacion' && plan.project.members.id ?= @request.auth.id";
  app.save(new Collection({
    type: "base", name: "vistos",
    listRule: AUTH, viewRule: AUTH, createRule: VISTO, updateRule: VISTO, deleteRule: null,
    fields: [
      { name: "plan", type: "relation", required: true, collectionId: planes.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "verdict", type: "select", required: true, maxSelect: 1, values: ["ok", "cambios"] },
      txt("comment", 1000),
      ...stamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_vistos_plan_user ON vistos (plan, user)"],
  }));

  // ---- tareas: se crea la colección nueva y se traen los renders de la versión 1 ----
  const tareas = new Collection({
    type: "base", name: "tareas", ...open,
    fields: [
      { name: "title", type: "text", required: true, max: 300 },
      { name: "project", type: "relation", collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true },
      { name: "area", type: "select", maxSelect: 1, values: AREAS },
      { name: "kind", type: "select", maxSelect: 1, values: KINDS },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pendiente", "en_curso", "revision", "terminado"] },
      txt("stage", 20), // etapa de visualización: escena, render o post
      { name: "progress", type: "number", min: 0, max: 100 },
      { name: "assignees", type: "relation", collectionId: users.id, maxSelect: 60, cascadeDelete: false },
      txt("start", 10), txt("due", 10), txt("doneAt", 10),
      { name: "meeting", type: "relation", collectionId: eventos.id, maxSelect: 1, cascadeDelete: false },
      { name: "plan", type: "relation", collectionId: planes.id, maxSelect: 1, cascadeDelete: false },
      txt("planKey", 40),
      txt("engine", 80), txt("resolution", 40), txt("version", 40), txt("path", 1000), txt("notes", 5000),
      { name: "updatedBy", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...stamps,
    ],
    indexes: [
      "CREATE INDEX idx_tareas_status ON tareas (status)",
      "CREATE INDEX idx_tareas_project ON tareas (project)",
    ],
  });
  app.save(tareas);

  // Datos de la versión 1: cada nombre de proyecto se vuelve un proyecto y cada render una tarea de Visualización.
  let old = [];
  try { old = app.findRecordsByFilter("renders", "id != ''", "", 5000, 0); } catch (e) { old = []; }
  const byName = {};
  const projectFor = (name, sample) => {
    const key = name || "Sin proyecto";
    if (!byName[key]) {
      const p = new Record(proyectos);
      p.set("name", key); p.set("status", "activo"); p.set("areas", ["visualizacion"]); p.set("sample", !!sample);
      app.save(p);
      byName[key] = p.id;
    }
    return byName[key];
  };
  const STATUS = { cola: "pendiente", escena: "en_curso", render: "en_curso", post: "en_curso", revision: "revision", guardado: "terminado" };
  for (let i = 0; i < old.length; i++) {
    const r = old[i];
    const st = r.getString("status");
    const t = new Record(tareas);
    t.set("title", r.getString("title"));
    t.set("project", projectFor(r.getString("project"), r.getBool("sample")));
    t.set("area", "visualizacion"); t.set("kind", "render");
    t.set("status", STATUS[st] || "pendiente");
    t.set("stage", ["escena", "render", "post"].indexOf(st) >= 0 ? st : "");
    t.set("progress", r.getInt("progress"));
    for (const f of ["start", "due", "engine", "resolution", "version", "path"]) t.set(f, r.getString(f));
    t.set("doneAt", r.getString("savedAt"));
    const extra = [r.getString("type"), r.getString("artist") ? "Responsable: " + r.getString("artist") : ""].filter(Boolean).join(" · ");
    t.set("notes", [extra, r.getString("notes")].filter(Boolean).join("\n"));
    app.save(t);
  }
  let oldEntregas = [];
  try { oldEntregas = app.findRecordsByFilter("entregas", "id != ''", "", 5000, 0); } catch (e) { oldEntregas = []; }
  for (let i = 0; i < oldEntregas.length; i++) {
    const r = oldEntregas[i];
    const ev = new Record(eventos);
    ev.set("project", projectFor(r.getString("project"), r.getBool("sample")));
    ev.set("kind", "entrega"); ev.set("title", r.getString("title"));
    ev.set("date", r.getString("date") || "2026-01-01"); ev.set("agenda", r.getString("notes"));
    app.save(ev);
  }
  for (const name of ["renders", "entregas"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) { /* no existía */ }
  }

  // ---- reportes de comité: cada persona escribe el suyo ----
  const OWN = "user = @request.auth.id";
  app.save(new Collection({
    type: "base", name: "reportes",
    listRule: AUTH, viewRule: AUTH, createRule: OWN, updateRule: OWN, deleteRule: OWN,
    fields: [
      { name: "event", type: "relation", required: true, collectionId: eventos.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      txt("done", 3000), txt("next", 3000), txt("blockers", 3000),
      ...stamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reportes_event_user ON reportes (event, user)"],
  }));

  // ---- notificaciones: las crea el servidor; cada quien ve y marca las suyas ----
  app.save(new Collection({
    type: "base", name: "notificaciones",
    listRule: OWN, viewRule: OWN, createRule: null, updateRule: OWN, deleteRule: OWN,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      txt("kind", 30),
      { name: "title", type: "text", required: true, max: 200 },
      txt("body", 600), txt("route", 200),
      { name: "read", type: "bool" },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_notif_user ON notificaciones (user, created)"],
  }));

  // ---- actividad: se generaliza de renders a cualquier cosa del estudio ----
  const act = app.findCollectionByNameOrId("actividad");
  app.truncateCollection(act);
  act.fields.removeByName("renderId");
  act.fields.removeByName("project");
  act.fields.removeByName("kind");
  act.fields.add(new Field({ name: "kind", type: "text", required: true, max: 30 }));
  act.fields.add(new Field({ name: "ref", type: "text", max: 40 }));
  act.fields.add(new Field({ name: "project", type: "relation", collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true }));
  app.save(act);
}, (app) => {
  // Volver a la versión 1 no recupera los datos migrados: restaura una copia de pb_data.
  throw new Error("La versión 2 no se puede deshacer automáticamente. Restaura una copia de seguridad de pb_data.");
});
