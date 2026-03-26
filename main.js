const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

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
    titleBarStyle: "hiddenInset", // macOS native feel
    backgroundColor: "#080808",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});