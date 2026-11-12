// Funciones compartidas por los hooks del Cerebro. Cada hook las carga con require(`${__hooks}/lib.js`).

// Solo estos correos pueden crear cuenta. Déjalo en "" para aceptar cualquier correo.
const DOMINIO = "laparq.com";
// Diferencia horaria del estudio respecto a UTC (Bogotá = -5). Se usa para saber qué día es "hoy".
const UTC_OFFSET = -5;

function arr(x) {
  const out = [];
  if (!x) return out;
  for (let i = 0; i < x.length; i++) out.push(x[i]);
  return out;
}

function hoy(dias) {
  return new Date(Date.now() + UTC_OFFSET * 3600e3 + (dias || 0) * 864e5).toISOString().slice(0, 10);
}

function diaSemana() {
  return new Date(Date.now() + UTC_OFFSET * 3600e3).getUTCDay();
}

function fechaCorta(iso) {
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const p = String(iso || "").split("-");
  return p.length === 3 ? Number(p[2]) + " " + m[Number(p[1]) - 1] : "";
}

function primerNombre(rec) {
  const n = rec ? rec.getString("name") : "";
  return n ? n.split(" ")[0] : "Alguien";
}

// Dirección creativa y perfil maestro tienen los mismos permisos sobre proyectos y planes.
function esDirector(auth) {
  return !!auth && (auth.getString("role") === "director" || auth.getString("role") === "maestro");
}

// Equipo y rol de una persona. La Dirección creativa tiene un solo cupo; el perfil maestro solo lo da otro maestro.
function validarPersona(app, record, auth, nuevo) {
  const areas = arr(record.getStringSlice("areas"));
  let role = record.getString("role") || "miembro";
  const antes = nuevo ? "" : record.original().getString("role");
  const antesAreas = nuevo ? [] : arr(record.original().getStringSlice("areas"));
  const admin = esDirector(auth);
  const maestro = !!auth && auth.getString("role") === "maestro";

  if (nuevo) {
    if (!areas.length) throw new BadRequestError("Elige el equipo al que perteneces.");
    role = areas.indexOf("direccion") >= 0 ? "director" : "miembro";
  } else {
    // Sumarse a Dirección es pedir el rol de director: solo lo asigna dirección o el perfil maestro.
    if (areas.indexOf("direccion") >= 0 && antesAreas.indexOf("direccion") < 0 && role !== "director") {
      if (!admin) throw new BadRequestError("La Dirección creativa la asigna el director o el perfil maestro.");
      role = "director";
    }
    if (role !== antes) {
      if (!admin) throw new BadRequestError("No puedes cambiar tu rol.");
      if ((role === "maestro" || antes === "maestro") && !maestro) throw new BadRequestError("El perfil maestro solo lo asigna otro perfil maestro.");
    }
  }
  if (role === "director" && antes !== "director") {
    const otros = app.findRecordsByFilter("users", "role = 'director' && id != {:id}", "", 1, 0, { id: record.id || "" });
    if (otros.length) {
      throw new BadRequestError("El cupo de Dirección creativa ya lo ocupa " + otros[0].getString("name") + ". Si cambió, pídele al perfil maestro que lo reasigne.");
    }
  }
  // El área Dirección va siempre con el rol de director.
  let finales = areas.filter((a) => a !== "direccion");
  if (role === "director") finales = ["direccion"].concat(finales);
  record.set("role", role);
  record.set("areas", finales);
}

// opts: { de: quien lo provoca, urgente: suena y aparece aunque la persona esté en "No molestar" }.
function notificar(app, userId, kind, title, body, route, opts) {
  if (!userId) return;
  const n = new Record(app.findCollectionByNameOrId("notificaciones"));
  n.set("user", userId);
  n.set("kind", kind);
  n.set("title", String(title).slice(0, 200));
  n.set("body", String(body || "").slice(0, 600));
  n.set("route", route || "");
  n.set("read", false);
  if (opts && opts.de) n.set("de", opts.de);
  if (opts && opts.urgente) n.set("urgente", true);
  app.save(n);
}

