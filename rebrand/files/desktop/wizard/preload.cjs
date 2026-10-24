// Exposes the setup wizard's narrow API to its page. Runs sandboxed: only
// ipcRenderer is used, and every channel is fixed here.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("hyperSetup", {
  auto: () => ipcRenderer.invoke("hyper:auto"),
  modelChoices: () => ipcRenderer.invoke("hyper:model-choices"),
  docs: () => ipcRenderer.invoke("hyper:docs"),
  doc: (name) => ipcRenderer.invoke("hyper:doc", name),
  consent: (payload) => ipcRenderer.invoke("hyper:consent", payload),
  plan: () => ipcRenderer.invoke("hyper:plan"),
  start: (ids, opts) => ipcRenderer.invoke("hyper:start", ids, opts),
  skip: () => ipcRenderer.invoke("hyper:skip"),
  finish: () => ipcRenderer.invoke("hyper:finish"),
  onProgress: (listener) => {
    const handler = (_event, update) => listener(update)
    ipcRenderer.on("hyper:progress", handler)
    return () => ipcRenderer.off("hyper:progress", handler)
  },
})
