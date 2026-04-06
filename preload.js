const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize:         () => ipcRenderer.send("win:minimize"),
  maximize:         () => ipcRenderer.send("win:maximize"),
  close:            () => ipcRenderer.send("win:close"),
  openFileLocation: ({localUrl, imageAssetId}) => {
    console.log("Open file location:", localUrl);
    ipcRenderer.send("open-file-location", {localUrl, imageAssetId})
  },
});
