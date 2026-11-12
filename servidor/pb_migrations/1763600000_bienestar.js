/// <reference path="../pb_data/types.d.ts" />
// Bienestar y vida de la oficina: estado "En pausa", cuenta para la pantalla de la oficina, cumpleaños,
// premios del muñeco, registro privado de pausas y descansos, cierre del día y ajustes del estudio.
migrate((app) => {
  const AUTH = "@request.auth.id != ''";
  const OWN = "user = @request.auth.id";
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  const users = app.findCollectionByNameOrId("users");
  users.fields.getByName("presencia").values = ["disponible", "no_molestar", "reunion", "almuerzo", "pausa", "fuera"];
  users.fields.getByName("role").values = ["director", "miembro", "maestro", "pantalla"];
  users.fields.add(new Field({ name: "cumple", type: "text", max: 5, pattern: "^$|^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" }));
  users.fields.add(new Field({ name: "premios", type: "json", maxSize: 1000 }));
  app.save(users);

  // Pausas activas, descansos y bloques de trabajo del Pomodoro: privado, cada quien ve lo suyo.
  app.save(new Collection({
    type: "base", name: "bienestar",
    listRule: OWN, viewRule: OWN, createRule: OWN, updateRule: OWN, deleteRule: OWN,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "pausas", type: "number", min: 0 }, { name: "descansos", type: "number", min: 0 }, { name: "bloques", type: "number", min: 0 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_bienestar_user_fecha ON bienestar (user, fecha)"],
  }));

  // Cierre del día: qué hice y qué sigue. Lo ve la persona y Dirección.
  app.save(new Collection({
    type: "base", name: "cierres",
    listRule: OWN + " || " + ADMIN, viewRule: OWN + " || " + ADMIN, createRule: OWN, updateRule: OWN, deleteRule: OWN,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "fecha", type: "text", required: true, max: 10 },
      { name: "hice", type: "text", max: 3000 }, { name: "manana", type: "text", max: 3000 },
      { name: "items", type: "json", maxSize: 20000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_cierres_user_fecha ON cierres (user, fecha)"],
  }));

  // Ajustes del estudio (por ahora: horas de pausa activa). Los cambia Dirección.
  app.save(new Collection({
    type: "base", name: "ajustes",
    listRule: AUTH, viewRule: AUTH, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "clave", type: "text", required: true, max: 40 },
      { name: "valor", type: "json", maxSize: 5000 },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_ajustes_clave ON ajustes (clave)"],
  }));
}, (app) => {
  for (const c of ["bienestar", "cierres", "ajustes"]) app.delete(app.findCollectionByNameOrId(c));
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["cumple", "premios"]) users.fields.removeByName(f);
  users.fields.getByName("presencia").values = ["disponible", "no_molestar", "reunion", "almuerzo", "fuera"];
  users.fields.getByName("role").values = ["director", "miembro", "maestro"];
  app.save(users);
});
