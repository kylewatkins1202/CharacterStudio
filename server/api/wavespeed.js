/**
 * wavespeed.js
 *
 * Thin client around the WaveSpeed v3 API.
 * Exposes helpers for:
 * - Uploading raw image buffers to WaveSpeed media storage
 * - Calling the Seedream image-generation / edit endpoint
 * - Calling the Any LLM (text) and Any LLM Vision endpoints
 * - Extracting the text payload from a WaveSpeed LLM response
 */

/** @typedef {import('../types').WaveSpeedUploadResult} WaveSpeedUploadResult */
/** @typedef {import('../types').SeedreamEditOptions} SeedreamEditOptions */
/** @typedef {import('../types').AnyLLMOptions} AnyLLMOptions */
/** @typedef {import('../types').AnyLLMVisionOptions} AnyLLMVisionOptions */

const axios = require("axios")
const FormData = require("form-data")

// Mutable so the settings route can update it at runtime without restarting
let WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
const WAVESPEED_BASE_URL = "https://api.wavespeed.ai/api/v3"

const WAVESPEED_UPLOAD_URL = `${WAVESPEED_BASE_URL}/media/upload/binary`

// Seedream v4.5
const WAVESPEED_SEEDREAM_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v4.5`
const WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v4.5/edit`

// Seedream v5 Lite
const WAVESPEED_SEEDREAM_5_LITE_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v5.0-lite`
const WAVESPEED_SEEDREAM_5_LITE_EDIT_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v5.0-lite/edit`

// Qwen Image v2.0
const WAVESPEED_QWEN_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0`
const WAVESPEED_QWEN_EDIT_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0/edit`

// Qwen Image v2.0 Pro
const WAVESPEED_QWEN_PRO_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0-pro`
const WAVESPEED_QWEN_PRO_EDIT_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0-pro/edit`

// Nano Banana Pro
const WAVESPEED_NANO_BANANA_PRO_URL = `${WAVESPEED_BASE_URL}/google/nano-banana-pro/text-to-image`
const WAVESPEED_NANO_BANANA_PRO_EDIT_URL = `${WAVESPEED_BASE_URL}/google/nano-banana-pro/edit`

const WAVESPEED_ANY_LLM_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/any-llm`
const WAVESPEED_ANY_LLM_VISION_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/any-llm/vision`

const WAVESPEED_POLLING = `https://api.wavespeed.ai/api/v3/predictions/`

