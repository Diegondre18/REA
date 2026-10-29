// Puente mínimo y explícito entre la interfaz y el proceso principal.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lap", {
  openPath: (p) => ipcRenderer.invoke("open-path", p),
  pathExists: (p) => ipcRenderer.invoke("path-exists", p),
  pickFolder: (start) => ipcRenderer.invoke("pick-folder", start),
  appInfo: () => ipcRenderer.invoke("app-info"),
});
