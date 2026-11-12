/// <reference path="../pb_data/types.d.ts" />
// A cargo del proyecto: dos cupos (Director creativo + quien dirige el proyecto), máximo tres con apoyo.
onRecordCreateRequest((e) => { require(`${__hooks}/lib.js`).validarCargo(e.app, e.record, true); e.next(); }, "proyectos");
onRecordUpdateRequest((e) => { require(`${__hooks}/lib.js`).validarCargo(e.app, e.record, false); e.next(); }, "proyectos");
