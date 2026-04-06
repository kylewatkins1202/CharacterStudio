const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { startComfyUI, stopComfyUI } = require("./comfyui");
const { DATA_DIR } = require("./server/db");

const envPath = process.env.NODE_ENV === "production"
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");
require("dotenv").config({ path: envPath });

const isDev = process.env.NODE_ENV === "development";
const localGenerationEnabled = process.env.LOCAL_GENERATION === "true";
const PORT = 4989;

let mainWindow;

function startServer() {
  return require("./server").ready;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, "favicon.svg"),
    frame: false,
    backgroundColor: "#080808",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  ipcMain.on("win:minimize", () => mainWindow?.minimize());
  ipcMain.on("win:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
  ipcMain.on("open-file-location", (_, {localUrl, imageAssetId}) => {
    console.log("Open file location:", localUrl, imageAssetId);
    let filePath = path.join(DATA_DIR, localUrl.replace("/api", ""));
    shell.openPath(filePath)
    .then((errorMessage) => {
      if (errorMessage) console.error('Failed to open image:', errorMessage);
    })
  });

  const url = isDev
    ? "http://localhost:5173"
    : `http://localhost:${PORT}`;

  mainWindow.loadURL(url);

  mainWindow.webContents.on("before-input-event", (_, input) => {
    if (input.key === "F12") mainWindow.webContents.toggleDevTools();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  try {
    if (localGenerationEnabled) {
      console.log("Starting ComfyUI...");
      await startComfyUI();
    }

    if (!isDev) {
      console.log("Starting local server...");
      await startServer();
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    console.error("Startup failed:", error);
    app.quit();
  }
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (localGenerationEnabled) stopComfyUI();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (localGenerationEnabled) stopComfyUI();
});