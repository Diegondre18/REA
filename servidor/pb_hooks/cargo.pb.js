/// <reference path="../pb_data/types.d.ts" />
// A cargo del proyecto: el Director creativo, quien lo dirige y uno o más apoyos (opcionales).
onRecordCreateRequest((e) => { require(`${__hooks}/lib.js`).validarCargo(e.app, e.record, true); e.next(); }, "proyectos");
onRecordUpdateRequest((e) => { require(`${__hooks}/lib.js`).validarCargo(e.app, e.record, false); e.next(); }, "proyectos");
