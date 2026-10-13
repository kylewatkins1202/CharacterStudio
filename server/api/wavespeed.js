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

// Seedream v5 Lite
const WAVESPEED_SEEDREAM_5_PRO_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v5.0-pro`
const WAVESPEED_SEEDREAM_5_PRO_EDIT_URL = `${WAVESPEED_BASE_URL}/bytedance/seedream-v5.0-pro/edit`

// Qwen Image v2.0
const WAVESPEED_QWEN_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0`
const WAVESPEED_QWEN_EDIT_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0/edit`

// Qwen Image v2.0 Pro
const WAVESPEED_QWEN_PRO_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0-pro`
const WAVESPEED_QWEN_PRO_EDIT_URL = `${WAVESPEED_BASE_URL}/wavespeed-ai/qwen-image-2.0-pro/edit`

// Nano Banana Pro
const WAVESPEED_NANO_BANANA_PRO_URL = `${WAVESPEED_BASE_URL}/google/nano-banana-pro/text-to-image`
const WAVESPEED_NANO_BANANA_PRO_EDIT_URL = `${WAVESPEED_BASE_URL}/google/nano-banana-pro/edit`

// Nano Banana 2.1
const WAVESPEED_NANO_BANANA_2_1_URL = `${WAVESPEED_BASE_URL}/google/nano-banana-2.1/text-to-image`
const WAVESPEED_NANO_BANANA_2_1_EDIT_URL = `${WAVESPEED_BASE_URL}/google/nano-banana-2.1/edit`

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
    "seedream5Pro": {
        modelId: "bytedance/seedream-v5.0-pro",
        editModelId: "bytedance/seedream-v5.0-pro/edit",
        name: "Seedream v5 Pro",
        cost: '.035',
        link: WAVESPEED_SEEDREAM_5_PRO_URL,
        editLink: WAVESPEED_SEEDREAM_5_PRO_EDIT_URL,
        poll: true,
        schema: 'nano-banana'
    },
    "qwen-image-2.0": {
        modelId: "wavespeed-ai/qwen-image-2.0/text-to-image",
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
        modelId: "wavespeed-ai/qwen-image-2.0-pro/text-to-image",
        editModelId: "wavespeed-ai/qwen-image-2.0-pro/edit",
        name: "Qwen Image 2.0 Pro",
        link: WAVESPEED_QWEN_PRO_URL,
        editLink: WAVESPEED_QWEN_PRO_EDIT_URL,
        cost: '.07',
        poll: true,
        min: 512,
        max: 2048
    },
    "nano-banana-pro": {
        modelId:     "google/nano-banana-pro/text-to-image",
        editModelId: "google/nano-banana-pro/edit",
        name:        "Nano Banana Pro",
        link:        WAVESPEED_NANO_BANANA_PRO_URL,
        editLink:    WAVESPEED_NANO_BANANA_PRO_EDIT_URL,
        cost:        ".14",
        poll:        true,
        schema:      "nano-banana",
    },
    "nano-banana-2.1": {
        modelId:     "google/nano-banana-2.1/text-to-image",
        editModelId: "google/nano-banana-2.1/edit",
        name:        "Nano Banana 2.1",
        link:        WAVESPEED_NANO_BANANA_2_1_URL,
        editLink:    WAVESPEED_NANO_BANANA_2_1_EDIT_URL,
        cost:        ".14",
        poll:        true,
        schema:      "nano-banana-2.1",
    }
}

const LLM_MODELS = {
    "google/gemini-2.5-flash": {
        cost: '.001'
    }
}

if (!WAVESPEED_API_KEY) {
    console.warn("Warning: WAVESPEED_API_KEY is not set.")
}

// ─── Model schema cache ───────────────────────────────────────────────────────

/** Cached result of fetchAndCacheModelSchemas() — populated once at startup. */
let _modelSchemaCache = null;

/**
 * Fetch the WaveSpeed model list, filter to our known models, merge text-to-image
 * and edit schemas, and store the result in _modelSchemaCache.
 *
 * Safe to call multiple times — subsequent calls are no-ops if already cached.
 *
 * @returns {Promise<void>}
 */
