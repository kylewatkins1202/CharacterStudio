/**
 * setup-comfyui.js
 *
 * Sets up ComfyUI and the GGUF custom node using the Python bundled
 * inside this project.
 *
 * This is meant for Windows and uses your local:
 *   ./python/python.exe
 *
 * It will:
 * 1. Verify Python exists
 * 2. Clone ComfyUI if missing
 * 3. Upgrade pip
 * 4. Install ComfyUI requirements
 * 5. Clone ComfyUI-GGUF if missing
 * 6. Install ComfyUI-GGUF requirements
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

/**
 * @typedef {Object} RunCommandOptions
 * @property {string} [cwd]
 * @property {NodeJS.ProcessEnv} [env]
 */

/**
 * Run a command and stream output live.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {RunCommandOptions} [options]
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

    child.on("error", (error) => {
      reject(error);
    });

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
 * Check whether a file or directory exists.
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
 */
function ensureDir(dirPath) {
  if (!exists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Main setup routine.
 *
 * Pseudo Code:
 * 1. Resolve important paths
 * 2. Verify bundled Python exists
 * 3. Ensure custom_nodes parent directory exists
 * 4. Clone ComfyUI if missing
 * 5. Upgrade pip using bundled Python
 * 6. Install ComfyUI requirements
 * 7. Clone GGUF node if missing
 * 8. Install GGUF requirements
 * 9. Finish
 *
 * @returns {Promise<void>}
 */
async function setupComfyUI() {
  const projectRoot = path.resolve(__dirname);
  const pythonExe = path.join(projectRoot, "python", "python.exe");
  const comfyDir = path.join(projectRoot, "comfyui");
  const customNodesDir = path.join(comfyDir, "custom_nodes");
  const ggufDir = path.join(customNodesDir, "ComfyUI-GGUF");
  const comfyRequirements = path.join(comfyDir, "requirements.txt");
  const ggufRequirements = path.join(ggufDir, "requirements.txt");

  if (!exists(pythonExe)) {
    throw new Error(
      [
        `Bundled Python was not found.`,
        `Expected path: ${pythonExe}`,
        `Make sure you have Python installed inside your project's /python folder.`,
      ].join("\n")
    );
  }

  ensureDir(customNodesDir);

  if (!exists(comfyDir)) {
    console.log("Cloning ComfyUI...");
    await runCommand("git", [
      "clone",
      "https://github.com/comfyanonymous/ComfyUI",
      comfyDir,
    ]);
  } else {
    console.log("ComfyUI already exists. Skipping clone.");
  }

  console.log("Upgrading pip...");
  await runCommand(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"], {
    cwd: projectRoot,
  });

  if (!exists(comfyRequirements)) {
    throw new Error(`ComfyUI requirements.txt not found at: ${comfyRequirements}`);
  }

  console.log("Installing ComfyUI requirements...");
  await runCommand(
    pythonExe,
    ["-m", "pip", "install", "-r", comfyRequirements],
    { cwd: projectRoot }
  );

  if (!exists(ggufDir)) {
    console.log("Cloning ComfyUI-GGUF...");
    await runCommand("git", [
      "clone",
      "https://github.com/city96/ComfyUI-GGUF",
      ggufDir,
    ]);
  } else {
    console.log("ComfyUI-GGUF already exists. Skipping clone.");
  }

  if (!exists(ggufRequirements)) {
    throw new Error(`GGUF requirements.txt not found at: ${ggufRequirements}`);
  }

  console.log("Installing ComfyUI-GGUF requirements...");
  await runCommand(
    pythonExe,
    ["-m", "pip", "install", "-r", ggufRequirements],
    { cwd: projectRoot }
  );

  console.log("\nSetup complete.");
}

module.exports = {
  setupComfyUI,
};

if (require.main === module) {
  setupComfyUI().catch((error) => {
    console.error("\nSetup failed.");
    console.error(error);
    process.exit(1);
  });
}