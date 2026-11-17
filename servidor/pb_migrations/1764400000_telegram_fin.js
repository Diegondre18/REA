/// <reference path="../pb_data/types.d.ts" />
// Telegram, etapa 3: la foto de la factura o del comprobante queda guardada con el gasto, el pago a
// proveedor o el movimiento de caja.
migrate((app) => {
  for (const name of ["costos", "pagos_proveedor", "flujo"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.add(new Field({ name: "soporte", type: "file", maxSelect: 1, maxSize: 15 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"], thumbs: ["480x0"] }));
    app.save(c);
  }
}, (app) => {
  for (const name of ["costos", "pagos_proveedor", "flujo"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.removeByName("soporte");
    app.save(c);
  }
});
