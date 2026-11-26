/// <reference path="../pb_data/types.d.ts" />
// Anuncios de cualquiera del equipo: cada quien publica a su nombre y edita o quita los suyos. Marcarlos como
// "importante" (suenan aunque estén en No molestar) y editar los de otros sigue siendo de Dirección.
migrate((app) => {
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const c = app.findCollectionByNameOrId("anuncios");
  c.createRule = "@request.auth.id != '' && @request.body.by = @request.auth.id && (@request.body.importante:isset = false || @request.body.importante = false || " + ADMIN + ")";
  c.updateRule = "(by = @request.auth.id && (@request.body.importante:isset = false || @request.body.importante = false || " + ADMIN + ")) || " + ADMIN;
  c.deleteRule = "by = @request.auth.id || " + ADMIN;
  app.save(c);
}, (app) => {
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const c = app.findCollectionByNameOrId("anuncios");
  c.createRule = ADMIN; c.updateRule = ADMIN; c.deleteRule = ADMIN;
  app.save(c);
});