// Aviso provocado por una persona. Urgente = suena aunque esté en "No molestar" (cambios de fecha;
// los mensajes directos de Dirección se marcan en toque()).
function aviso(e, userId, kind, title, body, route, urgente) {
  notificar(e.app, userId, kind, title, body, route, { de: e.auth ? e.auth.id : "", urgente: !!urgente });
}

function registrar(app, byId, kind, title, ref, projectId, to) {
  const a = new Record(app.findCollectionByNameOrId("actividad"));
  a.set("by", byId || "");
  a.set("kind", kind);
  a.set("title", String(title || "").slice(0, 200));
  a.set("ref", ref || "");
  a.set("project", projectId || "");
  a.set("to", to || "");
  app.save(a);
}

// Integrantes que deben dar visto bueno: todos menos quienes están a cargo (dirige y apoyo).
function integrantes(project) {
  const leader = project.getString("leader"), apoyo = project.getString("apoyo");
  return arr(project.getStringSlice("members")).filter((m) => m !== leader && m !== apoyo);
}

// A cargo del proyecto: el Director creativo siempre; además quien lo dirige (obligatorio, otra
// persona) y un apoyo opcional. Ambos quedan como integrantes.
function validarCargo(app, record, nuevo) {
  const leader = record.getString("leader"), apoyo = record.getString("apoyo");
  const antes = nuevo ? null : record.original();
  const cambio = nuevo || leader !== antes.getString("leader") || apoyo !== antes.getString("apoyo");
  if (!cambio) return;
  if (!leader) throw new BadRequestError("Elige quién dirige el proyecto.");
  const rol = (id) => { try { return app.findRecordById("users", id).getString("role"); } catch (err) { return ""; } };
  if (rol(leader) === "director") throw new BadRequestError("El Director creativo ya está a cargo de todos los proyectos. Elige a otra persona para dirigir este proyecto.");
  if (apoyo) {
    if (apoyo === leader) throw new BadRequestError("El apoyo debe ser otra persona, no quien dirige el proyecto.");
    if (rol(apoyo) === "director") throw new BadRequestError("El Director creativo ya está a cargo; el apoyo debe ser otra persona.");
  }
  const members = arr(record.getStringSlice("members"));
  for (const u of [leader, apoyo]) if (u && members.indexOf(u) < 0) members.push(u);
  record.set("members", members);
}

function cargarPlan(tx, e) {
  const plan = tx.findRecordById("planes", e.request.pathValue("id"));
  const project = tx.findRecordById("proyectos", plan.getString("project"));
  const lider = project.getString("leader") === e.auth.id || project.getString("apoyo") === e.auth.id;
  const director = esDirector(e.auth);
  if (!lider && !director) throw new ForbiddenError("Solo quienes están a cargo del proyecto pueden hacer esto.");
  return { plan, project, lider, director };
}

function borrarVistos(tx, planId) {
  const vistos = arr(tx.findRecordsByFilter("vistos", "plan = {:p}", "", 500, 0, { p: planId }));
  for (const v of vistos) tx.delete(v);
}

// borrador → en_aprobacion: pide el visto bueno a los integrantes.
function enviarPlan(e) {
  let out = {};
  e.app.runInTransaction((tx) => {
    const { plan, project } = cargarPlan(tx, e);
    if (plan.getString("status") !== "borrador") throw new BadRequestError("Este plan ya no está en borrador.");
    const items = tx.findRecordsByFilter("plan_items", "plan = {:p}", "", 1, 0, { p: plan.id });
    if (!items.length) throw new BadRequestError("Agrega al menos un entregable antes de enviar el plan.");
    borrarVistos(tx, plan.id);
    plan.set("status", "en_aprobacion");
    plan.set("sentAt", new Date().toISOString());
    tx.save(plan);
    const ruta = "#proyecto/" + project.id + "/plan";
    for (const m of integrantes(project)) {
      notificar(tx, m, "plan_visto", "Da tu visto bueno al plan de " + project.getString("name"),
        primerNombre(e.auth) + " envió la versión " + plan.getInt("version") + " del plan de entregables. Revísala y da tu visto bueno.", ruta);
    }
    registrar(tx, e.auth.id, "plan_sent", "Plan v" + plan.getInt("version"), plan.id, project.id);
    out = { id: plan.id, status: "en_aprobacion", pendientes: integrantes(project).length };
  });
  return e.json(200, out);
}

