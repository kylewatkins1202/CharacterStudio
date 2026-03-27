// preflight.js
const { setupComfyUI } = require("./setup-comfyui");
const { ensureModelsDownloaded } = require("./setup-models");

/**
 * Run startup setup tasks that should complete before the app launches.
 *
 * This does NOT start ComfyUI itself.
 * It only ensures:
 * 1. ComfyUI repo exists
 * 2. Python deps are installed
 * 3. Models are downloaded
 */
async function runPreflight() {
  console.log("Running ComfyUI setup...");
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