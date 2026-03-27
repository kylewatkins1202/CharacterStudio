const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { startComfyUI, stopComfyUI } = require("./comfyui");

const isDev = process.env.NODE_ENV === "development";
const PORT = 4989;

let mainWindow;
let serverProcess;

function startServer() {
  serverProcess = spawn("node", ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT },
    stdio: "inherit",
  });

  serverProcess.on("error", (err) => {
    console.error("Server failed to start:", err);
  });
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

  const url = isDev
    ? "http://localhost:5173"
    : `http://localhost:${PORT}`;

  setTimeout(() => {
    mainWindow.loadURL(url);
  }, isDev ? 0 : 1500);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function killServer() {
  if (!serverProcess) return;

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${serverProcess.pid} /f /t`);
    } else {
      serverProcess.kill("SIGTERM");
    }
  } catch {}

  serverProcess = null;
}

async function bootstrap() {
  try {
    console.log("Starting ComfyUI...");
    await startComfyUI();

    if (!isDev) {
      console.log("Starting local server...");
      startServer();
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
  killServer();
  stopComfyUI();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  killServer();
  stopComfyUI();
});