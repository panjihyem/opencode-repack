// Narrow, fixed IPC surface for Hyper Case Secure.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("hyperCase", {
  status: () => ipcRenderer.invoke("hyper:case:status"),
  list: () => ipcRenderer.invoke("hyper:case:list"),
  pickParameter: () => ipcRenderer.invoke("hyper:case:pick-parameter"),
  pickOutput: () => ipcRenderer.invoke("hyper:case:pick-output"),
  prepare: (input) => ipcRenderer.invoke("hyper:case:prepare", input),
  openOutput: (folder) => ipcRenderer.invoke("hyper:case:open-output", folder),
  deactivate: () => ipcRenderer.invoke("hyper:case:deactivate"),
  close: () => ipcRenderer.invoke("hyper:case:close"),
})