const WAVESPEED_UPSCALE_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/image-upscaler`

const MODELS = {
    "seedream": {
        modelId: "bytedance/seedream-v4.5",
        editModelId: "bytedance/seedream-v4.5/edit",
        name: "Seedream v4.5",
        link: WAVESPEED_SEEDREAM_URL,
        editLink: WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL,
        cost: '.04',
        min: 512,
        max: 8192, 
        poll: true
    },
    "seedream5Lite": {
        modelId: "bytedance/seedream-v5.0-lite",
        editModelId: "bytedance/seedream-v5.0-lite/edit",
        name: "Seedream v5 Lite",
        cost: '.035',
        link: WAVESPEED_SEEDREAM_5_LITE_URL,
        editLink: WAVESPEED_SEEDREAM_5_LITE_EDIT_URL,
        min: 512,
        max: 8192, 
        poll: true
    },
    "qwen-image-2.0": {
        modelId: "wavespeed-ai/qwen-image-2.0",
        editModelId: "wavespeed-ai/qwen-image-2.0/edit",
        name: "Qwen Image 2.0",
        link: WAVESPEED_QWEN_URL,
        editLink: WAVESPEED_QWEN_EDIT_URL,
        cost: '.03',
        poll: true,
        min: 512,
        max: 2048
    },
    "qwen-image-2.0-pro": {
        modelId: "wavespeed-ai/qwen-image-2.0-pro",
        editModelId: "wavespeed-ai/qwen-image-2.0-pro/edit",
        name: "Qwen Image 2.0 Pro",
        link: WAVESPEED_QWEN_PRO_URL,
        editLink: WAVESPEED_QWEN_PRO_EDIT_URL,
        cost: '.07',
        poll: true,
        min: 512,
        max: 2048
    },
    /* "nano-banana-pro": {
        modelId: "google/nano-banana-pro/text-to-image",
        modelId: "google/nano-banana-pro/edit",
        name: "Nano Banana Pro",
        link: WAVESPEED_NANO_BANANA_PRO_URL,
        editLink: WAVESPEED_NANO_BANANA_PRO_EDIT_URL,
        cost: ".119",
        poll: true,
        min: "2k",
        max: "8k"
    } */
}

const LLM_MODELS = {
    "google/gemini-2.5-flash": {
        cost: '.001'
    }
}

if (!WAVESPEED_API_KEY) {
    console.warn("Warning: WAVESPEED_API_KEY is not set.")
}

/**
 * Build the standard Authorization header merged with any extra headers.
 *
 * @param {Record<string, string>} [extra={}] - Additional headers to merge in (e.g. Content-Type or form-data headers).
 * @returns {Record<string, string>}
 */
function getAuthHeaders(extra = {}) {
    return {
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        ...extra
    }
}

/**
 * Upload a raw image buffer to WaveSpeed media storage.
 *
 * The returned URL is a publicly accessible CDN link that can be passed
 * directly to the Seedream or Any LLM Vision endpoints.
 *
 * @param {Buffer} buffer - Raw image data to upload.
 * @param {string} filename - Suggested filename including extension (e.g. "photo.jpg").
 * @param {string} mimeType - MIME type of the image (e.g. "image/jpeg").
 * @returns {Promise<WaveSpeedUploadResult>}
 */
async function uploadBufferToWaveSpeed(buffer, filename, mimeType) {
    const form = new FormData()

    form.append("file", buffer, {
        filename,
        contentType: mimeType
    })

    const response = await axios.post(WAVESPEED_UPLOAD_URL, form, {
        headers: getAuthHeaders(form.getHeaders()),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    })

    const data = response?.data?.data || {}
    const url = data.download_url || data.url

    if (!url) {
        throw new Error("WaveSpeed upload did not return a file URL")
    }

    return {
        url,
        filename: data.filename || filename,
        size: data.size || buffer.length,
        raw: response.data
    }
}

/**
 * Call the Seedream image-generation or sequential-edit endpoint.
 *
 * When `images` is empty the base generation URL is used (text-to-image).
 * When `images` contains one or more URLs the edit-sequential URL is used instead.
 *
 * @param {SeedreamEditOptions} options
 * @returns {Promise<unknown>} Raw WaveSpeed API response body.
 */
async function generateSeedreamEdit({
    model = "seedream",
    images,
    prompt,
    size,
    enableSyncMode = false,
    enableBase64Output = false
}) {
    const payload = {
        images,
        prompt,
        enable_sync_mode: enableSyncMode,
        enable_base64_output: enableBase64Output
    }

    if (size) {
        payload.size = size
    }

    // Get text to image if no images provided, otherwise image edit
    let textToImage = images.length === 0

    let link

    if (textToImage) {
        link = MODELS[model]?.link || WAVESPEED_SEEDREAM_URL
    } else {
        link = MODELS[model]?.editLink || WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL
    }

    let request = async () => axios.post(link, payload, {
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    })
    let response = await request()

    if (MODELS[model]?.poll) {
        console.log(response?.data?.data?.urls?.get)
        let url = response?.data?.data?.urls?.get  
        let id = response?.data?.data?.id

        // For models that require polling, wrap the request in a retry loop
        const maxRetries = 60
        const retryDelay = 10 * 1000
        
        let attempt = 0
        
        for (; attempt < maxRetries; attempt++) {
            response = await axios.get(WAVESPEED_POLLING + id + '/result', {
                headers: getAuthHeaders({
                    "Content-Type": "application/json"
                })
            })

            if (response?.data?.data?.status === "completed" || response?.data?.data?.status === "failed") {
                return response.data
            }

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
        }
    }

    return response.data
}

/**
 * Generic Any LLM call for text-only parsing / compilation work.
 *
 * @param {AnyLLMOptions} options
 * @returns {Promise<unknown>} Raw WaveSpeed API response body.
 */
async function callAnyLLM({
    prompt,
    systemPrompt,
    model = "google/gemini-2.5-flash",
    temperature = 0.2,
    maxTokens = 1200,
    reasoning = false,
    priority = "latency",
    enableSyncMode = true
}) {
    const payload = {
        prompt,
        model,
        temperature,
        max_tokens: maxTokens,
        reasoning,
        priority,
        enable_sync_mode: enableSyncMode
    }

    if (systemPrompt) {
        payload.system_prompt = systemPrompt
    }

    const response = await axios.post(WAVESPEED_ANY_LLM_URL, payload, {
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    })

    return response.data
}

/**
 * Vision-capable LLM call for analyzing one or more uploaded reference images.
 *
 * `images` should be an array of publicly reachable URLs, typically WaveSpeed upload URLs.
 *
 * @param {AnyLLMVisionOptions} options
 * @returns {Promise<unknown>} Raw WaveSpeed API response body.
 */
async function callAnyLLMVision({
    prompt,
    images = [],
    systemPrompt,
    model = "google/gemini-2.5-flash",
    temperature = 0.2,
    maxTokens = 1200,
    reasoning = false,
    priority = "latency",
    enableSyncMode = true
}) {
    const payload = {
        prompt,
        images,
        model,
        temperature,
        max_tokens: maxTokens,
        reasoning,
        priority,
        enable_sync_mode: enableSyncMode
    }

    if (systemPrompt) {
        payload.system_prompt = systemPrompt
    }

    const response = await axios.post(WAVESPEED_ANY_LLM_VISION_URL, payload, {
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    })

    return response.data
}

/**
 * Best-effort extraction of the final text string from a WaveSpeed Any LLM / Vision response.
 *
 * Tries several known response shapes in order and returns the first non-empty string found.
 * Returns an empty string if nothing can be extracted. This keeps tagCompiler.js simpler.
 *
 * @param {unknown} result - Raw response body returned by callAnyLLM or callAnyLLMVision.
 * @returns {string}
 */
function extractLLMText(result) {
    if (!result) {
        return ""
    }

    const candidates = [
        result?.output,
        result?.result,
        result?.data?.output,
        result?.data?.result,
        result?.data?.text,
        result?.text
    ]

    for (const value of candidates) {
        if (typeof value === "string" && value.trim()) {
            return value.trim()
        }
    }

    // Handle common array/object response shapes
    const nestedCandidates = [
        result?.data?.outputs,
        result?.outputs,
        result?.data?.choices,
        result?.choices
    ]

    for (const arr of nestedCandidates) {
        if (Array.isArray(arr) && arr.length) {
            for (const item of arr) {
                let text =
          item?.text ||
          item?.message?.content ||
          item?.content ||
          item?.output_text
                if (!text && typeof item === "string") {
                    text = item
                }
                if (typeof text === "string" && text.trim()) {
                    return text.trim()
                }

                if (Array.isArray(text)) {
                    const joined = text
                        .map((part) => {
                            if (typeof part === "string") {
                                return part
                            }
                            return part?.text || ""
                        })
                        .join("")
                        .trim()

                    if (joined) {
                        return joined
                    }
                }
            }
        }
    }

    return ""
}

/**
 * Upscale an image using the WaveSpeed image-upscaler endpoint.
 *
 * @param {{ imageUrl: string, targetResolution?: string }} options
 * @returns {Promise<unknown>} Raw WaveSpeed API response body.
 */
async function upscaleImage({ imageUrl, targetResolution = "4k" }) {
    const payload = {
        image: imageUrl,
        target_resolution: targetResolution,
        output_format: "png",
        enable_sync_mode: true,
        enable_base64_output: false
    }

    let response = await axios.post(WAVESPEED_UPSCALE_URL, payload, {
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    })

    return response.data
}

/**
 * Replace the active WaveSpeed API key at runtime.
 *
 * Called at server startup (from server.js) to load the persisted key,
 * and by the settings route whenever the user saves a new key.
 *
 * @param {string} key
 */
function setApiKey(key) {
    WAVESPEED_API_KEY = key || "";
}

module.exports = {
    setApiKey,
    uploadBufferToWaveSpeed,
    generateSeedreamEdit,
    upscaleImage,
    callAnyLLM,
    callAnyLLMVision,
    extractLLMText,
    WAVESPEED_BASE_URL,
    WAVESPEED_UPLOAD_URL,
    WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL,
    WAVESPEED_ANY_LLM_URL,
    WAVESPEED_ANY_LLM_VISION_URL,
    MODELS,
    LLM_MODELS
}