// en_aprobacion → borrador: el líder lo retira para corregirlo; los vistos buenos se reinician.
function retirarPlan(e) {
  let out = {};
  e.app.runInTransaction((tx) => {
    const { plan } = cargarPlan(tx, e);
    if (plan.getString("status") !== "en_aprobacion") throw new BadRequestError("Este plan no está en aprobación.");
    borrarVistos(tx, plan.id);
    plan.set("status", "borrador");
    plan.set("sentAt", "");
    tx.save(plan);
    out = { id: plan.id, status: "borrador" };
  });
  return e.json(200, out);
}

// en_aprobacion → aprobado: exige el visto bueno de todos los integrantes (el director puede aprobar sin esperar)
// y solo entonces pasa cada entregable al cronograma personal de sus responsables.
function aprobarPlan(e) {
  let out = {};
  e.app.runInTransaction((tx) => {
    const { plan, project, director } = cargarPlan(tx, e);
    if (plan.getString("status") !== "en_aprobacion") throw new BadRequestError("Primero envía el plan a visto bueno.");
    const vistos = arr(tx.findRecordsByFilter("vistos", "plan = {:p}", "", 500, 0, { p: plan.id }));
    const ok = {};
    for (const v of vistos) if (v.getString("verdict") === "ok") ok[v.getString("user")] = true;
    const faltan = integrantes(project).filter((m) => !ok[m]);
    if (faltan.length && !director) {
      throw new BadRequestError((faltan.length === 1 ? "Falta 1 visto bueno" : "Faltan " + faltan.length + " vistos buenos") + ". El plan se aprueba cuando todos los integrantes lo acepten.");
    }

    const items = arr(tx.findRecordsByFilter("plan_items", "plan = {:p}", "date,order", 2000, 0, { p: plan.id }));
    const previas = arr(tx.findRecordsByFilter("tareas", "project = {:pr} && planKey != ''", "", 5000, 0, { pr: project.id }));
    const porKey = {};
    for (const t of previas) porKey[t.getString("planKey")] = t;
    const tareasCol = tx.findCollectionByNameOrId("tareas");
    const vigentes = {};
    const porPersona = {};
    for (const it of items) {
      const key = it.getString("key");
      vigentes[key] = true;
      let t = porKey[key];
      if (!t) {
        t = new Record(tareasCol);
        t.set("status", "pendiente");
        t.set("progress", 0);
        t.set("project", project.id);
        t.set("planKey", key);
      }
      t.set("plan", plan.id);
      t.set("title", it.getString("content"));
      t.set("area", it.getString("area"));
      t.set("kind", it.getString("kind"));
      t.set("start", it.getString("date"));
      t.set("due", it.getString("end") || it.getString("date"));
      t.set("assignees", arr(it.getStringSlice("assignees")));
      t.set("meeting", it.getString("meeting"));
      t.set("updatedBy", e.auth.id);
      tx.save(t);
      for (const u of arr(it.getStringSlice("assignees"))) {
        (porPersona[u] = porPersona[u] || []).push(it);
      }
    }
    // Lo que salió del plan y nadie terminó deja de estar en los cronogramas.
    for (const t of previas) {
      if (!vigentes[t.getString("planKey")] && t.getString("status") !== "terminado") tx.delete(t);
    }
    const anteriores = arr(tx.findRecordsByFilter("planes", "project = {:pr} && status = 'aprobado' && id != {:id}", "", 50, 0, { pr: project.id, id: plan.id }));
    for (const p of anteriores) { p.set("status", "reemplazado"); tx.save(p); }

    plan.set("status", "aprobado");
    plan.set("approvedBy", e.auth.id);
    plan.set("approvedAt", new Date().toISOString());
    tx.save(plan);

    const nombre = project.getString("name");
    const avisados = {};
    for (const u in porPersona) {
      const mios = porPersona[u];
      const primero = mios[0];
      const detalle = mios.length === 1
        ? "«" + primero.getString("content") + "» para el " + fechaCorta(primero.getString("end") || primero.getString("date")) + "."
        : "El primero: «" + primero.getString("content") + "», " + fechaCorta(primero.getString("date")) + ".";
      avisados[u] = true;
      if (u === e.auth.id) continue;
      notificar(tx, u, "plan_aprobado", "Plan aprobado: tienes " + mios.length + (mios.length === 1 ? " entregable" : " entregables") + " en " + nombre,
        detalle + " Ya están en tu cronograma.", "#agenda");
      avisados[u] = true;
    }
    for (const m of arr(project.getStringSlice("members"))) {
      if (!avisados[m] && m !== e.auth.id) {
        notificar(tx, m, "plan_aprobado", "Se aprobó el plan de " + nombre, "Versión " + plan.getInt("version") + ". No tienes entregables asignados en este plan.", "#proyecto/" + project.id + "/plan");
      }
    }
    registrar(tx, e.auth.id, "plan_approved", "Plan v" + plan.getInt("version"), plan.id, project.id);
    out = { id: plan.id, status: "aprobado", tareas: items.length, sinVisto: faltan.length };
  });
  return e.json(200, out);
}

