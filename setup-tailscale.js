// @ts-check
/**
 * setup-tailscale.js
 *
 * Downloads and installs Tailscale on Windows if not already installed.
 * Run with: node setup-tailscale.js
 */

const fs      = require("fs");
const path    = require("path");
const https   = require("https");
const { execSync, spawn } = require("child_process");

const INSTALLER = path.join(__dirname, "tailscale-setup.exe");
const DOWNLOAD_URL = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe";

function isTailscaleInstalled() {
  try {
    execSync("tailscale version", { stdio: "ignore" });
    return true;
  } catch {
    // Check common install paths
    const paths = [
      "C:\\Program Files\\Tailscale\\tailscale.exe",
      "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
    ];
    return paths.some(p => fs.existsSync(p));
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading Tailscale from ${url}...`);
    const file = fs.createWriteStream(dest);
    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`);
          }
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); process.stdout.write("\n"); resolve(); });
      }).on("error", reject);
    };
    request(url);
  });
}

function install(installer) {
  return new Promise((resolve, reject) => {
    console.log("Running Tailscale installer...");
    // /quiet = silent install, no reboot prompt
    const proc = spawn(installer, ["/quiet", "/norestart"], { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Installer exited with code ${code}`));
    });
  });
}

async function main() {
  if (isTailscaleInstalled()) {
    console.log("✓ Tailscale is already installed.");
    return;
  }

  console.log("Tailscale not found — installing...");

  try {
    await download(DOWNLOAD_URL, INSTALLER);
    await install(INSTALLER);
    console.log("✓ Tailscale installed.");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Open Tailscale from the system tray and sign in");
    console.log("  2. Install Tailscale on your phone and sign in with the same account");
    console.log("  3. Find your computer's Tailscale IP at: https://login.tailscale.com/admin/machines");
    console.log("  4. Set your app Server URL to: http://<tailscale-ip>:4989");
  } finally {
    // Clean up installer
    if (fs.existsSync(INSTALLER)) fs.unlinkSync(INSTALLER);
  }
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
