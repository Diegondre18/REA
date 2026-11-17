/// <reference path="../pb_data/types.d.ts" />
// Bot de Telegram: la configuración del bot (solo la ve el servidor) y el vínculo de cada persona
// con su chat de Telegram.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const OWN = "user = @request.auth.id";

  // Una sola fila. Sin reglas: ninguna persona la puede leer desde la app; solo el servidor.
  app.save(new Collection({
    type: "base", name: "bot_config",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "token", type: "text", max: 200 },
      { name: "botUser", type: "text", max: 100 },
      { name: "offset", type: "number" },
      { name: "lastNotif", type: "text", max: 40 },
      { name: "error", type: "text", max: 300 },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }));

  // Vínculo persona ↔ chat. Cada quien ve el suyo y lo puede quitar; se crea desde las rutas del servidor.
  app.save(new Collection({
    type: "base", name: "telegram",
    listRule: OWN, viewRule: OWN, createRule: null, updateRule: null, deleteRule: OWN,
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "chatId", type: "text", max: 40 },
      { name: "username", type: "text", max: 100 },
      { name: "codigo", type: "text", max: 20 },
      { name: "codigoVence", type: "text", max: 40 },
      // siempre | fuera (solo cuando no está en el computador) | nunca
      { name: "avisos", type: "select", maxSelect: 1, values: ["siempre", "fuera", "nunca"] },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_telegram_user ON telegram (user)", "CREATE INDEX idx_telegram_chat ON telegram (chatId)"],
  }));
}, (app) => {
  for (const c of ["telegram", "bot_config"]) {
    try { app.delete(app.findCollectionByNameOrId(c)); } catch (e) { /* ya no está */ }
  }
});
