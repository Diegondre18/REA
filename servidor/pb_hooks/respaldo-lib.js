// Funciones del respaldo externo (ver respaldo.pb.js).

function clave(app) {
  try {
    const b = $os.readFile(app.dataDir() + "/lap_respaldo.key");
    return toString(b).trim();
  } catch (err) { return ""; }
}

// Solo la app del mismo PC, con la clave que ella misma guardó en la carpeta de datos.
function autorizar(e) {
  const ip = e.realIP();
  const k = clave(e.app);
  if (!(ip === "127.0.0.1" || ip === "::1") || !k || e.request.header.get("X-Lap-Respaldo") !== k) {
    throw new ForbiddenError("Solo el PC servidor puede pedir respaldos.");
  }
}

function directores(app) {
  return app.findRecordsByFilter("users", "role = 'director' || role = 'maestro'", "", 50, 0);
}

function avisar(app, title, body) {
  const lib = require(`${__hooks}/lib.js`);
  const hace = new Date(Date.now() - 20 * 3600e3).toISOString().replace("T", " ");
  for (const u of directores(app)) {
    // Una vez al día como máximo, para no llenar de avisos si el disco sigue desconectado.
    const ya = app.findRecordsByFilter("notificaciones", "user = {:u} && kind = 'respaldo' && created > {:t}", "", 1, 0, { u: u.id, t: hace });
    if (!ya.length) lib.notificar(app, u.id, "respaldo", title, body, "", null);
  }
}

function registrar(app, b) {
  const r = new Record(app.findCollectionByNameOrId("respaldos"));
  r.set("ok", !!b.ok);
  r.set("archivo", String(b.archivo || "").slice(0, 200));
  r.set("tamano", Number(b.tamano) || 0);
  r.set("destino", String(b.destino || "").slice(0, 1000));
  r.set("error", String(b.error || "").slice(0, 1000));
  r.set("motivo", String(b.motivo || "").slice(0, 20));
  app.save(r);
  // Se guarda el historial de los últimos 90 intentos.
  const viejos = app.findRecordsByFilter("respaldos", "id != ''", "-created", 500, 90);
  for (const v of viejos) app.delete(v);
  if (!b.ok) avisar(app, "No se pudo hacer el respaldo del estudio", String(b.error || "") + " Revisa en el PC servidor: Tu perfil → Respaldo.");
}

function revisar(app) {
  const ult = app.findRecordsByFilter("respaldos", "ok = true", "-created", 1, 0);
  const lib = require(`${__hooks}/lib.js`);
  if (!ult.length) {
    // Nunca se configuró: se recuerda los lunes.
    if (lib.diaSemana() === 1) avisar(app, "Falta configurar el respaldo del estudio", "En el PC servidor: Tu perfil → Respaldo → elige un disco externo o el NAS. Así una falla del disco no borra el trabajo.");
    return;
  }
  const t = Date.parse(String(ult[0].getString("created")).replace(" ", "T"));
  if (Date.now() - t > 48 * 3600e3) {
    avisar(app, "El estudio lleva más de 2 días sin respaldo", "El último fue el " + lib.fechaCorta(new Date(t).toISOString().slice(0, 10)) + ". ¿El PC servidor está apagado o el disco del respaldo desconectado?");
  }
}

module.exports = { autorizar, registrar, revisar };