// Copia un plan aprobado a un borrador nuevo para cambiarlo; vuelve a pedir visto bueno.
function nuevaVersion(e) {
  let out = {};
  e.app.runInTransaction((tx) => {
    const { plan, project } = cargarPlan(tx, e);
    if (plan.getString("status") !== "aprobado") throw new BadRequestError("Solo se crea una versión nueva a partir del plan aprobado.");
    const abiertos = tx.findRecordsByFilter("planes", "project = {:pr} && (status = 'borrador' || status = 'en_aprobacion')", "", 1, 0, { pr: project.id });
    if (abiertos.length) throw new BadRequestError("Ya hay una versión nueva en preparación.");
    const nuevo = new Record(tx.findCollectionByNameOrId("planes"));
    nuevo.set("project", project.id);
    nuevo.set("version", plan.getInt("version") + 1);
    nuevo.set("status", "borrador");
    nuevo.set("notes", plan.getString("notes"));
    nuevo.set("createdBy", e.auth.id);
    tx.save(nuevo);
    const itemsCol = tx.findCollectionByNameOrId("plan_items");
    const items = arr(tx.findRecordsByFilter("plan_items", "plan = {:p}", "date,order", 2000, 0, { p: plan.id }));
    for (const it of items) {
      const c = new Record(itemsCol);
      c.set("plan", nuevo.id);
      for (const f of ["key", "date", "end", "content", "area", "kind", "meeting"]) c.set(f, it.getString(f));
      c.set("assignees", arr(it.getStringSlice("assignees")));
      c.set("order", it.getInt("order"));
      tx.save(c);
    }
    out = { id: nuevo.id, status: "borrador", version: nuevo.getInt("version") };
  });
  return e.json(200, out);
}

function avisarVisto(app, visto, auth) {
  const plan = app.findRecordById("planes", visto.getString("plan"));
  const project = app.findRecordById("proyectos", plan.getString("project"));
  // Le llega a quien dirige el proyecto y a su apoyo.
  const cargo = [project.getString("leader"), project.getString("apoyo")].filter(Boolean);
  const avisar = (title, body) => { for (const u of cargo) notificar(app, u, "plan_visto", title, body, ruta); };
  const ruta = "#proyecto/" + project.id + "/plan";
  const quien = primerNombre(auth);
  const nombre = project.getString("name");
  if (visto.getString("verdict") !== "ok") {
    avisar(quien + " pide cambios en el plan de " + nombre, visto.getString("comment"));
    return;
  }
  const vistos = arr(app.findRecordsByFilter("vistos", "plan = {:p} && verdict = 'ok'", "", 500, 0, { p: plan.id }));
  const ok = {};
  for (const v of vistos) ok[v.getString("user")] = true;
  const faltan = integrantes(project).filter((m) => !ok[m]).length;
  if (faltan) avisar(quien + " dio visto bueno al plan de " + nombre, faltan === 1 ? "Falta 1 persona." : "Faltan " + faltan + " personas.");
  else avisar("Todos dieron visto bueno: ya puedes aprobar el plan de " + nombre, "Al aprobarlo, cada entregable pasa al cronograma de sus responsables.");
}

