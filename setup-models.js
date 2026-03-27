// setup-models.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const MODELS = [
  {
    url: "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q5_K_M.gguf",
    dest: "comfyui/models/diffusion_models/flux2-klein-4b-Q5_K_M.gguf",
    size: "3.2GB",
  },
  {
    url: "https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q5_K_M.gguf",
    dest: "comfyui/models/text_encoders/qwen_2.5_3b.safetensors",
    size: "1.9GB",
  },
  {
    url: "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/resolve/main/vae/diffusion_pytorch_model.safetensors",
    dest: "comfyui/models/vae/ae.safetensors",
    size: "168MB"
  }
  // ae.safetensors, RealESRGAN etc
];

/**
 * Ensure a directory exists.
 *
 * @param {string} dirPath
 * @returns {void}
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Download a single model if it does not already exist.
 *
 * @param {{ url: string, dest: string, size?: string }} model
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
async function downloadModel(model, onProgress = () => {}) {
  const projectRoot = __dirname;
  const destPath = path.join(projectRoot, model.dest);
  const destDir = path.dirname(destPath);

  ensureDir(destDir);

  if (fs.existsSync(destPath)) {
    onProgress(1);
    return;
  }

  const response = await axios({
    method: "get",
    url: model.url,
    responseType: "stream",
    timeout: 0,
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
 * Ensure all required models are downloaded.
 *
 * @param {(model: { url: string, dest: string, size?: string }, pct: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
async function ensureModelsDownloaded(onProgress = () => {}) {
  for (const model of MODELS) {
    await downloadModel(model, (pct) => onProgress(model, pct));
  }
}

module.exports = {
  ensureModelsDownloaded,
  MODELS,
};