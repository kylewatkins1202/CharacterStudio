// preflight.js
require("dotenv").config();
const { setupPython } = require("./setup-python");
const { setupComfyUI } = require("./setup-comfyui");
const { ensureModelsDownloaded } = require("./setup-models");

const localGenerationEnabled = process.env.LOCAL_GENERATION === "true";

/**
 * Run startup setup tasks that should complete before the app launches.
 *
 * This does NOT start ComfyUI itself.
 * It only ensures:
 * 1. ComfyUI repo exists (skipped when LOCAL_GENERATION=false)
 * 2. Python deps are installed (skipped when LOCAL_GENERATION=false)
 * 3. Models are downloaded (skipped when LOCAL_GENERATION=false)
 */
async function runPreflight() {
  if (!localGenerationEnabled) {
    console.log("LOCAL_GENERATION is disabled — skipping Python, ComfyUI, and model setup.");
    console.log("Preflight complete.");
    return;
  }

  console.log("Setting up bundled Python...");
  await setupPython();

  console.log("Setting up ComfyUI...");
  await setupComfyUI();

  console.log("Ensuring models are downloaded...");
  await ensureModelsDownloaded((model, pct) => {
    const percent = Math.round(pct * 100);
    console.log(`[model] ${percent}% ${model.dest}`);
  });

  console.log("Preflight complete.");
}

module.exports = {
  runPreflight,
};

if (require.main === module) {
  runPreflight().catch((error) => {
    console.error("Preflight failed.");
    console.error(error);
    process.exit(1);
  });
}