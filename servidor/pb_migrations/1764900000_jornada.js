/// <reference path="../pb_data/types.d.ts" />
// Reuniones que se repiten (semanal, quincenal o mensual), asistencia a cada reunión (se pregunta a los
// 40 minutos de empezar) e identificación de los clientes del directorio.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const eventos = app.findCollectionByNameOrId("eventos");
  eventos.fields.add(new Field({ name: "frecuencia", type: "select", maxSelect: 1, values: ["semanal", "quincenal", "mensual"] }));
  eventos.fields.add(new Field({ name: "serie", type: "text", max: 20 })); // id de la primera reunión de la serie
  app.save(eventos);

  const AUTH = "@request.auth.id != ''";
  app.save(new Collection({
    type: "base", name: "asistencias",
    listRule: AUTH, viewRule: AUTH,
    createRule: "user = @request.auth.id", updateRule: "user = @request.auth.id", deleteRule: "user = @request.auth.id",
    fields: [
      { name: "evento", type: "relation", required: true, collectionId: eventos.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "asistio", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_asistencias_ev_user ON asistencias (evento, user)"],
  }));

  const contactos = app.findCollectionByNameOrId("contactos");
  contactos.fields.add(new Field({ name: "tipoId", type: "select", maxSelect: 1, values: ["CC", "NIT", "CE"] }));
  contactos.fields.add(new Field({ name: "identificacion", type: "text", max: 40 }));
  app.save(contactos);
}, (app) => {
  const contactos = app.findCollectionByNameOrId("contactos");
  contactos.fields.removeByName("tipoId"); contactos.fields.removeByName("identificacion");
  app.save(contactos);
  app.delete(app.findCollectionByNameOrId("asistencias"));
  const eventos = app.findCollectionByNameOrId("eventos");
  eventos.fields.removeByName("frecuencia"); eventos.fields.removeByName("serie");
  app.save(eventos);
});
