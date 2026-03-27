/**
 * comfyui.js
 *
 * Local ComfyUI client — mirrors the wavespeed.js interface so generate.js
 * can switch between backends with minimal changes.
 *
 * Exposes helpers for:
 * - Generating images via local ComfyUI (Klein 4B GGUF)
 * - Upscaling output to 4K via RealESRGAN
 * - LLM text calls via Ollama (replaces callAnyLLM)
 * - Vision calls via Ollama (replaces callAnyLLMVision)
 * - Text extraction helper matching extractLLMText signature
 */

const WebSocket = require("ws")
const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

const COMFY_BASE_URL = "http://127.0.0.1:8188"
const OLLAMA_BASE_URL = "http://127.0.0.1:11434"

// ─── Image Generation ────────────────────────────────────────────────────────

/**
 * Generate an image via local ComfyUI — mirrors generateSeedreamEdit signature.
 *
 * When images is empty, text-to-image is used.
 * When images contains buffers, they are base64-encoded and fed as references.
 *
 * @param {Object} options
 * @param {Buffer[]} options.images         - Reference image buffers (mirrors WaveSpeed's URL array)
 * @param {string}   options.prompt         - Compiled prompt string
 * @param {string}   [options.size]         - e.g. "1024x1024" — parsed into width/height
 * @param {boolean}  [options.upscale]      - Whether to upscale output to 4K
 * @param {string}   [options.upscaleModel] - Upscale model filename
 * @param {Array}    [options.loras]        - LoRA list [{ name, strength }]
 * @param {number}   [options.steps]        - Inference steps (default 4 for distilled)
 * @returns {Promise<Buffer>} Raw PNG image buffer
 */
async function generateComfyImage({
    images = [],
    prompt,
    size,
    upscale = true,
    upscaleModel = "RealESRGAN_x4plus.pth",
    loras = [],
    steps = 4,
}) {
    const clientId = uuidv4()

    const { width, height } = parseSize(size)

    const workflow = buildWorkflow({
        prompt,
        referenceBase64s: images.map(buf =>
            Buffer.isBuffer(buf) ? buf.toString("base64") : buf
        ),
        loras,
        width,
        height,
        steps,
        upscale,
        upscaleModel,
    })

    // Queue the prompt
    const queueRes = await axios.post(
        `${COMFY_BASE_URL}/prompt`,
        { prompt: workflow, client_id: clientId },
        { headers: { "Content-Type": "application/json" } }
    )

    const { prompt_id } = queueRes.data

    // Wait for completion via WebSocket
    const filename = await waitForCompletion(clientId, prompt_id)

    // Fetch and return image buffer
    const imgRes = await axios.get(
        `${COMFY_BASE_URL}/view?filename=${filename}&type=output`,
        { responseType: "arraybuffer" }
    )

    return Buffer.from(imgRes.data)
}

/**
 * Parse a WaveSpeed-style size string into width/height.
 * Falls back to 1024x1024 if not provided or unrecognised.
 *
 * @param {string|undefined} size - e.g. "1024x1024" or "portrait"
 * @returns {{ width: number, height: number }}
 */
function parseSize(size) {
    if (!size) return { width: 1024, height: 1024 }

    // Handle "WxH" format
    const match = size.match(/^(\d+)[x×](\d+)$/i)
    if (match) {
        return { width: parseInt(match[1]), height: parseInt(match[2]) }
    }

    // Handle named aspect ratios matching your constants.js
    const presets = {
        square:    { width: 1024, height: 1024 },
        portrait:  { width: 832,  height: 1216 },
        landscape: { width: 1216, height: 832  },
        wide:      { width: 1344, height: 768  },
        tall:      { width: 768,  height: 1344 },
    }

    return presets[size.toLowerCase()] || { width: 1024, height: 1024 }
}

/**
 * Build the ComfyUI workflow JSON.
 *
 * @private
 */