// Recordatorios de cada mañana: comités sin reporte, reuniones de hoy y tareas por vencer o vencidas.
function recordatorios(app) {
  const viernes = diaSemana() === 5;
  const h = hoy(0);
  const limite = hoy(viernes ? 3 : 2);
  const eventos = arr(app.findRecordsByFilter("eventos", "date >= {:a} && date <= {:b}", "date", 500, 0, { a: h, b: limite }));
  for (const ev of eventos) {
    const asistentes = arr(ev.getStringSlice("attendees"));
    const cuando = ev.getString("date") === h ? "hoy" : "el " + fechaCorta(ev.getString("date"));
    const hora = ev.getString("time") ? " a las " + ev.getString("time") : "";
    if (ev.getString("kind") === "comite") {
      const hechos = {};
      for (const r of arr(app.findRecordsByFilter("reportes", "event = {:e}", "", 200, 0, { e: ev.id }))) hechos[r.getString("user")] = true;
      for (const u of asistentes) {
        if (!hechos[u]) notificar(app, u, "reporte", "Escribe tu avance para el comité: " + ev.getString("title"),
          "Es " + cuando + hora + ". Cuenta qué hiciste, qué sigue y qué te bloquea, para llegar con todo leído.", "#evento/" + ev.id);
      }
    } else if (ev.getString("date") === h) {
      for (const u of asistentes) notificar(app, u, "evento", "Hoy" + hora + ": " + ev.getString("title"), "", "#evento/" + ev.id);
    }
  }
  const manana = hoy(viernes ? 3 : 1);
  const ayer = hoy(-1);
  const tareas = arr(app.findRecordsByFilter("tareas", "status != 'terminado' && due != '' && due <= {:m} && due >= {:y}", "due", 2000, 0, { m: manana, y: ayer }));
  for (const t of tareas) {
    const due = t.getString("due");
    let titulo = "";
    if (due === ayer) titulo = "Se venció ayer: " + t.getString("title");
    else if (due === h) titulo = "Vence hoy: " + t.getString("title");
    else if (due === manana) titulo = "Vence el " + fechaCorta(due) + ": " + t.getString("title");
    if (!titulo) continue;
    for (const u of arr(t.getStringSlice("assignees"))) notificar(app, u, "vence", titulo, "", "#tarea/" + t.id);
  }
  recordatoriosTramites(app);
}

// Licencias: observaciones por responder en los próximos 3 días y licencias que vencen en 30 días.
function recordatoriosTramites(app) {
  const h = hoy(0);
  const tramites = arr(app.findRecordsByFilter("tramites", "estado = 'observaciones' && fechaLimite != '' && fechaLimite <= {:l}", "fechaLimite", 500, 0, { l: hoy(3) }));
  for (const t of tramites) {
    const p = app.findRecordById("proyectos", t.getString("project"));
    const vencido = t.getString("fechaLimite") < h;
    const titulo = (vencido ? "Venció el plazo de observaciones: " : "Responder observaciones antes del " + fechaCorta(t.getString("fechaLimite")) + ": ") + p.getString("name");
    const destino = {};
    for (const u of [t.getString("responsable"), p.getString("leader"), p.getString("apoyo")]) if (u) destino[u] = true;
    for (const u in destino) notificar(app, u, "tramite", titulo, t.getString("entidad") + (t.getString("radicado") ? " · radicado " + t.getString("radicado") : ""), "#proyecto/" + p.id + "/licencias");
  }
  // Una sola vez: exactamente a 30 días del vencimiento de la licencia.
  const vencen = arr(app.findRecordsByFilter("tramites", "estado = 'aprobado' && vigenciaHasta = {:d}", "", 500, 0, { d: hoy(30) }));
  for (const t of vencen) {
    const p = app.findRecordById("proyectos", t.getString("project"));
    const destino = {};
    for (const u of [t.getString("responsable"), p.getString("leader"), p.getString("apoyo")]) if (u) destino[u] = true;
    for (const u in destino) notificar(app, u, "tramite", "La licencia de " + p.getString("name") + " vence en 30 días", "Vigente hasta el " + fechaCorta(t.getString("vigenciaHasta")) + ".", "#proyecto/" + p.id + "/licencias");
  }
}

