/// <reference path="../pb_data/types.d.ts" />
// Roles: se agrega el perfil maestro (soporte, por si algo falla) con los mismos permisos que la dirección.
// El cupo único de Dirección creativa y el equipo obligatorio al registrarse se validan en pb_hooks/lib.js.
const AUTH = "@request.auth.id != ''";

function rules(admin) {
  const lead = "(leader = @request.auth.id || " + admin + ")";
  const planLead = "(project.leader = @request.auth.id || " + admin + ")";
  const item = "plan.status = 'borrador' && (plan.project.leader = @request.auth.id || " + admin + ")";
  return {
    users: { updateRule: "(id = @request.auth.id && @request.body.role:changed = false) || " + admin, deleteRule: "id = @request.auth.id || " + admin },
    proyectos: { updateRule: lead, deleteRule: lead },
    planes: {
      createRule: AUTH + " && " + planLead + " && @request.body.status = 'borrador'",
      updateRule: planLead + " && @request.body.status:changed = false",
      deleteRule: planLead + " && status = 'borrador'",
    },
    plan_items: { createRule: AUTH + " && " + item, updateRule: item, deleteRule: item },
  };
}

function apply(app, set) {
  for (const name in set) {
    const c = app.findCollectionByNameOrId(name);
    for (const r in set[name]) c[r] = set[name][r];
    app.save(c);
  }
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("role").values = ["director", "miembro", "maestro"];
  app.save(users);
  apply(app, rules("(@request.auth.role = 'director' || @request.auth.role = 'maestro')"));
}, (app) => {
  apply(app, rules("@request.auth.role = 'director'"));
});