async function fetchAndCacheModelSchemas() {
    if (_modelSchemaCache) return;

    try {
        const response = await axios.get(`${WAVESPEED_BASE_URL}/models`, {
            headers: getAuthHeaders(),
        });

        const allModels = response?.data?.data || [];

        // Build a lookup from modelId → api_schema request_schema
        const schemaByModelId = {};
        for (const m of allModels) {
            const schema = m.api_schema?.api_schemas?.[0]?.request_schema;
            if (schema) schemaByModelId[m.model_id] = schema;
        }

        // For each MODELS entry, merge the text-to-image and edit schemas
        const merged = {};
        for (const [key, def] of Object.entries(MODELS)) {
            const baseSchema = schemaByModelId[def.modelId] || {};
            const editSchema = def.editModelId ? (schemaByModelId[def.editModelId] || {}) : {};

            // Image constraints come from the edit schema; size/aspect from base
            const sizeProps  = baseSchema.properties?.size || {};
            const aspectProp = baseSchema.properties?.aspect_ratio || {};
            const resProp    = baseSchema.properties?.resolution || {};
            const imgProp    = editSchema.properties?.images || {};

            // Fields that are internal/API-only and should not be surfaced to the frontend
        const INTERNAL_PROPS = new Set(["enable_base64_output", "enable_sync_mode"]);
        const filterProps = (props) => props
            ? Object.fromEntries(Object.entries(props).filter(([k]) => !INTERNAL_PROPS.has(k)))
            : undefined;

        merged[key] = {
                name:        def.name,
                cost:        def.cost,
                baseProperites:  filterProps(baseSchema?.properties),
                editProperties:  filterProps(editSchema?.properties),
                schema:      def.schema || "standard",
                poll:        def.poll,
                // Pixel size (standard models)
                min:         sizeProps.minimum ?? def.min ?? 512,
                max:         sizeProps.maximum ?? def.max ?? 8192,
                // Enum-size models: aspect_ratio enum + resolution enum
                aspectRatios: aspectProp.enum || null,
                resolutions:  resProp.enum    || null,
                // Images constraints from edit schema
                imagesMin:   imgProp.minItems ?? 0,
                imagesMax:   imgProp.maxItems ?? 10,
            };
        }

        _modelSchemaCache = merged;
        console.log("[wavespeed] Model schemas cached for:", Object.keys(merged).join(", "));
    } catch (err) {
        console.warn("[wavespeed] Failed to fetch model schemas, using static fallback:", err.message);
        // Build a minimal cache from static MODELS so callers always get something
        _modelSchemaCache = Object.fromEntries(
            Object.entries(MODELS).map(([key, def]) => [key, {
                name:         def.name,
                cost:         def.cost,
                schema:       def.schema || "standard",
                poll:         def.poll,
                min:          def.min ?? 512,
                max:          def.max ?? 8192,
                aspectRatios: null,
                resolutions:  null,
                imagesMin:    0,
                imagesMax:    10,
            }])
        );
    }
}

/**
 * Return the cached model schemas (or null if not yet fetched).
 * @returns {object|null}
 */
function getModelSchemas() {
    return _modelSchemaCache;
}

/**
 * Call the WaveSpeed pricing endpoint to get the estimated cost for a generation.
 *
 * @param {string} modelId - WaveSpeed model_id string (e.g. "bytedance/seedream-v4.5/edit")
 * @param {object} inputs  - Request inputs (prompt, images, size, etc.)
 * @returns {Promise<{ unitPrice: number, currency: string }>}
 */
async function getModelPricing(modelId, inputs) {
    const response = await axios.post(`${WAVESPEED_BASE_URL}/model/pricing`, { model_id: modelId, inputs }, {
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
    });
    const data = response?.data?.data || {};
    return {
        unitPrice: data.unit_price ?? 0,
        currency:  data.currency ?? "USD",
    };
}

