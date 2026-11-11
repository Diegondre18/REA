/// <reference path="../pb_data/types.d.ts" />
// Reglas de registro y avisos automáticos cuando alguien asigna, agenda o responde algo.

// Registro: solo correos del estudio. La primera cuenta queda como director; las demás, como miembro.
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  if (!e.hasSuperuserAuth()) {
    const email = e.record.getString("email").toLowerCase();
    if (lib.DOMINIO && !email.endsWith("@" + lib.DOMINIO)) {
      throw new BadRequestError("Usa tu correo @" + lib.DOMINIO + " para crear la cuenta.");
    }
    const directores = e.app.findRecordsByFilter("users", "role = 'director'", "", 1, 0);
    e.record.set("role", directores.length ? "miembro" : "director");
    e.record.set("emailVisibility", true);
    e.record.set("taskId", "");
  }
  e.next();
}, "users");

// Tareas: avisa a quien le asignan una (menos a quien hizo el cambio).
onRecordCreateRequest((e) => {
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const yo = e.auth ? e.auth.id : "";
    for (const u of lib.arr(e.record.getStringSlice("assignees"))) {
      if (u !== yo) lib.notificar(e.app, u, "tarea", "Nueva tarea: " + e.record.getString("title"),
        lib.primerNombre(e.auth) + " te la asignó" + (e.record.getString("due") ? " para el " + lib.fechaCorta(e.record.getString("due")) : "") + ".", "#tarea/" + e.record.id);
    }
  } catch (err) { console.log("aviso tarea:", err); }
}, "tareas");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const antes = lib.arr(e.record.original().getStringSlice("assignees"));
  const fechaAntes = e.record.original().getString("due");
  e.next();
  try {
    const yo = e.auth ? e.auth.id : "";
    const ahora = lib.arr(e.record.getStringSlice("assignees"));
    for (const u of ahora) {
      if (u === yo) continue;
      if (antes.indexOf(u) < 0) {
        lib.notificar(e.app, u, "tarea", "Te asignaron: " + e.record.getString("title"),
          lib.primerNombre(e.auth) + " te sumó a esta tarea" + (e.record.getString("due") ? ", para el " + lib.fechaCorta(e.record.getString("due")) : "") + ".", "#tarea/" + e.record.id);
      } else if (fechaAntes !== e.record.getString("due") && e.record.getString("due")) {
        lib.notificar(e.app, u, "tarea", "Cambió la fecha: " + e.record.getString("title"),
          "Ahora es para el " + lib.fechaCorta(e.record.getString("due")) + ".", "#tarea/" + e.record.id);
      }
    }
  } catch (err) { console.log("aviso tarea:", err); }
}, "tareas");

// Reuniones y comités: avisa a los asistentes al agendar o al mover la fecha.
onRecordCreateRequest((e) => {
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const yo = e.auth ? e.auth.id : "";
    const r = e.record;
    const cuando = lib.fechaCorta(r.getString("date")) + (r.getString("time") ? ", " + r.getString("time") : "");
    for (const u of lib.arr(r.getStringSlice("attendees"))) {
      if (u !== yo) lib.notificar(e.app, u, "evento", r.getString("title") + " · " + cuando, lib.primerNombre(e.auth) + " te incluyó.", "#evento/" + r.id);
    }
  } catch (err) { console.log("aviso evento:", err); }
}, "eventos");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const o = e.record.original();
  const antes = o.getString("date") + " " + o.getString("time");
  const asistian = lib.arr(o.getStringSlice("attendees"));
  e.next();
  try {
    const yo = e.auth ? e.auth.id : "";
    const r = e.record;
    const cuando = lib.fechaCorta(r.getString("date")) + (r.getString("time") ? ", " + r.getString("time") : "");
    const movida = antes !== r.getString("date") + " " + r.getString("time");
    for (const u of lib.arr(r.getStringSlice("attendees"))) {
      if (u === yo) continue;
      if (asistian.indexOf(u) < 0) lib.notificar(e.app, u, "evento", r.getString("title") + " · " + cuando, lib.primerNombre(e.auth) + " te incluyó.", "#evento/" + r.id);
      else if (movida) lib.notificar(e.app, u, "evento", "Se movió: " + r.getString("title"), "Ahora es el " + cuando + ".", "#evento/" + r.id);
    }
  } catch (err) { console.log("aviso evento:", err); }
}, "eventos");

// Proyectos: avisa a quien suman al equipo.
onRecordCreateRequest((e) => {
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const yo = e.auth ? e.auth.id : "";
    for (const u of lib.arr(e.record.getStringSlice("members"))) {
      if (u !== yo) lib.notificar(e.app, u, "proyecto", "Estás en el proyecto " + e.record.getString("name"), lib.primerNombre(e.auth) + " te sumó al equipo.", "#proyecto/" + e.record.id);
    }
  } catch (err) { console.log("aviso proyecto:", err); }
}, "proyectos");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  const antes = lib.arr(e.record.original().getStringSlice("members"));
  e.next();
  try {
    const yo = e.auth ? e.auth.id : "";
    for (const u of lib.arr(e.record.getStringSlice("members"))) {
      if (u !== yo && antes.indexOf(u) < 0) lib.notificar(e.app, u, "proyecto", "Estás en el proyecto " + e.record.getString("name"), lib.primerNombre(e.auth) + " te sumó al equipo.", "#proyecto/" + e.record.id);
    }
  } catch (err) { console.log("aviso proyecto:", err); }
}, "proyectos");

// Vistos buenos: le cuenta al líder quién respondió y cuándo ya están todos.
onRecordCreateRequest((e) => {
  e.next();
  try { require(`${__hooks}/lib.js`).avisarVisto(e.app, e.record, e.auth); } catch (err) { console.log("aviso visto:", err); }
}, "vistos");

onRecordUpdateRequest((e) => {
  e.next();
  try { require(`${__hooks}/lib.js`).avisarVisto(e.app, e.record, e.auth); } catch (err) { console.log("aviso visto:", err); }
}, "vistos");
