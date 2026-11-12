// Puente del aviso a pantalla completa: recibe lo que debe mostrar y devuelve el botón elegido.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alerta", {
  onData: (fn) => ipcRenderer.on("alerta-data", (_e, d) => fn(d)),
  action: (act) => ipcRenderer.send("alerta-action", act),
});