// ─── Auth header helper ───────────────────────────────────────────────────────

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
 * Call a WaveSpeed image-generation or edit endpoint.
 *
 * When `images` is empty the base generation URL (text-to-image) is used.
 * When `images` contains one or more URLs the edit URL is used instead.
 *
 * For models that use an aspect_ratio + resolution enum instead of a pixel size
 * string (detected from the schema cache), pass `aspect_ratio` and `resolution`
 * instead of `size`.
 *
 * Any additional model-specific inputs (e.g. seed, output_format) can be passed
 * via `extraParams` and will be merged into the payload.
 *
 * @param {SeedreamEditOptions} options
 * @returns {Promise<unknown>} Raw WaveSpeed API response body.
 */
async function generateSeedreamEdit({
    model = "seedream",
    images,
    prompt,
    size,
    aspect_ratio,
    resolution,
    extraParams = {},
    enableSyncMode = false,
    enableBase64Output = false
}) {

    if (!_modelSchemaCache) await fetchAndCacheModelSchemas()
    const isEdit     = images.length > 0;
    const link       = isEdit
        ? (MODELS[model]?.editLink || WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL)
        : (MODELS[model]?.link     || WAVESPEED_SEEDREAM_URL);
    const usesEnumSize = (_modelSchemaCache?.[model]?.baseProperites?.resolution !== undefined);

    const payload = {
        ...extraParams,
        prompt,
        enable_sync_mode:     enableSyncMode,
        enable_base64_output: enableBase64Output,
    };

    if (isEdit) payload.images = images;

    if (usesEnumSize) {
        delete payload.size
    } else {
        delete payload.resolution
        delete payload.aspect_ratio
    }

    let response = await axios.post(link, payload, {
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });

    if (MODELS[model]?.poll) {
        console.log(response?.data?.data?.urls?.get);
        const id = response?.data?.data?.id;

        const maxRetries = 60;
        const retryDelay = 10 * 1000;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            response = await axios.get(WAVESPEED_POLLING + id + "/result", {
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
            });
            const status = response?.data?.data?.status;
            if (status === "completed" || status === "failed") return response.data;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
    }

    return response.data;
}

/**
 * Generate an image with Nano Banana Pro (text-to-image or edit).
 *
 * Uses the text-to-image endpoint when no images are provided,
 * and the edit endpoint when images are present — same pattern as generateSeedreamEdit.
 *
 * @param {{ images: string[], prompt: string, aspect_ratio?: string, resolution?: string, enableSyncMode?: boolean, enableBase64Output?: boolean }} options
 * @returns {Promise<unknown>} Raw WaveSpeed API response body.
 */
async function generateNanaBanana({
    images = [],
    prompt,
    aspect_ratio,
    resolution = "1k",
    enableSyncMode = false,
    enableBase64Output = false,
}) {
    const modelDef = MODELS["nano-banana-pro"];
    const isEdit   = images.length > 0;
    const link     = isEdit ? modelDef.editLink : modelDef.link;

    const payload = {
        prompt,
        enable_sync_mode:    enableSyncMode,
        enable_base64_output: enableBase64Output,
    };

    if (isEdit) {
        payload.images = images;
    }
    if (aspect_ratio) payload.aspect_ratio = aspect_ratio;
    if (!isEdit)      payload.resolution = resolution;

    let response = await axios.post(link, payload, {
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });

    if (modelDef.poll) {
        const id = response?.data?.data?.id;
        const maxRetries = 60;
        const retryDelay = 10 * 1000;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            response = await axios.get(WAVESPEED_POLLING + id + "/result", {
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
            });
            const status = response?.data?.data?.status;
            if (status === "completed" || status === "failed") return response.data;
            await new Promise((r) => setTimeout(r, retryDelay));
        }
    }

    return response.data;
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
    generateNanaBanana,
    upscaleImage,
    callAnyLLM,
    callAnyLLMVision,
    extractLLMText,
    fetchAndCacheModelSchemas,
    getModelSchemas,
    getModelPricing,
    WAVESPEED_BASE_URL,
    WAVESPEED_UPLOAD_URL,
    WAVESPEED_SEEDREAM_EDIT_SEQUENTIAL_URL,
    WAVESPEED_ANY_LLM_URL,
    WAVESPEED_ANY_LLM_VISION_URL,
    MODELS,
    LLM_MODELS
}