function buildWorkflow({
    prompt,
    referenceBase64s = [],
    loras = [],
    width,
    height,
    steps,
    upscale,
    upscaleModel,
}) {
    const workflow = {
        "1": {
            class_type: "UnetLoaderGGUF",
            inputs: { unet_name: "flux2-klein-4b-Q5_K_M.gguf" }
        },
        "2": {
            class_type: "CLIPLoader",
            inputs: { clip_name: "qwen_2.5_3b.safetensors", type: "flux" }
        },
        "3": {
            class_type: "VAELoader",
            inputs: { vae_name: "ae.safetensors" }
        },
        "4": {
            class_type: "CLIPTextEncode",
            inputs: { text: prompt, clip: ["2", 0] }
        },
        "5": {
            class_type: "EmptyLatentImage",
            inputs: { width, height, batch_size: 1 }
        },
        "6": {
            class_type: "KSampler",
            inputs: {
                model: ["1", 0],
                positive: ["4", 0],
                negative: ["4", 0],
                latent_image: ["5", 0],
                seed: Math.floor(Math.random() * 999999999),
                steps,
                cfg: 1.0,
                sampler_name: "euler",
                scheduler: "simple",
                denoise: 1.0,
            }
        },
        "7": {
            class_type: "VAEDecode",
            inputs: { samples: ["6", 0], vae: ["3", 0] }
        },
    }

    // Chain LoRAs
    if (loras.length > 0) {
        let lastModel = ["1", 0]
        let lastClip  = ["2", 0]

        loras.forEach((lora, i) => {
            const id = `lora_${i}`
            workflow[id] = {
                class_type: "LoraLoader",
                inputs: {
                    model: lastModel,
                    clip: lastClip,
                    lora_name: lora.name,
                    strength_model: lora.strength ?? 1.0,
                    strength_clip:  lora.strength ?? 1.0,
                }
            }
            lastModel = [id, 0]
            lastClip  = [id, 1]
        })

        workflow["6"].inputs.model = lastModel
        workflow["4"].inputs.clip  = lastClip
    }

    // Reference images via base64 (no upload needed)
    referenceBase64s.forEach((b64, i) => {
        workflow[`ref_${i}`] = {
            class_type: "ETN_LoadImageBase64",
            inputs: { image: b64 }
        }
    })

    // Upscale nodes
    if (upscale) {
        workflow["8"] = {
            class_type: "UpscaleModelLoader",
            inputs: { model_name: upscaleModel }
        }
        workflow["9"] = {
            class_type: "ImageUpscaleWithModel",
            inputs: { upscale_model: ["8", 0], image: ["7", 0] }
        }
    }

    // Save output
    workflow["10"] = {
        class_type: "SaveImage",
        inputs: {
            images: upscale ? ["9", 0] : ["7", 0],
            filename_prefix: "klein_output"
        }
    }

    return workflow
}

/**
 * Wait for a ComfyUI prompt to complete via WebSocket.
 *
 * @private
 * @param {string} clientId
 * @param {string} promptId
 * @returns {Promise<string>} Output image filename
 */
function waitForCompletion(clientId, promptId) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(
            `${COMFY_BASE_URL.replace("http", "ws")}/ws?clientId=${clientId}`
        )

        const timeout = setTimeout(() => {
            ws.close()
            reject(new Error("ComfyUI generation timed out"))
        }, 5 * 60 * 1000)

        ws.on("message", async (data) => {
            try {
                const msg = JSON.parse(data)
                if (
                    msg.type === "executing" &&
                    msg.data.prompt_id === promptId &&
                    msg.data.node === null
                ) {
                    clearTimeout(timeout)
                    ws.close()

                    const historyRes = await axios.get(
                        `${COMFY_BASE_URL}/history/${promptId}`
                    )

                    const history = historyRes.data

                    const outputs = history[promptId]?.outputs
                    const imageNode = Object.values(outputs).find(o => o.images)
                    if (!imageNode) return reject(new Error("No output image found"))
                    resolve(imageNode.images[0].filename)
                }
            } catch (err) {
                reject(err)
            }
        })

        ws.on("error", reject)
    })
}

