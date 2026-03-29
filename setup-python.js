// @ts-check

/**
 * setup-python.js
 *
 * Downloads and installs a local embeddable Python into:
 *   ./python
 *
 * This script is Windows-focused and intended for your Electron/ComfyUI setup.
 *
 * It will:
 * 1. Check if ./python/python.exe already exists
 * 2. Download Python 3.11 embeddable zip
 * 3. Extract it into ./python
 * 4. Patch python._pth so site-packages work
 * 5. Download get-pip.py
 * 6. Install pip into the local Python
 * 7. Verify Python + pip
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { spawn } = require("child_process");

/**
 * Change this if you want a different embedded Python build.
 *
 * Using 3.11 because it is the safe choice for ComfyUI/PyTorch.
 */
const PYTHON_EMBED_URL =
  "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip";

const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

/**
 * Check whether a path exists.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function exists(targetPath) {
  return fs.existsSync(targetPath);
}

/**
 * Ensure a directory exists.
 *
 * @param {string} dirPath
 * @returns {void}
 */
function ensureDir(dirPath) {
  if (!exists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Remove a directory if it exists.
 *
 * @param {string} dirPath
 * @returns {void}
 */
function removeDirIfExists(dirPath) {
  if (exists(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Run a command and stream stdout/stderr live.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<void>}
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed with exit code ${code}: ${command} ${args.join(" ")}`
        )
      );
    });
  });
}

/**
 * Download a file to disk with optional progress logging.
 *
 * @param {string} url
 * @param {string} destPath
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
async function downloadFile(url, destPath, onProgress = () => {}) {
  ensureDir(path.dirname(destPath));

  const response = await axios({
    method: "get",
    url,
    responseType: "stream",
    timeout: 0,
    maxRedirects: 10,
  });

  const totalHeader = response.headers["content-length"];
  const total = totalHeader ? parseInt(totalHeader, 10) : 0;
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);

    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      if (total > 0) {
        onProgress(downloaded / total);
      }
    });

    response.data.on("error", (error) => {
      writer.close();
      reject(error);
    });

    writer.on("error", (error) => {
      writer.close();
      reject(error);
    });

    writer.on("finish", () => {
      if (total === 0) {
        onProgress(1);
      }
      resolve();
    });

    response.data.pipe(writer);
  });
}

/**
 * Extract a zip using PowerShell's Expand-Archive.
 *
 * This avoids adding another npm dependency just to unzip.
 *
 * @param {string} zipPath
 * @param {string} destinationDir
 * @returns {Promise<void>}
 */
async function extractZip(zipPath, destinationDir) {
  ensureDir(destinationDir);

  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Expand-Archive -Path "${zipPath}" -DestinationPath "${destinationDir}" -Force`,
  ]);
}

/**
 * Find the python._pth file inside the Python directory.
 *
 * @param {string} pythonDir
 * @returns {string}
 */
function findPthFile(pythonDir) {
  const entries = fs.readdirSync(pythonDir);
  const pth = entries.find((name) => name.endsWith("._pth"));

  if (!pth) {
    throw new Error(`Could not find python._pth file inside: ${pythonDir}`);
  }

  return path.join(pythonDir, pth);
}

/**
 * Patch python._pth so:
 * - import site is enabled
 * - local Lib paths work
 * - ComfyUI can be imported by embedded Python
 *
 * @param {string} pythonDir
 * @returns {void}
 */
function patchPythonPth(pythonDir) {
  const pthPath = findPthFile(pythonDir);
  let content = fs.readFileSync(pthPath, "utf8");

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const wanted = [
    ...lines.filter((line) => line !== "# import site" && line !== "import site"),
  ];

  const additions = ["Lib", "Lib/site-packages", "../comfyui", "import site"];

  for (const item of additions) {
    if (!wanted.includes(item)) {
      wanted.push(item);
    }
  }

  fs.writeFileSync(pthPath, wanted.join(os.EOL) + os.EOL, "utf8");
  console.log(`Patched ${path.basename(pthPath)}`);
}

/**
 * Verify the local Python installation.
 *
 * @param {string} pythonExe
 * @returns {Promise<void>}
 */
async function verifyPython(pythonExe) {
  await runCommand(pythonExe, ["--version"]);
  await runCommand(pythonExe, ["-c", "import sys; print(sys.executable)"]);
}

/**
 * Verify pip is available.
 *
 * @param {string} pythonExe
 * @returns {Promise<void>}
 */
async function verifyPip(pythonExe) {
  await runCommand(pythonExe, ["-m", "pip", "--version"]);
}

async function instalOpenCv(pythonExe) {
    await runCommand(pythonExe, ["-m", "pip", "install", "opencv-python"])
}
/**
 * Install pip into the local embedded Python.
 *
 * @param {string} pythonExe
 * @param {string} tempDir
 * @returns {Promise<void>}
 */
async function installPip(pythonExe, tempDir) {
  const getPipPath = path.join(tempDir, "get-pip.py");

  console.log("Downloading get-pip.py...");
  await downloadFile(GET_PIP_URL, getPipPath, (pct) => {
    process.stdout.write(`\rget-pip.py ${Math.round(pct * 100)}%`);
  });
  process.stdout.write("\n");

  console.log("Installing pip...");
  await runCommand(pythonExe, [getPipPath]);
}

/**
 * Main setup flow for local bundled Python.
 *
 * Pseudo Code:
 * 1. Resolve project paths
 * 2. Skip if python/python.exe already exists
 * 3. Download embeddable Python zip
 * 4. Extract into ./python
 * 5. Patch python._pth
 * 6. Verify Python
 * 7. Install pip
 * 8. Verify pip
 *
 * @returns {Promise<void>}
 */
async function setupPython() {
  if (process.platform !== "win32") {
    throw new Error("setup-python.js currently supports Windows only.");
  }

  const projectRoot = __dirname;
  const pythonDir = path.join(projectRoot, "python");
  const pythonExe = path.join(pythonDir, "python.exe");
  const tempDir = path.join(projectRoot, ".tmp-python-setup");
  const zipPath = path.join(tempDir, "python-embed.zip");

  if (exists(pythonExe)) {
    console.log(`Bundled Python already exists at: ${pythonExe}`);
    await verifyPython(pythonExe);

    try {
      await verifyPip(pythonExe);
    } catch {
      console.log("Python exists but pip is missing. Installing pip...");
      ensureDir(tempDir);
      patchPythonPth(pythonDir);
      await installPip(pythonExe, tempDir);
      await verifyPip(pythonExe);
      await instalOpenCv(pythonExe)
      removeDirIfExists(tempDir);
    }

    return;
  }

  removeDirIfExists(tempDir);
  ensureDir(tempDir);
  ensureDir(pythonDir);

  console.log("Downloading embedded Python...");
  await downloadFile(PYTHON_EMBED_URL, zipPath, (pct) => {
    process.stdout.write(`\rpython zip ${Math.round(pct * 100)}%`);
  });
  process.stdout.write("\n");

  console.log("Extracting embedded Python...");
  await extractZip(zipPath, pythonDir);

  console.log("Patching python._pth...");
  patchPythonPth(pythonDir);

  console.log("Verifying Python...");
  await verifyPython(pythonExe);

  await installPip(pythonExe, tempDir);

  console.log("Verifying pip...");
  await verifyPip(pythonExe);

  removeDirIfExists(tempDir);

  console.log("\nPython setup complete.");
}

module.exports = {
  setupPython,
};

if (require.main === module) {
  setupPython().catch((error) => {
    console.error("\nPython setup failed.");
    console.error(error);
    process.exit(1);
  });
}