function avisarRevision(e, nueva) {
  const r = e.record;
  const t = e.app.findRecordById("tareas", r.getString("task"));
  const yo = e.auth ? e.auth.id : "";
  const titulo = nueva ? "Revisión nueva: " + r.getString("titulo") : "Comentarios en " + r.getString("titulo");
  for (const u of arr(t.getStringSlice("assignees"))) {
    if (u !== yo) aviso(e, u, "revision", titulo, primerNombre(e.auth) + " " + (nueva ? "pidió revisar esta imagen." : "dejó comentarios."), "#revision/" + r.id);
  }
}

function limpiar(app) {
  const corte = new Date(Date.now() - 30 * 864e5).toISOString().replace("T", " ");
  for (const col of ["actividad", "notificaciones"]) {
    const viejos = arr(app.findRecordsByFilter(col, "created < {:c}", "", 2000, 0, { c: corte }));
    for (const r of viejos) app.delete(r);
  }
}


// Ausencias: no se asignan tareas que empiecen o se entreguen mientras la persona no está.
const TIPO_AUSENCIA = { vacaciones: "de vacaciones", incapacidad: "incapacitada", permiso: "de permiso", fuera: "fuera de la oficina", otro: "ausente" };
function conflictoAusencia(app, userIds, start, due) {
  const fechas = [];
  for (const f of [start, due]) if (f && fechas.indexOf(f) < 0) fechas.push(f);
  for (const u of arr(userIds)) {
    for (const d of fechas) {
      const a = app.findRecordsByFilter("ausencias", "user = {:u} && desde <= {:d} && hasta >= {:d}", "desde", 1, 0, { u: u, d: d });
      if (a.length) {
        let nombre = "Esa persona";
        try { nombre = app.findRecordById("users", u).getString("name").split(" ")[0]; } catch (err) { /* sin nombre */ }
        return nombre + " estará " + (TIPO_AUSENCIA[a[0].getString("tipo")] || "ausente") + " del " + fechaCorta(a[0].getString("desde")) + " al " + fechaCorta(a[0].getString("hasta")) +
          ": no se le pueden asignar tareas que empiecen o se entreguen en esas fechas. Cambia las fechas o asígnala a otra persona.";
      }
    }
  }
  return "";
}

// Muñeco de la oficina: el color de la ropa no se repite entre personas.
function validarMuneco(app, record) {
  const leer = (rec) => { try { const t = rec.getString("muneco"); return t ? JSON.parse(t) : null; } catch (err) { return null; } };
  const m = leer(record);
  if (!m || !m.ropa) return;
  const otros = app.findRecordsByFilter("users", "id != {:id}", "", 500, 0, { id: record.id || "" });
  for (const o of otros) {
    const om = leer(o);
    if (om && om.ropa && String(om.ropa).toLowerCase() === String(m.ropa).toLowerCase()) {
      throw new BadRequestError("Ese color de ropa ya lo tiene " + o.getString("name").split(" ")[0] + ". Elige otro.");
    }
  }
}

