// @ts-check
/**
 * expo-tunnel.js
 *
 * Manages the Expo dev server process for mobile app hosting.
 * Mirrors the comfyui.js pattern: spawn child process, pipe output,
 * emit status/QR code updates via callbacks.
 */

const { spawn, exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
const axios = require("axios");
const qrcode = require("qrcode");

// Strips ANSI/VT100 escape codes so regex can match plain text in terminal output
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b[@-_]|\x1b[0-9]/g;
/** @param {string} s */
function stripAnsi(s) { return s.replace(ANSI_RE, ""); }

// In dev, NODE_ENV=development (set by cross-env in the npm script).
// In a packaged build NODE_ENV is undefined, so app-mobile lives in extraResources.
const APP_MOBILE_DIR = process.env.NODE_ENV === "development"
  ? path.join(__dirname, "app-mobile")
  : path.join(process.resourcesPath, "app-mobile");
const TAILSCALE_INSTALLER = path.join(__dirname, "tailscale-setup.exe");
const TAILSCALE_DOWNLOAD_URL = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe";

/** @type {import("child_process").ChildProcess | null} */
let expoProcess = null;

// In-memory state so the renderer can re-hydrate after modal close/reopen
/** @type {{ status: string, url: string|null, qrDataUrl: string|null }} */
const expoState = { status: "idle", url: null, qrDataUrl: null };

function getExpoState() {
  return { ...expoState };
}

// ── Expo Tunnel ──────────────────────────────────────────────────────────────

/**
 * Start the Expo tunnel server.
 * @param {(data: { url: string, qrDataUrl: string }) => void} onQrCode
 * @param {(status: string) => void} onStatus
 */
/**
 * Ensure app-mobile dependencies are installed before starting Expo.
 * Runs `npm install` in app-mobile if node_modules is absent.
 * @param {(status: string) => void} onStatus
 */
/**
 * @param {(status: string) => void} onStatus
 * @param {(line: string) => void} onLog
 */
function ensureMobileDeps(onStatus, onLog) {
  return new Promise((resolve, reject) => {
    const nodeModulesPath = path.join(APP_MOBILE_DIR, "node_modules");
    if (fs.existsSync(nodeModulesPath)) return resolve(undefined);

    onStatus("installing");
    onLog("Installing app-mobile dependencies…");

    const install = spawn("npm", ["install", "--force"], {
      cwd: APP_MOBILE_DIR,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    install.stdout.on("data", (d) => {
      const line = d.toString();
      process.stdout.write(line);
      onLog(line.trim());
    });
    install.stderr.on("data", (d) => {
      const line = d.toString();
      process.stderr.write(line);
      onLog(line.trim());
    });

    install.on("close", (code) => {
      if (code === 0) {
        onLog("Dependencies installed successfully.");
        resolve(undefined);
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });

    install.on("error", reject);
  });
}

/**
 * Polls Metro's manifest endpoint using axios until hostUri is available,
 * then builds the exp:// URL and emits the QR code.
 * @param {(data: { url: string, qrDataUrl: string }) => void} onQrCode
 * @param {(status: string) => void} onStatus
 */
async function pollMetroManifest(onQrCode, onStatus) {
  const MAX_ATTEMPTS = 15;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const { data } = await axios.get("http://localhost:8081/", {
        headers: { Accept: "application/expo+json,application/json" },
        timeout: 6000,
      });

      const hostUri = data?.extra?.expoClient?.hostUri;
      if (hostUri) {
        const url = "exp://" + hostUri;
        console.log("[expo-tunnel] Got tunnel URL from manifest:", url);
        const qrDataUrl = await qrcode.toDataURL(url, { width: 220, margin: 2 });
        expoState.status = "running";
        expoState.url = url;
        expoState.qrDataUrl = qrDataUrl;
        onStatus("running");
        onQrCode({ url, qrDataUrl });
        return;
      }
    } catch (err) {
      console.log(`[expo-tunnel] Manifest poll attempt ${i + 1}/${MAX_ATTEMPTS} failed:`, err instanceof Error ? err.message : err);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.warn("[expo-tunnel] Could not retrieve tunnel URL from Metro manifest after all attempts.");
}

/**
 * @param {(data: { url: string, qrDataUrl: string }) => void} onQrCode
 * @param {(status: string) => void} onStatus
 * @param {(line: string) => void} onLog
 */
async function startExpoTunnel(onQrCode, onStatus, onLog) {
  if (expoProcess) return;

  onStatus("starting");

  try {
    await ensureMobileDeps(onStatus, onLog);
    onStatus("starting"); // re-emit after install completes
  } catch (err) {
    console.error("[expo-tunnel] Dependency install failed:", err);
    onLog(`Install failed: ${err instanceof Error ? err.message : err}`);
    onStatus("error");
    return;
  }

  // Clear any leftover Metro/ngrok processes from a previous run (e.g. dev mode restart)
  await killExpoProcesses();

  expoProcess = spawn("npx", ["expo", "start", "--tunnel", "--clear"], {
    cwd: APP_MOBILE_DIR,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  /** @param {string} raw */
  async function handleOutput(raw) {
    const text = stripAnsi(raw);
    console.log("[expo-tunnel]", text);
    onLog(text.trim());

    // Primary: look for exp:// URL in cleaned text
    const match = text.match(/exp:\/\/[^\s\],]+/);
    if (match) {
      const url = match[0].replace(/[,\]]+$/, "");
      try {
        onStatus("running");
        expoState.status = "running";
        const qrDataUrl = await qrcode.toDataURL(url, { width: 220, margin: 2 });
        expoState.url = url;
        expoState.qrDataUrl = qrDataUrl;
        onQrCode({ url, qrDataUrl });
      } catch (err) {
        console.error("[expo-tunnel] QR generation failed:", err);
      }
      return;
    }

    // Fallback: once Metro reports the tunnel is ready, query the manifest
    // endpoint to extract the debuggerHost and derive the exp:// URL.
    if (/Tunnel ready/i.test(text)) {
      pollMetroManifest(onQrCode, onStatus);
    }
  }

  expoProcess.stdout?.on("data", (data) => handleOutput(data.toString()));
  expoProcess.stderr?.on("data", (data) => handleOutput(data.toString()));

  expoProcess.on("exit", (code) => {
    console.log("[expo-tunnel] Expo exited with code:", code);
    expoProcess = null;
    expoState.url = null;
    expoState.qrDataUrl = null;
    if (code !== 0 && code !== null) {
      onLog(`Expo process exited with code ${code}`);
      expoState.status = "error";
      onStatus("error");
    } else {
      expoState.status = "idle";
      onStatus("idle");
    }
  });

  expoProcess.on("error", (err) => {
    console.error("[expo-tunnel] Spawn error:", err);
    expoProcess = null;
    expoState.status = "error";
    expoState.url = null;
    expoState.qrDataUrl = null;
    onLog(`Failed to spawn Expo: ${err.message}`);
    onLog(`Make sure Node.js / npx is installed and on your PATH.`);
    onStatus("error");
  });
}

/**
 * Forcefully kill all processes related to a running Expo tunnel:
 *  - The tracked shell PID (if any)
 *  - Any process listening on port 8081 (Metro bundler)
 *  - Any running ngrok.exe instances (Windows) or ngrok processes (mac/linux)
 * This covers the case where the app restarts in dev mode and the previous
 * node/ngrok children were not cleaned up.
 * @returns {Promise<void>}
 */
function killExpoProcesses() {
  return new Promise((resolve) => {
    const cmds = [];

    if (process.platform === "win32") {
      // Kill the tracked shell process tree
      if (expoProcess?.pid) {
        cmds.push(`taskkill /PID ${expoProcess.pid} /T /F`);
      }
      // Kill the process LISTENING on port 8081 (Metro bundler only).
      // Filtering to LISTENING avoids matching Electron's own established
      // connections to Metro, which would kill the app itself.
      cmds.push(
        `FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8081"') DO @taskkill /PID %P /F 2>nul`
      );
      // Kill ngrok by executable name
      cmds.push(`taskkill /F /IM ngrok.exe 2>nul`);
    } else {
      if (expoProcess?.pid) cmds.push(`kill -9 ${expoProcess.pid}`);
      cmds.push(`lsof -ti :8081 | xargs kill -9`);
      cmds.push(`pkill -f ngrok`);
      cmds.push(`pkill -f "expo start"`);
    }

    let done = 0;
    for (const cmd of cmds) {
      exec(cmd, () => {
        if (++done === cmds.length) {
          // Brief pause to let the OS reclaim the port before we respawn
          setTimeout(resolve, 800);
        }
      });
    }
    if (cmds.length === 0) resolve();
  });
}

/**
 * Stop the Expo tunnel server.
 */
function stopExpoTunnel() {
  const hadProcess = Boolean(expoProcess);
  expoProcess = null;
  expoState.status = "idle";
  expoState.url = null;
  expoState.qrDataUrl = null;
  if (hadProcess) killExpoProcesses();
}

// ── Tailscale IP ─────────────────────────────────────────────────────────────

/**
 * Get the Tailscale IP address.
 * Tries `tailscale ip -4` first, falls back to parsing `ipconfig`.
 * @returns {Promise<{ ip: string|null, installed: boolean }>}
 */
function getTailscaleIp() {
  return new Promise((resolve) => {
    // Try the tailscale CLI first
    exec("tailscale ip -4", { timeout: 5000 }, (err, stdout) => {
      if (!err && stdout.trim()) {
        const ip = stdout.trim().split("\n")[0].trim();
        return resolve({ ip, installed: true });
      }

      // Fall back: check if installed at known paths then parse ipconfig
      const knownPaths = [
        "C:\\Program Files\\Tailscale\\tailscale.exe",
        "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
      ];
      const installed = knownPaths.some((p) => fs.existsSync(p));

      if (!installed) {
        return resolve({ ip: null, installed: false });
      }

      // Try running tailscale.exe directly for ip
      const tailscaleExe = knownPaths.find((p) => fs.existsSync(p));
      exec(`"${tailscaleExe}" ip -4`, { timeout: 5000 }, (err2, stdout2) => {
        if (!err2 && stdout2.trim()) {
          const ip = stdout2.trim().split("\n")[0].trim();
          return resolve({ ip, installed: true });
        }

        // Last resort: parse ipconfig for Tailscale adapter
        exec("ipconfig", { timeout: 8000 }, (err3, stdout3) => {
          if (err3) return resolve({ ip: null, installed: true });

          const lines = stdout3.split("\n");
          let inTailscale = false;
          let ip = null;

          for (const line of lines) {
            if (/tailscale/i.test(line)) {
              inTailscale = true;
            }
            if (inTailscale && /IPv4 Address/i.test(line)) {
              const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
              if (match) {
                ip = match[1];
                break;
              }
            }
            // Reset on next adapter heading (line starts with non-space and has colon)
            if (inTailscale && /^\S/.test(line) && line.includes(":") && !/tailscale/i.test(line)) {
              inTailscale = false;
            }
          }

          resolve({ ip, installed: true });
        });
      });
    });
  });
}

// ── Tailscale Installer ───────────────────────────────────────────────────────

/**
 * Download and silently install Tailscale.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
function installTailscale() {
  return new Promise((resolve) => {
    // Check if already installed
    try {
      execSync("tailscale version", { stdio: "ignore" });
      return resolve({ ok: true, alreadyInstalled: true });
    } catch {}

    const knownPaths = [
      "C:\\Program Files\\Tailscale\\tailscale.exe",
      "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
    ];
    if (knownPaths.some((p) => fs.existsSync(p))) {
      return resolve({ ok: true, alreadyInstalled: true });
    }

    // Download installer
    downloadFile(TAILSCALE_DOWNLOAD_URL, TAILSCALE_INSTALLER)
      .then(() => {
        const installer = spawn(TAILSCALE_INSTALLER, ["/quiet", "/norestart"], {
          stdio: "ignore",
        });
        installer.on("close", (code) => {
          // Clean up installer file
          try { fs.unlinkSync(TAILSCALE_INSTALLER); } catch {}
          if (code === 0) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `Installer exited with code ${code}` });
          }
        });
        installer.on("error", (err) => {
          try { fs.unlinkSync(TAILSCALE_INSTALLER); } catch {}
          resolve({ ok: false, error: err.message });
        });
      })
      .catch((err) => {
        resolve({ ok: false, error: err.message });
      });
  });
}

/**
 * Download a file via HTTPS, following redirects.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", reject);
    };
    request(url);
  });
}

module.exports = { startExpoTunnel, stopExpoTunnel, getExpoState, getTailscaleIp, installTailscale };
