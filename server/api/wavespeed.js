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
const WAVESPEED_SEEDREAM_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v4.5`
const WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v4.5/edit-sequential`
const WAVESPEED_ANY_LLM_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/any-llm`
const WAVESPEED_ANY_LLM_VISION_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/any-llm/vision`

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
    images,
    prompt,
    size,
    enableSyncMode = true,
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

    const response = await axios.post(images.length === 0 ? WAVESPEED_SEEDREAM_URL: WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL, payload, {
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    })

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
    callAnyLLM,
    callAnyLLMVision,
    extractLLMText,
    WAVESPEED_BASE_URL,
    WAVESPEED_UPLOAD_URL,
    WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL,
    WAVESPEED_ANY_LLM_URL,
    WAVESPEED_ANY_LLM_VISION_URL
}