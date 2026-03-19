const axios = require("axios")
const FormData = require("form-data")

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY
const WAVESPEED_BASE_URL = "https://api.wavespeed.ai/api/v3"

const WAVESPEED_UPLOAD_URL = `${WAVESPEED_BASE_URL}/media/upload/binary`
const WAVESPEED_SEEDREAM_EDIT_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v4.5/edit`
const WAVESPEED_ANY_LLM_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/any-llm`
const WAVESPEED_ANY_LLM_VISION_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/any-llm/vision`

if (!WAVESPEED_API_KEY) {
    console.warn("Warning: WAVESPEED_API_KEY is not set.")
}

function getAuthHeaders(extra = {}) {
    return {
        Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        ...extra
    }
}

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

    const response = await axios.post(WAVESPEED_SEEDREAM_EDIT_URL, payload, {
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
 * `images` should be an array of publicly reachable URLs, typically WaveSpeed upload URLs.
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
 * Best-effort extraction of the final text from a WaveSpeed Any LLM / Vision response.
 * This keeps tagCompiler.js simpler.
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
                const text =
          item?.text ||
          item?.message?.content ||
          item?.content ||
          item?.output_text

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

module.exports = {
    uploadBufferToWaveSpeed,
    generateSeedreamEdit,
    callAnyLLM,
    callAnyLLMVision,
    extractLLMText,
    WAVESPEED_BASE_URL,
    WAVESPEED_UPLOAD_URL,
    WAVESPEED_SEEDREAM_EDIT_URL,
    WAVESPEED_ANY_LLM_URL,
    WAVESPEED_ANY_LLM_VISION_URL
}