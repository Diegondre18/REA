/// <reference path="../pb_data/types.d.ts" />
// Gestión: área nueva, finanzas de proyecto (contrato con el cliente, horas y margen), presupuesto,
// control de costos, flujo de caja, contratos con proveedores (adicionales aparte) y sus pagos,
// gastos fijos de la oficina, tiempo trabajado por proyecto (automático) y el premio de la semana.
migrate((app) => {
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const FIN = "(" + ADMIN + " || @request.auth.areas ~ 'administracion' || @request.auth.areas ~ 'gestion')";
  const users = app.findCollectionByNameOrId("users");
  const proyectos = app.findCollectionByNameOrId("proyectos");
  const tareas = app.findCollectionByNameOrId("tareas");
  const contactos = app.findCollectionByNameOrId("contactos");
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];

  // ---- área Gestión en todas las listas de áreas ----
  const AREAS = ["arquitectura", "interior", "visualizacion", "administracion", "direccion", "gestion"];
  for (const [col, name] of [["users", "areas"], ["proyectos", "areas"], ["tareas", "area"], ["plan_items", "area"], ["solicitudes", "area"]]) {
    let c;
    try { c = app.findCollectionByNameOrId(col); } catch (e) { continue; }
    const f = c.fields.getByName(name);
    if (!f) continue;
    f.values = AREAS;
    if (name === "areas") f.maxSelect = 6;
    app.save(c);
  }
  // Las finanzas también las ve y lleva Gestión.
  const OLD = "@request.auth.areas ~ 'administracion')";
  const NEW = "@request.auth.areas ~ 'administracion' || @request.auth.areas ~ 'gestion')";
  for (const name of ["horas", "cobros", "tarifas"]) {
    const c = app.findCollectionByNameOrId(name);
    for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      const v = c[k];
      if (v !== null && v !== undefined) c[k] = String(v).split(OLD).join(NEW);
    }
    app.save(c);
  }
  // Ajustes de gestión (horario, recargo de horas extra…): los cambia Dirección o Gestión.
  const ajustes = app.findCollectionByNameOrId("ajustes");
  ajustes.createRule = ADMIN + " || (" + FIN + " && @request.body.clave = 'gestion')";
  ajustes.updateRule = ADMIN + " || (" + FIN + " && clave = 'gestion')";
  app.save(ajustes);
  // Turno de almuerzo del viernes de cada persona: 12 (12:00–1:00) o 13 (1:00–2:00).
  const users2 = app.findCollectionByNameOrId("users"); // ya con el área Gestión
  users2.fields.add(new Field({ name: "almuerzoViernes", type: "select", maxSelect: 1, values: ["12", "13"] }));
  app.save(users2);

  const LEADS = "proyecto.leader = @request.auth.id || proyecto.apoyo = @request.auth.id";
  const VER = "(" + FIN + " || " + LEADS + ")";
  const proyecto = { name: "proyecto", type: "relation", collectionId: proyectos.id, maxSelect: 1, cascadeDelete: true };

  // ---- finanzas de cada proyecto (lo que no debe ver todo el equipo) ----
  app.save(new Collection({
    type: "base", name: "proyecto_finanzas",
    listRule: VER, viewRule: VER, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { ...proyecto, required: true },
      { name: "valorContrato", type: "number", min: 0 }, // lo que paga el cliente al estudio (diseño y obra)
      { name: "horasPresupuesto", type: "number", min: 0 },
      { name: "margenObjetivo", type: "number", min: 0, max: 100 },
      { name: "notas", type: "text", max: 2000 },
      ...stamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_pfin_proyecto ON proyecto_finanzas (proyecto)"],
  }));

  // ---- presupuesto (se importa de Excel) ----
  app.save(new Collection({
    type: "base", name: "presupuesto",
    listRule: VER, viewRule: VER, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { ...proyecto, required: true },
      { name: "capitulo", type: "text", max: 200 },
      { name: "codigo", type: "text", max: 40 },
      { name: "descripcion", type: "text", required: true, max: 1000 },
      { name: "unidad", type: "text", max: 30 },
      { name: "cantidad", type: "number" },
      { name: "valorUnitario", type: "number" },
      { name: "total", type: "number" },
      { name: "orden", type: "number" },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_presupuesto_proyecto ON presupuesto (proyecto, orden)"],
  }));

  // ---- contratos con proveedores, adicionales (aparte) y pagos ----
  const contratos = new Collection({
    type: "base", name: "contratos",
    listRule: VER, viewRule: VER, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { ...proyecto, required: true },
      { name: "proveedor", type: "relation", collectionId: contactos.id, maxSelect: 1, cascadeDelete: false },
      { name: "proveedorNombre", type: "text", required: true, max: 200 },
      { name: "objeto", type: "text", required: true, max: 500 },
      { name: "capitulo", type: "text", max: 200 },
      { name: "valor", type: "number", required: true, min: 0 },
      { name: "fecha", type: "text", max: 10 },
      { name: "estado", type: "select", maxSelect: 1, values: ["vigente", "terminado"] },
      { name: "notas", type: "text", max: 2000 },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_contratos_proyecto ON contratos (proyecto)"],
  });
  app.save(contratos);
  const VER_C = "(" + FIN + " || contrato.proyecto.leader = @request.auth.id || contrato.proyecto.apoyo = @request.auth.id)";
  const contrato = { name: "contrato", type: "relation", required: true, collectionId: contratos.id, maxSelect: 1, cascadeDelete: true };
  app.save(new Collection({
    type: "base", name: "adicionales",
    listRule: VER_C, viewRule: VER_C, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      contrato,
      { name: "descripcion", type: "text", required: true, max: 500 },
      { name: "valor", type: "number", required: true, min: 0 },
      { name: "fecha", type: "text", max: 10 },
      { name: "aprobado", type: "bool" },
      ...stamps,
    ],
  }));
  app.save(new Collection({
    type: "base", name: "pagos_proveedor",
    listRule: VER_C, viewRule: VER_C, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      contrato,
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "valor", type: "number", required: true, min: 0 },
      { name: "concepto", type: "text", max: 300 },
      { name: "factura", type: "text", max: 80 },
      { name: "adicional", type: "bool" }, // pago de un adicional, se muestra aparte
      ...stamps,
    ],
  }));

  // ---- control de costos (gastos reales de cada proyecto; se registran o se importan de Excel) ----
  app.save(new Collection({
    type: "base", name: "costos",
    listRule: VER, viewRule: VER, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { ...proyecto, required: true },
      { name: "fecha", type: "text", max: 10 },
      { name: "capitulo", type: "text", max: 200 },
      { name: "codigo", type: "text", max: 40 },
      { name: "descripcion", type: "text", required: true, max: 1000 },
      { name: "proveedor", type: "text", max: 200 },
      { name: "factura", type: "text", max: 80 },
      { name: "tipo", type: "select", maxSelect: 1, values: ["material", "mano_obra", "equipo", "transporte", "otro"] },
      { name: "valor", type: "number", required: true },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_costos_proyecto ON costos (proyecto, fecha)"],
  }));

  // ---- flujo de caja (movimientos reales o proyectados; con o sin proyecto) ----
  app.save(new Collection({
    type: "base", name: "flujo",
    listRule: FIN, viewRule: FIN, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["ingreso", "egreso"] },
      { name: "concepto", type: "text", required: true, max: 300 },
      { name: "categoria", type: "text", max: 80 },
      { name: "valor", type: "number", required: true, min: 0 },
      { name: "estado", type: "select", required: true, maxSelect: 1, values: ["real", "proyectado"] },
      { name: "proyecto", type: "relation", collectionId: proyectos.id, maxSelect: 1, cascadeDelete: false },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_flujo_fecha ON flujo (fecha)"],
  }));

  // ---- gastos fijos de la oficina ----
  app.save(new Collection({
    type: "base", name: "gastos_fijos",
    listRule: FIN, viewRule: FIN, createRule: FIN, updateRule: FIN, deleteRule: FIN,
    fields: [
      { name: "concepto", type: "text", required: true, max: 200 },
      { name: "categoria", type: "select", required: true, maxSelect: 1,
        values: ["arriendo", "servicios", "nomina", "seguridad_social", "software", "contabilidad", "impuestos", "mantenimiento", "transporte", "otro"] },
      { name: "valor", type: "number", required: true, min: 0 },
      { name: "periodicidad", type: "select", required: true, maxSelect: 1, values: ["mensual", "bimestral", "trimestral", "semestral", "anual"] },
      { name: "diaPago", type: "number", min: 1, max: 31 },
      { name: "activo", type: "bool" },
      { name: "notas", type: "text", max: 1000 },
      ...stamps,
    ],
  }));

  // ---- tiempo trabajado (automático con «Estoy trabajando en esto», o a mano) ----
  const VER_T = "(user = @request.auth.id || " + FIN + " || proyecto.leader = @request.auth.id || proyecto.apoyo = @request.auth.id)";
  app.save(new Collection({
    type: "base", name: "tiempos",
    listRule: VER_T, viewRule: VER_T,
    createRule: "user = @request.auth.id || " + FIN,
    updateRule: "user = @request.auth.id || " + FIN,
    deleteRule: "user = @request.auth.id || " + FIN,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "proyecto", type: "relation", collectionId: proyectos.id, maxSelect: 1, cascadeDelete: false },
      { name: "tarea", type: "relation", collectionId: tareas.id, maxSelect: 1, cascadeDelete: false },
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "minutos", type: "number", min: 0 }, // dentro del horario
      { name: "extra", type: "number", min: 0 },   // fuera del horario, almuerzo o fin de semana
      { name: "auto", type: "bool" },
      { name: "nota", type: "text", max: 300 },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_tiempos_user_fecha ON tiempos (user, fecha)", "CREATE INDEX idx_tiempos_proyecto ON tiempos (proyecto, fecha)"],
  }));

  // ---- premio de la semana (el primero del ranking de la semana anterior) ----
  app.save(new Collection({
    type: "base", name: "premios_semana",
    listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: null, deleteRule: ADMIN,
    fields: [
      { name: "semana", type: "text", required: true, max: 10 },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "puntos", type: "number" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_premios_semana ON premios_semana (semana)"],
  }));
}, (app) => {
  for (const c of ["premios_semana", "tiempos", "gastos_fijos", "flujo", "costos", "pagos_proveedor", "adicionales", "contratos", "presupuesto", "proyecto_finanzas"]) {
    try { app.delete(app.findCollectionByNameOrId(c)); } catch (e) { /* ya no está */ }
  }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("almuerzoViernes");
  app.save(users);
});
