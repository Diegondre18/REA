/// <reference path="../pb_data/types.d.ts" />
// Reglas de registro y avisos automáticos cuando alguien asigna, agenda o responde algo.

// Registro: solo correos del estudio y con equipo elegido. Dirección creativa tiene un solo cupo.
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib.js`);
  if (!e.hasSuperuserAuth()) {
    const email = e.record.getString("email").toLowerCase();
    if (lib.DOMINIO && !email.endsWith("@" + lib.DOMINIO)) {
      throw new BadRequestError("Usa tu correo @" + lib.DOMINIO + " para crear la cuenta.");
    }
    lib.validarPersona(e.app, e.record, e.auth, true);
    e.record.set("emailVisibility", true);
    e.record.set("taskId", "");
  }
  e.next();
}, "users");

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const lib = require(`${__hooks}/lib.js`);
    lib.validarPersona(e.app, e.record, e.auth, false);
    if (e.record.getString("muneco") !== e.record.original().getString("muneco")) lib.validarMuneco(e.app, e.record);
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

// Solicitudes entre áreas: avisa al área que la recibe y, cuando cambia de estado, a quien la pidió.
onRecordCreateRequest((e) => {
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const r = e.record;
    const area = r.getString("area");
    const gente = lib.arr(e.app.findRecordsByFilter("users", "areas ~ {:a}", "", 200, 0, { a: area }));
    const urgente = r.getString("prioridad") === "urgente" ? "Urgente: " : "";
    for (const u of gente) {
      if (u.id === r.getString("solicitante")) continue;
      lib.notificar(e.app, u.id, "solicitud", urgente + "Nueva solicitud: " + r.getString("titulo"),
        lib.primerNombre(e.auth) + " la pidió" + (r.getString("fechaNecesaria") ? " para el " + lib.fechaCorta(r.getString("fechaNecesaria")) : "") + ".", "#solicitudes");
    }
  } catch (err) { console.log("aviso solicitud:", err); }
}, "solicitudes");

onRecordUpdateRequest((e) => {
  const antes = e.record.original().getString("estado");
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const r = e.record;
    const estado = r.getString("estado");
    const quien = r.getString("solicitante");
    if (estado === antes || !quien || (e.auth && quien === e.auth.id)) return;
    const textos = { aceptada: "aceptó", lista: "terminó", rechazada: "no pudo tomar" };
    if (!textos[estado]) return;
    lib.notificar(e.app, quien, "solicitud", lib.primerNombre(e.auth) + " " + textos[estado] + " tu solicitud: " + r.getString("titulo"), r.getString("respuesta"), "#solicitudes");
  } catch (err) { console.log("aviso solicitud:", err); }
}, "solicitudes");

// Licencias y curaduría: cuando cambia el estado, avisa a quien responde por el trámite y a quien lidera el proyecto.
onRecordUpdateRequest((e) => {
  const antes = e.record.original().getString("estado");
  e.next();
  try {
    const lib = require(`${__hooks}/lib.js`);
    const r = e.record;
    if (r.getString("estado") === antes) return;
    const p = e.app.findRecordById("proyectos", r.getString("project"));
    const NOMBRES = { preparacion: "En preparación", radicado: "Radicado", observaciones: "Con observaciones", respuesta: "Respuesta enviada", aprobado: "Aprobado", negado: "Negado", desistido: "Desistido" };
    const destino = {};
    for (const u of [r.getString("responsable"), p.getString("leader")]) if (u && (!e.auth || u !== e.auth.id)) destino[u] = true;
    for (const u in destino) {
      lib.notificar(e.app, u, "tramite", "Licencia de " + p.getString("name") + ": " + (NOMBRES[r.getString("estado")] || r.getString("estado")),
        r.getString("estado") === "observaciones" && r.getString("fechaLimite") ? "Hay que responder antes del " + lib.fechaCorta(r.getString("fechaLimite")) + "." : "", "#proyecto/" + p.id + "/licencias");
    }
  } catch (err) { console.log("aviso trámite:", err); }
}, "tramites");

// Revisión de imágenes: avisa a los responsables de la tarea cuando alguien abre una revisión o deja comentarios.
onRecordCreateRequest((e) => {
  e.next();
  try { require(`${__hooks}/lib.js`).avisarRevision(e, true); } catch (err) { console.log("aviso revisión:", err); }
}, "revisiones");
onRecordUpdateRequest((e) => {
  const antes = JSON.stringify(e.record.original().get("pins") || []).length;
  e.next();
  try { if (JSON.stringify(e.record.get("pins") || []).length > antes) require(`${__hooks}/lib.js`).avisarRevision(e, false); } catch (err) { console.log("aviso revisión:", err); }
}, "revisiones");
