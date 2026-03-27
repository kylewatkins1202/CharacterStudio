// comfyui.js
const { spawn } = require("child_process");
const path = require("path");
const axios = require("axios");

let comfyProcess = null;

/**
 * Get bundled Python path.
 *
 * @returns {string}
 */
function getPythonPath() {
  return process.platform === "win32"
    ? path.join(__dirname, "python", "python.exe")
    : path.join(__dirname, "python", "bin", "python3");
}

/**
 * Wait for ComfyUI HTTP API to become ready.
 *
 * @param {number} [retries=30]
 * @returns {Promise<boolean>}
 */
async function waitForComfyUI(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get("http://127.0.0.1:8188/system_stats", {
        timeout: 500000,
      });

      if (res.status >= 200 && res.status < 300) {
        return true;
      }
    } catch (_) {}

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("ComfyUI failed to start");
}

/**
 * Start ComfyUI if it is not already running.
 *
 * @returns {Promise<void>}
 */
async function startComfyUI() {
  if (comfyProcess) return;

  const pythonPath = getPythonPath();
  const comfyDir = path.join(__dirname, "comfyui");

  comfyProcess = spawn(
    pythonPath,
    [
      "main.py", // ✅ IMPORTANT: relative path
      "--listen", "127.0.0.1",
      "--port", "8188",
      "--lowvram",
    ],
    {
      cwd: comfyDir, // ✅ THIS is what matters
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  comfyProcess.stdout.on("data", (d) => console.log(`ComfyUI: ${d}`));
  comfyProcess.stderr.on("data", (d) => console.error(`ComfyUI: ${d}`));

  comfyProcess.on("exit", (code, signal) => {
    console.log(`ComfyUI exited (code=${code}, signal=${signal})`);
    comfyProcess = null;
  });

  await waitForComfyUI();
}

/**
 * Stop ComfyUI if running.
 *
 * @returns {void}
 */
function stopComfyUI() {
  if (!comfyProcess) return;

  try {
    if (process.platform === "win32") {
      comfyProcess.kill();
    } else {
      comfyProcess.kill("SIGTERM");
    }
  } catch (error) {
    console.error("Failed to stop ComfyUI:", error);
  }

  comfyProcess = null;
}

module.exports = {
  startComfyUI,
  stopComfyUI,
};