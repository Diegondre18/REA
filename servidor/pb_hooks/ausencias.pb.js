/// <reference path="../pb_data/types.d.ts" />
// Nadie recibe tareas ni entregables del plan para fechas en que registró que no va a estar.

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const msg = lib.conflictoAusencia(e.app, e.record.getStringSlice("assignees"), e.record.getString("start"), e.record.getString("due"));
  if (msg) throw new BadRequestError(msg);
  e.next();
}, "tareas");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const o = e.record.original();
  const cambio = JSON.stringify(lib.arr(o.getStringSlice("assignees"))) !== JSON.stringify(lib.arr(e.record.getStringSlice("assignees"))) ||
    o.getString("start") !== e.record.getString("start") || o.getString("due") !== e.record.getString("due");
  if (cambio) {
    const msg = lib.conflictoAusencia(e.app, e.record.getStringSlice("assignees"), e.record.getString("start"), e.record.getString("due"));
    if (msg) throw new BadRequestError(msg);
  }
  e.next();
}, "tareas");

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const msg = lib.conflictoAusencia(e.app, e.record.getStringSlice("assignees"), e.record.getString("date"), e.record.getString("end") || e.record.getString("date"));
  if (msg) throw new BadRequestError(msg);
  e.next();
}, "plan_items");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const o = e.record.original();
  const cambio = JSON.stringify(lib.arr(o.getStringSlice("assignees"))) !== JSON.stringify(lib.arr(e.record.getStringSlice("assignees"))) ||
    o.getString("date") !== e.record.getString("date") || o.getString("end") !== e.record.getString("end");
  if (cambio) {
    const msg = lib.conflictoAusencia(e.app, e.record.getStringSlice("assignees"), e.record.getString("date"), e.record.getString("end") || e.record.getString("date"));
    if (msg) throw new BadRequestError(msg);
  }
  e.next();
}, "plan_items");
