/// <reference path="../pb_data/types.d.ts" />
// Respaldo externo: registro de cada copia que el PC servidor saca a otra carpeta (disco externo, NAS).
// Solo lo ven Dirección y el perfil maestro; lo escribe el servidor.
migrate((app) => {
  const ADMIN = "(@request.auth.role = 'director' || @request.auth.role = 'maestro')";
  app.save(new Collection({
    type: "base", name: "respaldos",
    listRule: ADMIN, viewRule: ADMIN, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "ok", type: "bool" },
      { name: "archivo", type: "text", max: 200 },
      { name: "tamano", type: "number", min: 0 },
      { name: "destino", type: "text", max: 1000 },
      { name: "error", type: "text", max: 1000 },
      { name: "motivo", type: "text", max: 20 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_respaldos_created ON respaldos (created)"],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("respaldos"));
});
