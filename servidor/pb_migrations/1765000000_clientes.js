/// <reference path="../pb_data/types.d.ts" />
// El cliente de cada proyecto sale del directorio, y cada contacto tiene la carpeta de sus documentos
// (RUT, cámara de comercio…): una ruta de la red o un enlace de Dropbox o Drive. Solo se guarda el texto.
migrate((app) => {
  const contactos = app.findCollectionByNameOrId("contactos");
  contactos.fields.add(new Field({ name: "carpeta", type: "text", max: 1000 }));
  app.save(contactos);
  const proyectos = app.findCollectionByNameOrId("proyectos");
  proyectos.fields.add(new Field({ name: "cliente", type: "relation", collectionId: contactos.id, maxSelect: 1, cascadeDelete: false }));
  app.save(proyectos);
}, (app) => {
  const proyectos = app.findCollectionByNameOrId("proyectos");
  proyectos.fields.removeByName("cliente");
  app.save(proyectos);
  const contactos = app.findCollectionByNameOrId("contactos");
  contactos.fields.removeByName("carpeta");
  app.save(contactos);
});
