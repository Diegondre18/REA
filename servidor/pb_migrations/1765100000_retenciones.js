/// <reference path="../pb_data/types.d.ts" />
// Retenciones del cliente: si practica ReteIVA, si está inscrito en Bogotá (ReteICA de la SHD) y su tipo para la
// tarifa de ReteICA. Cada contrato guarda qué retenciones aplica (concepto de retención en la fuente, ReteIVA, ReteICA).
migrate((app) => {
  const contactos = app.findCollectionByNameOrId("contactos");
  contactos.fields.add(new Field({ name: "reteIva", type: "bool" }));
  contactos.fields.add(new Field({ name: "icaBogota", type: "bool" }));
  contactos.fields.add(new Field({ name: "icaTipo", type: "text", max: 40 }));
  app.save(contactos);
  const pf = app.findCollectionByNameOrId("proyecto_finanzas");
  pf.fields.add(new Field({ name: "retenciones", type: "json", maxSize: 5000 })); // { fuente, iva, ica, icaTipo }
  app.save(pf);
}, (app) => {
  const pf = app.findCollectionByNameOrId("proyecto_finanzas");
  pf.fields.removeByName("retenciones");
  app.save(pf);
  const contactos = app.findCollectionByNameOrId("contactos");
  for (const n of ["reteIva", "icaBogota", "icaTipo"]) contactos.fields.removeByName(n);
  app.save(contactos);
});
