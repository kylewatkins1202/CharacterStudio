const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize:         () => ipcRenderer.send("win:minimize"),
  maximize:         () => ipcRenderer.send("win:maximize"),
  close:            () => ipcRenderer.send("win:close"),
  openFileLocation: ({localUrl, imageAssetId}) => {
    console.log("Open file location:", localUrl);
    ipcRenderer.send("open-file-location", {localUrl, imageAssetId})
  },

  // Expo mobile tunnel
  startExpoTunnel:     () => ipcRenderer.invoke("expo:start"),
  stopExpoTunnel:      () => ipcRenderer.invoke("expo:stop"),
  getExpoState:        () => ipcRenderer.invoke("expo:get-state"),
  onExpoQrUpdate:      (cb) => ipcRenderer.on("expo:qr-update", (_, d) => cb(d)),
  onExpoStatus:        (cb) => ipcRenderer.on("expo:status",    (_, s) => cb(s)),
  onExpoLog:           (cb) => ipcRenderer.on("expo:log",       (_, l) => cb(l)),
  removeExpoListeners: () => {
    ipcRenderer.removeAllListeners("expo:qr-update");
    ipcRenderer.removeAllListeners("expo:status");
    ipcRenderer.removeAllListeners("expo:log");
  },

  // Tailscale
  getTailscaleIp:   () => ipcRenderer.invoke("tailscale:get-ip"),
  installTailscale: () => ipcRenderer.invoke("tailscale:install"),
});
