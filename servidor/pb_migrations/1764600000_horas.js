/// <reference path="../pb_data/types.d.ts" />
// Hora opcional en las tareas (inicio y entrega) y ausencias por horas ("sale a las 5", "llega a las 10").
migrate((app) => {
  const t = app.findCollectionByNameOrId("tareas");
  t.fields.add(new Field({ name: "startTime", type: "text", max: 5 }));
  t.fields.add(new Field({ name: "dueTime", type: "text", max: 5 }));
  app.save(t);
  const a = app.findCollectionByNameOrId("ausencias");
  a.fields.add(new Field({ name: "horaDesde", type: "text", max: 5 })); // el primer día, desde esta hora
  a.fields.add(new Field({ name: "horaHasta", type: "text", max: 5 })); // el último día, hasta esta hora
  app.save(a);
}, (app) => {
  const t = app.findCollectionByNameOrId("tareas");
  t.fields.removeByName("startTime"); t.fields.removeByName("dueTime"); app.save(t);
  const a = app.findCollectionByNameOrId("ausencias");
  a.fields.removeByName("horaDesde"); a.fields.removeByName("horaHasta"); app.save(a);
});
