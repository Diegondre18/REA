/// <reference path="../pb_data/types.d.ts" />
// A cargo de cada proyecto: el Director creativo (siempre), la directora o director del proyecto (leader)
// y un apoyo opcional. El apoyo tiene los mismos permisos que quien dirige el proyecto.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const proyectos = app.findCollectionByNameOrId("proyectos");
  proyectos.fields.add(new Field({ name: "apoyo", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  proyectos.updateRule = proyectos.updateRule.replace("leader = @request.auth.id ||", "leader = @request.auth.id || apoyo = @request.auth.id ||");
  app.save(proyectos);
  const swap = (name, from, to) => {
    const c = app.findCollectionByNameOrId(name);
    for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) { const v = c[k]; if (v !== null && v !== undefined) c[k] = String(v).split(from).join(to); }
    app.save(c);
  };
  swap("planes", "project.leader = @request.auth.id ||", "project.leader = @request.auth.id || project.apoyo = @request.auth.id ||");
  swap("plan_items", "plan.project.leader = @request.auth.id ||", "plan.project.leader = @request.auth.id || plan.project.apoyo = @request.auth.id ||");
  swap("cobros", "project.leader = @request.auth.id ||", "project.leader = @request.auth.id || project.apoyo = @request.auth.id ||");
}, (app) => {
  const swap = (name, from, to) => {
    const c = app.findCollectionByNameOrId(name);
    for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) { const v = c[k]; if (v !== null && v !== undefined) c[k] = String(v).split(from).join(to); }
    app.save(c);
  };
  swap("planes", " project.apoyo = @request.auth.id ||", "");
  swap("plan_items", " plan.project.apoyo = @request.auth.id ||", "");
  swap("cobros", " project.apoyo = @request.auth.id ||", "");
  const proyectos = app.findCollectionByNameOrId("proyectos");
  proyectos.updateRule = proyectos.updateRule.replace(" apoyo = @request.auth.id ||", "");
  proyectos.fields.removeByName("apoyo");
  app.save(proyectos);
});