// ─── LLM (mirrors callAnyLLM / callAnyLLMVision) ────────────────────────────

/**
 * Text-only LLM call via local Ollama — mirrors callAnyLLM signature.
 *
 * @param {Object} options
 * @param {string} options.prompt
 * @param {string} [options.systemPrompt]
 * @param {string} [options.model]        - Ollama model name (default: qwen2.5:3b)
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @returns {Promise<Object>} Response shaped to match extractLLMText expectations
 */
async function callLocalLLM({
    prompt,
    systemPrompt,
    model = "qwen2.5:3b",
    temperature = 0.2,
    maxTokens = 1200,
}) {
    const messages = []

    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt })
    }

    messages.push({ role: "user", content: prompt })

    const res = await axios.post(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
            model,
            messages,
            stream: false,
            options: {
                temperature,
                num_predict: maxTokens,
            },
        },
        {
            headers: { "Content-Type": "application/json" },
        }
    )

    const data = res.data

    // Shape response to match extractLLMText expectations
    return {
        output: data.message?.content || "",
        raw: data,
    }
}

/**
 * Vision-capable LLM call via local Ollama — mirrors callAnyLLMVision signature.
 *
 * Images should be base64 strings or Buffers.
 *
 * @param {Object}   options
 * @param {string}   options.prompt
 * @param {Array}    [options.images]      - Base64 strings or Buffers
 * @param {string}   [options.systemPrompt]
 * @param {string}   [options.model]       - Must be a vision-capable model e.g. llava or qwen2.5-vl
 * @param {number}   [options.temperature]
 * @param {number}   [options.maxTokens]
 * @returns {Promise<Object>} Response shaped to match extractLLMText expectations
 */
async function callLocalLLMVision({
    prompt,
    images = [],
    systemPrompt,
    model = "qwen2.5-vl:7b",  // vision-capable model
    temperature = 0.2,
    maxTokens = 1200,
}) {
    const messages = []

    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt })
    }

    // Ollama vision expects base64 images in the images array on the message
    const base64Images = images.map(img =>
        Buffer.isBuffer(img) ? img.toString("base64") : img
    )

    messages.push({
        role: "user",
        content: prompt,
        images: base64Images,
    })

    const res = await axios.post(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
            model,
            messages,
            stream: false,
            options: {
                temperature,
                num_predict: maxTokens,
            },
        },
        {
            headers: { "Content-Type": "application/json" },
        }
    )

    const data = res.data

    return {
        output: data.message?.content || "",
        raw: data,
    }
}

/**
 * Best-effort extraction of text from a local LLM response.
 * Mirrors extractLLMText from wavespeed.js exactly — same signature, same fallback chain.
 *
 * @param {unknown} result
 * @returns {string}
 */
function extractLLMText(result) {
    if (!result) return ""

    const candidates = [
        result?.output,
        result?.result,
        result?.data?.output,
        result?.data?.result,
        result?.data?.text,
        result?.text,
    ]

    for (const value of candidates) {
        if (typeof value === "string" && value.trim()) {
            return value.trim()
        }
    }

    const nestedCandidates = [
        result?.data?.outputs,
        result?.outputs,
        result?.data?.choices,
        result?.choices,
    ]

    for (const arr of nestedCandidates) {
        if (Array.isArray(arr) && arr.length) {
            for (const item of arr) {
                let text =
                    item?.text ||
                    item?.message?.content ||
                    item?.content ||
                    item?.output_text
                if (!text && typeof item === "string") text = item
                if (typeof text === "string" && text.trim()) return text.trim()
            }
        }
    }

    return ""
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Check whether ComfyUI is reachable.
 *
 * @returns {Promise<boolean>}
 */
async function isComfyUIReady() {
    try {
        const res = await axios.get(`${COMFY_BASE_URL}/system_stats`)
        return res.status === 200
    } catch (_) {
        return false
    }
}

module.exports = {
    generateComfyImage,
    callLocalLLM,
    callLocalLLMVision,
    extractLLMText,
    isComfyUIReady,
    COMFY_BASE_URL,
}