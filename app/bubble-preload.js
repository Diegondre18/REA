// Puente de la burbuja: solo recibe su estado y avisos, y devuelve acciones a la app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bubble", {
  onState: (fn) => ipcRenderer.on("bubble-state", (_e, s) => fn(s)),
  onNotify: (fn) => ipcRenderer.on("bubble-notify", (_e, n) => fn(n)),
  onPlace: (fn) => ipcRenderer.on("bubble-place", (_e, p) => fn(p)),
  interactive: (on) => ipcRenderer.send("bubble-interactive", !!on),
  drag: (phase) => ipcRenderer.send("bubble-drag", phase),
  action: (a) => ipcRenderer.send("bubble-action", a),
});
