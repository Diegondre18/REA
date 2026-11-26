/// <reference path="../pb_data/types.d.ts" />
// Nómina: salario base, variable y descuentos de cada persona (el costo por hora se calcula solo, mes a mes).
// Contrato con el cliente: por diseño (valor + IVA, adicionales) o por obra (AIU), a nombre de LAP o de JC.
migrate((app) => {
  const tarifas = app.findCollectionByNameOrId("tarifas");
  const vh = tarifas.fields.getByName("valorHora");
  vh.required = false;
  tarifas.fields.add(new Field({ name: "base", type: "number", min: 0 }));
  tarifas.fields.add(new Field({ name: "variable", type: "number", min: 0 }));
  tarifas.fields.add(new Field({ name: "descuentos", type: "json", maxSize: 20000 })); // [{ concepto, valor }]
  tarifas.fields.add(new Field({ name: "notas", type: "text", max: 1000 }));
  app.save(tarifas);

  const pf = app.findCollectionByNameOrId("proyecto_finanzas");
  pf.fields.add(new Field({ name: "tipoContrato", type: "select", maxSelect: 1, values: ["diseno", "obra"] }));
  pf.fields.add(new Field({ name: "entidad", type: "select", maxSelect: 1, values: ["lap", "jc"] }));
  pf.fields.add(new Field({ name: "valorDiseno", type: "number", min: 0 }));
  pf.fields.add(new Field({ name: "costoDirecto", type: "number", min: 0 }));
  pf.fields.add(new Field({ name: "pctAdmin", type: "number", min: 0, max: 100 }));
  pf.fields.add(new Field({ name: "pctImprevistos", type: "number", min: 0, max: 100 }));
  pf.fields.add(new Field({ name: "pctUtilidad", type: "number", min: 0, max: 100 }));
  pf.fields.add(new Field({ name: "adicionalesCliente", type: "json", maxSize: 50000 })); // [{ descripcion, valor, fecha }]
  app.save(pf);
}, (app) => {
  const pf = app.findCollectionByNameOrId("proyecto_finanzas");
  for (const n of ["tipoContrato", "entidad", "valorDiseno", "costoDirecto", "pctAdmin", "pctImprevistos", "pctUtilidad", "adicionalesCliente"]) pf.fields.removeByName(n);
  app.save(pf);
  const tarifas = app.findCollectionByNameOrId("tarifas");
  for (const n of ["base", "variable", "descuentos", "notas"]) tarifas.fields.removeByName(n);
  app.save(tarifas);
});
