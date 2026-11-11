// Puente mínimo y explícito entre la interfaz y Windows.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lap", {
  openPath: (p) => ipcRenderer.invoke("open-path", p),
  pathExists: (p) => ipcRenderer.invoke("path-exists", p),
  pickFolder: (start) => ipcRenderer.invoke("pick-folder", start),
  appInfo: () => ipcRenderer.invoke("app-info"),
  sessionLoad: () => ipcRenderer.invoke("session-load"),
  sessionSave: (raw) => ipcRenderer.invoke("session-save", raw),
  getAutostart: () => ipcRenderer.invoke("autostart-get"),
  setAutostart: (on) => ipcRenderer.invoke("autostart-set", on),
  notify: (title, body, route) => ipcRenderer.send("notify", title, body, route),
  onNavigate: (fn) => ipcRenderer.on("navigate", (_e, route) => fn(route)),
  updateStatus: () => ipcRenderer.invoke("update-status"),
  onUpdateReady: (fn) => ipcRenderer.on("update-ready", (_e, version) => fn(version)),
  installUpdate: () => ipcRenderer.send("update-install"),
});
