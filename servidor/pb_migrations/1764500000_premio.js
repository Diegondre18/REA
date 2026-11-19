/// <reference path="../pb_data/types.d.ts" />
// Premio del ranking: Administración o Dirección ponen el premio de cada semana o de cada mes.
// premios_semana pasa a guardar cualquier período (periodo + clave) con el texto del premio y el ganador;
// puntos_semana guarda el total de cada persona al cerrar cada semana, para sumar el mes.
migrate((app) => {
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const PREMIO = "(@request.auth.role = 'director' || @request.auth.role = 'maestro' || @request.auth.areas ~ 'administracion')";
  const users = app.findCollectionByNameOrId("users");

  const ps = app.findCollectionByNameOrId("premios_semana");
  ps.fields.getByName("user").required = false;
  ps.fields.getByName("semana").required = false;
  ps.fields.add(new Field({ name: "periodo", type: "select", maxSelect: 1, values: ["semana", "mes"] }));
  ps.fields.add(new Field({ name: "clave", type: "text", max: 10 }));
  ps.fields.add(new Field({ name: "premio", type: "text", max: 200 }));
  ps.fields.add(new Field({ name: "definidoPor", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
  // Cualquiera guarda el ganador cuando cierra el período; el texto del premio solo lo ponen Administración y Dirección.
  ps.createRule = AUTH + " && (@request.body.premio:isset = false || " + PREMIO + ")";
  ps.updateRule = PREMIO + " || (user = '' && @request.body.premio:isset = false && @request.body.periodo:isset = false && @request.body.clave:isset = false)";
  ps.deleteRule = ADMIN;
  app.save(ps);
  // Los registros de antes son semanales; después se cambia el índice único a (periodo, clave).
  app.db().newQuery("UPDATE premios_semana SET periodo = 'semana', clave = semana WHERE clave = '' OR clave IS NULL").execute();
  const ps2 = app.findCollectionByNameOrId("premios_semana");
  ps2.indexes = ["CREATE UNIQUE INDEX idx_premios_periodo ON premios_semana (periodo, clave)"];
  app.save(ps2);

  app.save(new Collection({
    type: "base", name: "puntos_semana",
    listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: null, deleteRule: ADMIN,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "semana", type: "text", required: true, max: 10 },
      { name: "total", type: "number" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_puntos_semana ON puntos_semana (user, semana)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("puntos_semana")); } catch (e) { /* ya no está */ }
  const ps = app.findCollectionByNameOrId("premios_semana");
  for (const f of ["periodo", "clave", "premio", "definidoPor"]) ps.fields.removeByName(f);
  ps.indexes = ["CREATE UNIQUE INDEX idx_premios_semana ON premios_semana (semana)"];
  app.save(ps);
});
