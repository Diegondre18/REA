/// <reference path="../pb_data/types.d.ts" />
// Más de un apoyo por proyecto: "apoyo" sigue siendo el primero y "apoyos" guarda los demás que se
// agregan con "+". Todos tienen los mismos permisos que quien dirige el proyecto.
const RE = /([\w.]*?)apoyo = @request\.auth\.id/g;
const OTRO = /\s*\|\|\s*[\w.]*?apoyos(?:\.id)? \?= @request\.auth\.id/g;
function cadaRegla(app, fn) {
  for (const c of app.findAllCollections()) {
    let cambio = false;
    for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      const v = c[k];
      if (v === null || v === undefined) continue;
      const nuevo = fn(String(v));
      if (nuevo !== String(v)) { c[k] = nuevo; cambio = true; }
    }
    if (cambio) app.save(c);
  }
}
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const proyectos = app.findCollectionByNameOrId("proyectos");
  proyectos.fields.add(new Field({ name: "apoyos", type: "relation", collectionId: users.id, maxSelect: 20, cascadeDelete: false }));
  app.save(proyectos);
  cadaRegla(app, (r) => r.replace(OTRO, "").replace(RE, (m, pre) => pre + "apoyo = @request.auth.id || " + pre + "apoyos.id ?= @request.auth.id"));
}, (app) => {
  cadaRegla(app, (r) => r.replace(OTRO, ""));
  const proyectos = app.findCollectionByNameOrId("proyectos");
  proyectos.fields.removeByName("apoyos");
  app.save(proyectos);
});
