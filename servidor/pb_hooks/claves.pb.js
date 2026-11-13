/// <reference path="../pb_data/types.d.ts" />
// Dirección (o el perfil maestro) le pone una contraseña nueva a cualquier persona del equipo,
// por si la olvida. El perfil maestro solo lo puede cambiar el propio maestro. Su rol no cambia.
routerAdd("POST", "/api/lap/clave", (e) => {
  const rol = e.auth.getString("role");
  if (rol !== "director" && rol !== "maestro") throw new ForbiddenError("Solo Dirección puede cambiar la contraseña de otra persona.");
  const body = e.requestInfo().body || {};
  const password = String(body.password || "");
  if (password.length < 8) throw new BadRequestError("La contraseña necesita al menos 8 caracteres.");
  let u;
  try { u = e.app.findRecordById("users", String(body.user || "")); } catch (err) { throw new NotFoundError("No se encontró a esa persona."); }
  if (u.getString("role") === "maestro" && rol !== "maestro") throw new ForbiddenError("El perfil maestro solo lo cambia el propio maestro.");
  u.setPassword(password);
  e.app.save(u);
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));
