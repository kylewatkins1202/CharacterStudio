const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { spawn, execSync } = require("child_process");

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

  // In dev load Vite dev server, in prod load the built client
  const url = isDev
    ? "http://localhost:5173"
    : `http://localhost:${PORT}`;

  // Wait a moment for Express to be ready then load
  setTimeout(() => {
    mainWindow.loadURL(url);
  }, isDev ? 0 : 1500);

  // Open external links in the browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  if (!isDev) startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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

app.on("window-all-closed", () => {
  killServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killServer();
});