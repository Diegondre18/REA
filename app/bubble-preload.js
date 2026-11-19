// Puente de la burbuja (muñeco y avisos): solo recibe su estado y avisos, y devuelve acciones a la app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bubble", {
  onState: (fn) => ipcRenderer.on("bubble-state", (_e, s) => fn(s)),
  onNotify: (fn) => ipcRenderer.on("bubble-notify", (_e, n) => fn(n)),
  onPlace: (fn) => ipcRenderer.on("bubble-place", (_e, p) => fn(p)),
  alive: () => ipcRenderer.send("bubble-alive"),
  drag: (phase) => ipcRenderer.send("bubble-drag", phase),
  action: (a) => ipcRenderer.send("bubble-action", a),
  // Menú nativo del muñeco.
  menu: () => ipcRenderer.send("bubble-menu"),
  // La ventana de avisos informa cuánto alto necesita (0 = sin avisos).
  size: (h) => ipcRenderer.send("bubble-size", h),
});