// Tocar el hombro: un aviso corto a otra persona, que puede responder "Voy", "En 10 min" o "Ahora no".
function cuerpo(e) {
  const info = e.requestInfo();
  return (info && info.body) || {};
}
function toque(e) {
  const b = cuerpo(e);
  const to = String(b.to || "");
  const msg = String(b.mensaje || "").trim().slice(0, 200);
  if (!to || to === e.auth.id) throw new BadRequestError("Elige a quién tocarle el hombro.");
  let dest = null;
  try { dest = e.app.findRecordById("users", to); } catch (err) { throw new BadRequestError("Esa persona ya no está en el equipo."); }
  const hace = new Date(Date.now() - 20000).toISOString().replace("T", " ");
  const prev = e.app.findRecordsByFilter("notificaciones", "user = {:u} && de = {:d} && kind = 'toque' && created > {:t}", "", 1, 0, { u: to, d: e.auth.id, t: hace });
  if (prev.length) throw new BadRequestError("Ya le tocaste el hombro hace un momento. Espera su respuesta.");
  notificar(e.app, to, "toque", primerNombre(e.auth) + " te tocó el hombro", msg || "¿Tienes un momento?", "#oficina", { de: e.auth.id, urgente: esDirector(e.auth) });
  return e.json(200, { ok: true, presencia: dest.getString("presencia") || "disponible" });
}
const RESPUESTAS = { voy: " va para allá", "10": " te busca en 10 minutos", no: " ahora no puede" };
function responderToque(e) {
  const b = cuerpo(e);
  const r = String(b.respuesta || "");
  if (!RESPUESTAS[r]) throw new BadRequestError("Respuesta no válida.");
  let n = null;
  try { n = e.app.findRecordById("notificaciones", String(b.notif || "")); } catch (err) { throw new BadRequestError("Ese aviso ya no existe."); }
  if (n.getString("user") !== e.auth.id || n.getString("kind") !== "toque" || !n.getString("de")) throw new ForbiddenError("Ese aviso no es tuyo.");
  if (n.getString("respuesta")) throw new BadRequestError("Ya respondiste.");
  n.set("respuesta", r);
  n.set("read", true);
  e.app.save(n);
  notificar(e.app, n.getString("de"), "toque_resp", primerNombre(e.auth) + RESPUESTAS[r], n.getString("body"), "#oficina", { de: e.auth.id, urgente: esDirector(e.auth) });
  return e.json(200, { ok: true });
}

// Lunes por la mañana: a cada persona, un resumen de su semana (vence, atrasado, reuniones).
function resumenSemana(app) {
  const lunes = hoy(0), domingo = hoy(6);
  const gente = arr(app.findRecordsByFilter("users", "role != 'maestro' && role != 'pantalla'", "", 500, 0));
  for (const u of gente) {
    const tareas = arr(app.findRecordsByFilter("tareas", "status != 'terminado' && due != '' && assignees ~ {:u} && due <= {:d}", "due", 500, 0, { u: u.id, d: domingo }));
    const atrasadas = tareas.filter((t) => t.getString("due") < lunes).length;
    const vencen = tareas.length - atrasadas;
    const reuniones = app.findRecordsByFilter("eventos", "attendees ~ {:u} && date >= {:a} && date <= {:b} && kind != 'entrega'", "", 200, 0, { u: u.id, a: lunes, b: domingo }).length;
    if (!vencen && !atrasadas && !reuniones) continue;
    const partes = [];
    if (vencen) partes.push(vencen + (vencen === 1 ? " entrega" : " entregas"));
    if (atrasadas) partes.push(atrasadas + (atrasadas === 1 ? " atrasada" : " atrasadas"));
    if (reuniones) partes.push(reuniones + (reuniones === 1 ? " reunión" : " reuniones"));
    notificar(app, u.id, "semana", "Tu semana: " + partes.join(", "), "Mira qué vence, qué está bloqueado y quién del equipo no estará.", "#semana");
  }
}

// Cumpleaños: a las 8:15 a. m. se avisa al equipo (menos a quien cumple, que lo celebra al abrir la app).
function cumpleanos(app) {
  const md = hoy(0).slice(5);
  const gente = arr(app.findRecordsByFilter("users", "role != 'maestro' && role != 'pantalla'", "", 500, 0));
  for (const c of gente.filter((u) => u.getString("cumple") === md)) {
    const nombre = c.getString("name").split(" ")[0];
    for (const u of gente) if (u.id !== c.id) notificar(app, u.id, "cumple", "Hoy es el cumpleaños de " + nombre, "Pásale a saludar: tiene globos en su puesto de la oficina.", "#oficina", { de: c.id });
  }
}

module.exports = {
  validarCargo, cumpleanos, conflictoAusencia, validarMuneco, aviso, toque, responderToque, resumenSemana,
  avisarRevision, validarPersona, avisarVisto, recordatorios, limpiar,
  DOMINIO, arr, hoy, diaSemana, fechaCorta, primerNombre, esDirector, notificar, registrar, integrantes,
  enviarPlan, retirarPlan, aprobarPlan, nuevaVersion,
};
