/**
 * tagCompiler.js
 *
 * Responsibilities:
 * - Extract @tags from a user prompt
 * - Optionally enrich tag lock descriptions with a vision-capable LLM
 * - Collapse tag image groups into collages when total inputs exceed model limits
 * - Use an LLM to convert a natural-language prompt into structured planning JSON
 * - Retry once if the LLM returns malformed JSON
 * - Deterministically convert the structured plan into:
 *   - a final Seedream raw prompt
 *   - an ordered images[] array
 */

const crypto = require("crypto")
const { createImageGridFromBuffers, assetUrls } = require("./imageCollage")
const {
    uploadBufferToWaveSpeed,
    callAnyLLM,
    callAnyLLMVision,
    extractLLMText
} = require("./wavespeed")

/** Maximum number of input images supported by the current Seedream edit flow. */
const MODEL_MAX_IMAGES = 10

/** Supported tag types. */
const TAG_TYPES = ["character", "prop", "outfit", "location"]

/** Supported asset groups stored on each tag record. */
const ASSET_GROUPS = ["face", "body", "prop", "outfit", "location"]

/** Allowed horizontal placement values for characters. */
const POSITION_HORIZONTAL = [
    "far_left",
    "left",
    "center_left",
    "center",
    "center_right",
    "right",
    "far_right",
    null
]

/** Allowed vertical placement values for characters. */
const POSITION_VERTICAL = [
    "top",
    "upper_middle",
    "middle",
    "lower_middle",
    "bottom",
    null
]

/** Allowed depth placement values for characters. */
const POSITION_DEPTH = [
    "foreground",
    "midground",
    "background",
    null
]

/** Allowed relative position relations between characters. */
const RELATIONS = [
    "left_of",
    "right_of",
    "in_front_of",
    "behind",
    "next_to",
    "between",
    "overlapping",
    "facing",
    null
]

/** Allowed character facing/orientation values. */
const FACING_VALUES = [
    "camera",
    "left",
    "right",
    "away",
    "toward_subject",
    "downward",
    "upward",
    "three_quarter_left",
    "three_quarter_right",
    null
]

/** Allowed character stance values. */
const STANCE_VALUES = [
    "standing",
    "sitting",
    "kneeling",
    "crouching",
    "lying",
    "leaning",
    "walking",
    "running",
    "dancing",
    null
]

/** Allowed support-surface values. */
const SUPPORT_VALUES = [
    "floor",
    "bed",
    "chair",
    "couch",
    "wall",
    "table",
    "car",
    "ground",
    "stairs",
    null
]

/**
 * Create an empty assets object for a tag.
 *
 * @returns {{
 *   face: any[],
 *   body: any[],
 *   prop: any[],
 *   outfit: any[],
 *   location: any[]
 * }}
 */
function createEmptyAssets() {
    return {
        face: [],
        body: [],
        prop: [],
        outfit: [],
        location: []
    }
}

/**
 * Create default lock-description fields based on tag type.
 *
 * @param {string} type
 * @returns {{
 *   basicDescription?: string,
 *   appearanceDescription?: string,
 *   bodyDescription?: string
 * }}
 */
function createDefaultLocks(type) {
    if (type === "character") {
        return {
            basicDescription: "",
            appearanceDescription: "",
            bodyDescription: ""
        }
    }

    return {
        basicDescription: ""
    }
}

/**
 * Build or normalize a tag record into the expected shape.
 *
 * @param {{
 *   key: string,
 *   type: string,
 *   existingTag?: any
 * }} params
 * @returns {any}
 */
function buildTagRecord({ key, type, existingTag }) {
    const base = existingTag || {
        key,
        type,
        assets: createEmptyAssets(),
        lock: createDefaultLocks(type),
        meta: {}
    }

    base.key = key
    base.type = type
    base.assets = base.assets || createEmptyAssets()
    base.lock = base.lock || createDefaultLocks(type)
    base.meta = base.meta || {}

    for (const group of ASSET_GROUPS) {
        if (!Array.isArray(base.assets[group])) {
            base.assets[group] = []
        }
    }

    return base
}

/**
 * Extract all unique @tags from a prompt.
 *
 * Example:
 * "A photo of @riley at @club with @money" -> ["riley", "club", "money"]
 *
 * @param {string} prompt
 * @returns {string[]}
 */
function extractTags(prompt) {
    const matches = String(prompt || "").match(/@[a-zA-Z0-9_-]+/g) || []
    return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))]
}

/**
 * Count the total number of images referenced across all tag asset groups.
 *
 * @param {any[]} tags
 * @returns {number}
 */
function countTagImages(tags) {
    let total = 0

    for (const tag of tags) {
        for (const group of ASSET_GROUPS) {
            total += Array.isArray(tag.assets[group]) ? tag.assets[group].length : 0
        }
    }

    return total
}

/**
 * Create a stable-ish unique filename for generated collage uploads.
 *
 * @param {string} prefix
 * @param {string} [suffix="jpg"]
 * @returns {string}
 */
function stableFilename(prefix, suffix = "jpg") {
    const id = crypto.randomBytes(6).toString("hex")
    return `${prefix}-${Date.now()}-${id}.${suffix}`
}

/**
 * Collapse multiple images in a single asset group into one uploaded collage image.
 * If there is only one image already, it is returned unchanged.
 *
 * Important:
 * This expects each asset to carry a `buffer` field locally so we can build a collage.
 *
 * @param {string} tagKey
 * @param {string} groupName
 * @param {Array<{buffer?: Buffer, url?: string}>} assets
 * @returns {Promise<any[]>}
 */
async function collapseAssetGroupToSingleUpload(tagKey, groupName, assets) {
    if (!Array.isArray(assets) || assets.length === 0) {
        return []
    }

    if (assets.length === 1) {
        return assets
    }

    const buffers = await Promise.all(
        assets.map(async (asset) => {
            if (!asset.url) throw new Error(`Cannot collapse ${tagKey}.${groupName}: asset has no url or buffer`)
            const res = await fetch(asset.url)
            if (!res.ok) throw new Error(`Failed to fetch asset ${asset.url}: ${res.status}`)
            return Buffer.from(await res.arrayBuffer())
        })
    )

    const collageBuffer = await createImageGridFromBuffers(buffers)
    const filename = stableFilename(`${tagKey}-${groupName}`, "jpg")
    const uploaded = await uploadBufferToWaveSpeed(collageBuffer, filename, "image/jpeg")

    return [{
        url: uploaded.url,
        filename,
        mimeType: "image/jpeg",
        source: "collage",
        collapsed: true
    }]
}

/**
 * If total images exceed the model max, collapse each tag's image groups.
 *
 * Collapse strategy:
 * - character: face group -> 1 image, body group -> 1 image
 * - prop: prop group -> 1 image
 * - outfit: outfit group -> 1 image
 * - location: location group -> 1 image
 *
 * @param {any[]} tags
 * @returns {Promise<any[]>}
 */
async function collapseTagsIfNeeded(tags) {
    const total = countTagImages(tags)
    if (total <= MODEL_MAX_IMAGES) {
        return tags
    }

    const collapsed = []

    for (const tag of tags) {
        const nextTag = {
            ...tag,
            assets: createEmptyAssets()
        }

        if (tag.type === "character") {
            nextTag.assets.face = await collapseAssetGroupToSingleUpload(tag.key, "face", tag.assets.face || [])
            nextTag.assets.body = await collapseAssetGroupToSingleUpload(tag.key, "body", tag.assets.body || [])
        }
        else if (tag.type === "prop") {
            nextTag.assets.prop = await collapseAssetGroupToSingleUpload(tag.key, "prop", tag.assets.prop || [])
        }
        else if (tag.type === "outfit") {
            nextTag.assets.outfit = await collapseAssetGroupToSingleUpload(tag.key, "outfit", tag.assets.outfit || [])
        }
        else if (tag.type === "location") {
            nextTag.assets.location = await collapseAssetGroupToSingleUpload(tag.key, "location", tag.assets.location || [])
        }

        collapsed.push(nextTag)
    }

    return collapsed
}

/**
 * Produce a lightweight summary of a tag for the planning LLM.
 * This avoids sending all asset URLs and unnecessary noise.
 *
 * @param {any} tag
 * @returns {any}
 */
function getTagSummary(tag) {
    return {
        key: tag.key,
        type: tag.type,
        assetCounts: {
            face: (tag.assets.face || []).length,
            body: (tag.assets.body || []).length,
            prop: (tag.assets.prop || []).length,
            outfit: (tag.assets.outfit || []).length,
            location: (tag.assets.location || []).length
        },
        lock: {
            basicDescription: tag.lock?.basicDescription || "",
            appearanceDescription: tag.lock?.appearanceDescription || "",
            bodyDescription: tag.lock?.bodyDescription || ""
        }
    }
}

/**
 * Parse JSON from raw LLM text.
 *
 * Supports:
 * - direct JSON
 * - fenced ```json blocks
 * - extracting the outermost {...} block
 *
 * @param {string} text
 * @returns {any}
 */
function parseJsonFromLLMText(text) {
    const raw = String(text || "").trim()
    if (!raw) {
        throw new Error("LLM returned empty text")
    }

    try {
        return JSON.parse(raw)
    }
    catch {}

    const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i)
    if (fenced) {
        return JSON.parse(fenced[1].trim())
    }

    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(raw.slice(start, end + 1))
    }

    throw new Error("Could not parse JSON from LLM response")
}

/**
 * Normalize enum-like values against an allowed list.
 *
 * @param {any} value
 * @param {Array<string|null>} allowed
 * @returns {string|null}
 */
function cleanEnum(value, allowed) {
    if (value === null || value === undefined || value === "") {
        return null
    }
    const normalized = String(value).trim().toLowerCase()
    return allowed.includes(normalized) ? normalized : null
}

/**
 * Normalize a string field.
 *
 * @param {any} value
 * @returns {string}
 */
function cleanString(value) {
    return typeof value === "string" ? value.trim() : ""
}

/**
 * Normalize a relative-position object and discard invalid targets.
 *
 * @param {any} value
 * @param {Set<string>} knownTags
 * @returns {{relation: string, targetTag: string|null, targetTags: string[]}|null}
 */
function cleanRelativePosition(value, knownTags) {
    if (!value || typeof value !== "object") {
        return null
    }

    const relation = cleanEnum(value.relation, RELATIONS)
    if (!relation) {
        return null
    }

    const targetTag =
    typeof value.targetTag === "string" && knownTags.has(value.targetTag.toLowerCase())
        ? value.targetTag.toLowerCase()
        : null

    const targetTags = Array.isArray(value.targetTags)
        ? value.targetTags
            .map((tag) => (typeof tag === "string" ? tag.toLowerCase() : null))
            .filter((tag) => tag && knownTags.has(tag))
        : []

    return {
        relation,
        targetTag,
        targetTags
    }
}

/**
 * Build the main system prompt for the planning LLM.
 *
 * This prompt tells the LLM to:
 * - understand the natural-language user prompt
 * - map it to structured JSON
 * - separate character placement into multiple spatial fields
 * - place plain-text clothing into wardrobeDescription
 * - use outfits[] only for tagged outfit references
 *
 * @returns {string}
 */
function buildPromptPlanningSystemPrompt() {
    return [
        "You are a prompt planner for an image generation backend.",
        "Convert a user prompt containing @tags into structured JSON.",
        "Return JSON only. Do not include markdown fences or commentary.",
        "Do not invent tags that are not in the provided availableTags list.",
        "Use concise, literal descriptions.",
        "Separate character placement into structured spatial fields instead of a single role field.",
        "",
        "Return this exact JSON shape:",
        "{",
        '  "sceneDescription": "string",',
        '  "characters": [',
        "    {",
        '      "tag": "string",',
        '      "label": "string",',
        '      "position": {',
        '        "horizontal": "far_left|left|center_left|center|center_right|right|far_right|null",',
        '        "vertical": "top|upper_middle|middle|lower_middle|bottom|null",',
        '        "depth": "foreground|midground|background|null"',
        "      },",
        '      "relativePosition": {',
        '        "relation": "left_of|right_of|in_front_of|behind|next_to|between|overlapping|facing|null",',
        '        "targetTag": "string|null",',
        '        "targetTags": ["string"]',
        "      },",
        '      "facing": "camera|left|right|away|toward_subject|downward|upward|three_quarter_left|three_quarter_right|null",',
        '      "stance": "standing|sitting|kneeling|crouching|lying|leaning|walking|running|dancing|null",',
        '      "support": "floor|bed|chair|couch|wall|table|car|ground|stairs|null",',
        '      "poseDescription": "string",',
        '      "wardrobeDescription": "string",',
        '      "useAppearance": true,',
        '      "useBodyShape": true',
        "    }",
        "  ],",
        '  "props": [',
        "    {",
        '      "tag": "string",',
        '      "placement": "string",',
        '      "useBasicLock": true',
        "    }",
        "  ],",
        '  "outfits": [',
        "    {",
        '      "tag": "string",',
        '      "placement": "string",',
        '      "useBasicLock": true',
        "    }",
        "  ],",
        '  "locations": [',
        "    {",
        '      "tag": "string",',
        '      "useBasicLock": true',
        "    }",
        "  ],",
        '  "extraDirectives": ["string"]',
        "}",
        "",
        "Guidelines:",
        "- label should be a descriptive noun phrase extracted from the prompt that identifies the character's role or position (e.g. 'the woman on the left', 'the woman in the center'). Never use the tag key as the label.",
        "- Keep character appearance out of poseDescription.",
        "- Put clothing described directly in the prompt into wardrobeDescription on the relevant character.",
        "- Use outfits[] only for tagged outfit references such as @dress1 or @look2.",
        "- Keep clothing details out of poseDescription unless absolutely necessary.",
        "- Use position fields when the prompt implies screen placement or depth.",
        "- Use relativePosition when a character is described in relation to another character.",
        "- targetTag should be used for one target. targetTags should be used for multi-target relations like between.",
        "- Use null for unknown placement fields.",
        "- Props are handheld or scene objects. Locations are environments/backgrounds. Outfits are clothing references.",
        "- sceneDescription should contain ALL non-tag scene lines verbatim, preserving paragraph breaks as \\n\\n between them. Do not summarize or restructure the scene prose.",
"- Do not move scene context into character fields and do not move character context into sceneDescription.",
        "- Do not add explanations outside JSON."
    ].join("\n")
}

/**
 * Build a system prompt for the one-time JSON repair fallback.
 *
 * @returns {string}
 */
function buildRepairJsonSystemPrompt() {
    return [
        "You are repairing a malformed JSON response for an image prompt planner.",
        "Return valid JSON only.",
        "Do not include markdown fences.",
        "Do not include explanation.",
        "Preserve the intended meaning of the original content.",
        "Use the required schema exactly."
    ].join("\n")
}

/**
 * Ask the LLM to repair invalid JSON once.
 *
 * This is a fallback used when the initial planner response is malformed.
 *
 * @param {{
 *   initialText: string,
 *   originalPrompt: string,
 *   tagSummaries: any[],
 *   tagLocks: any,
 *   llmOptions?: any
 * }} params
 * @returns {Promise<any>}
 */
async function parsePromptPlanJsonWithRetry({
    initialText,
    originalPrompt,
    tagSummaries,
    tagLocks,
    llmOptions = {}
}) {
    try {
        return parseJsonFromLLMText(initialText)
    }
    catch (firstError) {
        const repairPrompt = [
            "The previous response was supposed to be valid JSON for the required schema, but it was invalid.",
            "Repair it into valid JSON only.",
            "",
            "ORIGINAL_USER_PROMPT:",
            originalPrompt,
            "",
            "AVAILABLE_TAGS:",
            JSON.stringify(tagSummaries, null, 2),
            "",
            "REQUESTED_TAG_LOCKS:",
            JSON.stringify(tagLocks || {}, null, 2),
            "",
            "INVALID_RESPONSE_TO_REPAIR:",
            initialText
        ].join("\n")

        const repairResult = await callAnyLLM({
            prompt: repairPrompt,
            systemPrompt: `${buildPromptPlanningSystemPrompt()}\n\n${buildRepairJsonSystemPrompt()}`,
            model: llmOptions.model,
            temperature: 0,
            maxTokens: llmOptions.maxTokens ?? 1800,
            reasoning: false,
            priority: llmOptions.priority,
            enableSyncMode: llmOptions.enableSyncMode ?? true
        })

        const repairedText = extractLLMText(repairResult)

        try {
            return parseJsonFromLLMText(repairedText)
        }
        catch (secondError) {
            const error = new Error(
                `Failed to parse LLM plan JSON after retry. First error: ${firstError.message}. Second error: ${secondError.message}.`
            )
            error.firstResponse = initialText
            error.secondResponse = repairedText
            throw error
        }
    }
}

/**
 * Normalize the raw parsed plan from the LLM into a validated internal shape.
 *
 * It:
 * - drops unknown tags
 * - validates enum fields
 * - applies explicit tagLocks from the request as overrides
 *
 * @param {any} plan
 * @param {Record<string, any>} availableTags
 * @param {Record<string, any>} [requestedTagLocks={}]
 * @returns {any}
 */
function normalizeParsedPlan(plan, availableTags, requestedTagLocks = {}) {
    const safePlan = {
        sceneDescription: typeof plan?.sceneDescription === "string" ? plan.sceneDescription.trim() : "",
        characters: [],
        props: [],
        outfits: [],
        locations: [],
        extraDirectives: Array.isArray(plan?.extraDirectives)
            ? plan.extraDirectives.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim())
            : []
    }

    const knownTagMap = new Map(Object.entries(availableTags))
    const knownTags = new Set(Object.keys(availableTags))

    for (const char of Array.isArray(plan?.characters) ? plan.characters : []) {
        if (!char || typeof char !== "object") {
            continue
        }

        const tag = String(char.tag || "").toLowerCase()
        if (!knownTags.has(tag) || knownTagMap.get(tag).type !== "character") {
            continue
        }

        const requested = requestedTagLocks[tag] || {}

        safePlan.characters.push({
            tag,
            label: cleanString(char.label) || tag,
            position: {
                horizontal: cleanEnum(char?.position?.horizontal, POSITION_HORIZONTAL),
                vertical: cleanEnum(char?.position?.vertical, POSITION_VERTICAL),
                depth: cleanEnum(char?.position?.depth, POSITION_DEPTH)
            },
            relativePosition: cleanRelativePosition(char.relativePosition, knownTags),
            facing: cleanEnum(char.facing, FACING_VALUES),
            stance: cleanEnum(char.stance, STANCE_VALUES),
            support: cleanEnum(char.support, SUPPORT_VALUES),
            poseDescription: cleanString(char.poseDescription),
            wardrobeDescription: cleanString(char.wardrobeDescription),
            useAppearance: requested.appearance !== undefined ? !!requested.appearance : !!char.useAppearance,
            useBodyShape: requested.bodyShape !== undefined ? !!requested.bodyShape : !!char.useBodyShape
        })
    }

    for (const prop of Array.isArray(plan?.props) ? plan.props : []) {
        if (!prop || typeof prop !== "object") {
            continue
        }
        const tag = String(prop.tag || "").toLowerCase()
        if (!knownTags.has(tag) || knownTagMap.get(tag).type !== "prop") {
            continue
        }

        const requested = requestedTagLocks[tag] || {}

        safePlan.props.push({
            tag,
            placement: cleanString(prop.placement),
            useBasicLock: requested.basic !== undefined ? !!requested.basic : !!prop.useBasicLock
        })
    }

    for (const outfit of Array.isArray(plan?.outfits) ? plan.outfits : []) {
        if (!outfit || typeof outfit !== "object") {
            continue
        }
        const tag = String(outfit.tag || "").toLowerCase()
        if (!knownTags.has(tag) || knownTagMap.get(tag).type !== "outfit") {
            continue
        }

        const requested = requestedTagLocks[tag] || {}

        safePlan.outfits.push({
            tag,
            placement: cleanString(outfit.placement),
            useBasicLock: requested.basic !== undefined ? !!requested.basic : !!outfit.useBasicLock
        })
    }

    for (const location of Array.isArray(plan?.locations) ? plan.locations : []) {
        if (!location || typeof location !== "object") {
            continue
        }
        const tag = String(location.tag || "").toLowerCase()
        if (!knownTags.has(tag) || knownTagMap.get(tag).type !== "location") {
            continue
        }

        const requested = requestedTagLocks[tag] || {}

        safePlan.locations.push({
            tag,
            useBasicLock: requested.basic !== undefined ? !!requested.basic : !!location.useBasicLock
        })
    }

    return safePlan
}

/**
 * Ask the text LLM to parse the prompt into structured planning JSON.
 *
 * This function now includes a one-time retry repair flow if the first LLM
 * response is not valid JSON.
 *
 * @param {{
 *   prompt: string,
 *   tags: any[],
 *   tagLocks?: any,
 *   llmOptions?: any
 * }} params
 * @returns {Promise<any>}
 */
async function parsePromptWithLLM({ prompt, tags, tagLocks = {}, llmOptions = {} }) {
    const availableTags = Object.fromEntries(tags.map((tag) => [tag.key, tag]))
    const tagSummaries = tags.map(getTagSummary)

    const userPrompt = [
        "USER_PROMPT:",
        prompt,
        "",
        "AVAILABLE_TAGS:",
        JSON.stringify(tagSummaries, null, 2),
        "",
        "REQUESTED_TAG_LOCKS:",
        JSON.stringify(tagLocks || {}, null, 2)
    ].join("\n")

    const result = await callAnyLLM({
        prompt: userPrompt,
        systemPrompt: buildPromptPlanningSystemPrompt(),
        model: llmOptions.model,
        temperature: llmOptions.temperature ?? 0.1,
        maxTokens: llmOptions.maxTokens ?? 1800,
        reasoning: llmOptions.reasoning ?? false,
        priority: llmOptions.priority,
        enableSyncMode: llmOptions.enableSyncMode ?? true
    })

    const text = extractLLMText(result)

    const parsed = await parsePromptPlanJsonWithRetry({
        initialText: text,
        originalPrompt: prompt,
        tagSummaries,
        tagLocks,
        llmOptions
    })

    return normalizeParsedPlan(parsed, availableTags, tagLocks)
}

/**
 * Build the vision prompt for character appearance or body analysis.
 *
 * @param {{mode: "appearance"|"body"}} params
 * @returns {string}
 */
function buildCharacterVisionPrompt({ mode }) {
    if (mode === "appearance") {
        return [
            "Describe this character's visible facial appearance and upper-body styling for image generation.",
            "Focus on identity-relevant visible traits only.",
            "Include hair, makeup, skin tone, face shape, brows, lips, and other clearly visible styling.",
            "Do not mention pose, camera angle, background, or image quality.",
            "Return one concise sentence fragment only."
        ].join(" ")
    }

    return [
        "Describe this character's body shape/build for image generation.",
        "Focus on overall body proportions and silhouette only.",
        "Do not mention pose, clothing details, camera angle, background, or image quality.",
        "Return one concise sentence fragment only."
    ].join(" ")
}

/**
 * Build the vision prompt for non-character tags.
 *
 * @param {"location"|"outfit"|"prop"} tagType
 * @returns {string}
 */
function buildBasicVisionPrompt(tagType) {
    if (tagType === "location") {
        return [
            "Describe this location/background for image generation.",
            "Focus on environment, mood, lighting style, materials, and layout.",
            "Do not mention camera quality or artistic commentary.",
            "Return one concise sentence fragment only."
        ].join(" ")
    }

    if (tagType === "outfit") {
        return [
            "Describe this outfit for image generation.",
            "Focus on garment type, material, color, fit, and styling.",
            "Return one concise sentence fragment only."
        ].join(" ")
    }

    return [
        "Describe this prop/object for image generation.",
        "Focus on its appearance, material, color, and recognizable form.",
        "Return one concise sentence fragment only."
    ].join(" ")
}

/**
 * Optionally enrich tags with vision-generated lock descriptions.
 *
 * This is useful when:
 * - a character has face/body images but no saved descriptions yet
 * - a prop/location/outfit has images but no basic description yet
 *
 * @param {any[]} tags
 * @param {{
 *   enable?: boolean,
 *   force?: boolean,
 *   model?: string,
 *   temperature?: number,
 *   maxTokens?: number,
 *   reasoning?: boolean,
 *   priority?: string,
 *   enableSyncMode?: boolean
 * }} [options={}]
 * @returns {Promise<any[]>}
 */
async function enrichTagLocksWithVision(tags, options = {}) {
    const {
        enable = false,
        force = false,
        model,
        temperature = 0.1,
        maxTokens = 300,
        reasoning = false,
        priority,
        enableSyncMode = true
    } = options

    if (!enable) {
        return tags
    }

    const out = []

    for (const tag of tags) {
        const nextTag = {
            ...tag,
            lock: {
                basicDescription: tag.lock?.basicDescription || "",
                appearanceDescription: tag.lock?.appearanceDescription || "",
                bodyDescription: tag.lock?.bodyDescription || ""
            }
        }

        if (tag.type === "character") {
            const faceUrls = assetUrls(tag.assets.face)
            const bodyUrls = assetUrls(tag.assets.body)

            if ((force || !nextTag.lock.appearanceDescription) && faceUrls.length) {
                const result = await callAnyLLMVision({
                    prompt: buildCharacterVisionPrompt({ mode: "appearance" }),
                    images: faceUrls,
                    model,
                    temperature,
                    maxTokens,
                    reasoning,
                    priority,
                    enableSyncMode
                })

                const text = extractLLMText(result)
                if (text) {
                    nextTag.lock.appearanceDescription = text.replace(/\s+/g, " ").trim()
                }
            }

            if ((force || !nextTag.lock.bodyDescription) && bodyUrls.length) {
                const result = await callAnyLLMVision({
                    prompt: buildCharacterVisionPrompt({ mode: "body" }),
                    images: bodyUrls,
                    model,
                    temperature,
                    maxTokens,
                    reasoning,
                    priority,
                    enableSyncMode
                })

                const text = extractLLMText(result)
                if (text) {
                    nextTag.lock.bodyDescription = text.replace(/\s+/g, " ").trim()
                }
            }
        }
        else {
            const urls =
        tag.type === "prop"
            ? assetUrls(tag.assets.prop)
            : tag.type === "outfit"
                ? assetUrls(tag.assets.outfit)
                : assetUrls(tag.assets.location)

            if ((force || !nextTag.lock.basicDescription) && urls.length) {
                const result = await callAnyLLMVision({
                    prompt: buildBasicVisionPrompt(tag.type),
                    images: urls,
                    model,
                    temperature,
                    maxTokens,
                    reasoning,
                    priority,
                    enableSyncMode
                })

                const text = extractLLMText(result)
                if (text) {
                    nextTag.lock.basicDescription = text.replace(/\s+/g, " ").trim()
                }
            }
        }

        out.push(nextTag)
    }

    return out
}

/**
 * Get the face/body assets used for character image references.
 *
 * @param {any} tag
 * @returns {{face: any[], body: any[]}}
 */
function getCharacterAssetsForPlan(tag) {
    return {
        face: tag.assets.face || [],
        body: tag.assets.body || []
    }
}

/**
 * Get the single relevant asset group for a non-character tag.
 *
 * @param {any} tag
 * @returns {any[]}
 */
function getNonCharacterAssetsForPlan(tag) {
    if (tag.type === "prop") {
        return tag.assets.prop || []
    }
    if (tag.type === "outfit") {
        return tag.assets.outfit || []
    }
    if (tag.type === "location") {
        return tag.assets.location || []
    }
    return []
}

/**
 * Build a human-readable phrase from structured position values.
 *
 * Example:
 * { depth: "foreground", horizontal: "center_right", vertical: "lower_middle" }
 * -> "foreground lower middle center right"
 *
 * @param {{horizontal?: string|null, vertical?: string|null, depth?: string|null}} [position={}]
 * @returns {string}
 */
function buildPositionPhrase(position = {}) {
    const parts = []

    if (position.depth) {
        parts.push(position.depth)
    }
    if (position.vertical && position.vertical !== "middle") {
        parts.push(position.vertical.replace(/_/g, " "))
    }
    if (position.horizontal && position.horizontal !== "center") {
        parts.push(position.horizontal.replace(/_/g, " "))
    }

    return parts.join(" ").trim()
}

/**
 * Build a human-readable relative-position phrase.
 *
 * @param {{relation?: string, targetTag?: string|null, targetTags?: string[]}|null} relativePosition
 * @returns {string}
 */
function buildRelativePositionPhrase(relativePosition) {
    if (!relativePosition || !relativePosition.relation) {
        return ""
    }

    const relationMap = {
        left_of: "to the left of",
        right_of: "to the right of",
        in_front_of: "in front of",
        behind: "behind",
        next_to: "next to",
        between: "between",
        overlapping: "overlapping",
        facing: "facing"
    }

    const relationText = relationMap[relativePosition.relation] || relativePosition.relation.replace(/_/g, " ")

    if (relativePosition.relation === "between" && Array.isArray(relativePosition.targetTags) && relativePosition.targetTags.length >= 2) {
        return `${relationText} ${relativePosition.targetTags.join(" and ")}`
    }

    if (relativePosition.targetTag) {
        return `${relationText} ${relativePosition.targetTag}`
    }

    if (Array.isArray(relativePosition.targetTags) && relativePosition.targetTags.length) {
        return `${relationText} ${relativePosition.targetTags.join(", ")}`
    }

    return relationText
}

/**
 * Build a full scene sentence for a character using the structured fields.
 *
 * This sentence is part of the final raw prompt and is intended to:
 * - anchor character placement
 * - include stance/facing/support
 * - include wardrobeDescription for text-described outfits
 * - include poseDescription
 *
 * @param {any} character
 * @returns {string}
 */
function buildCharacterSceneSentence(character) {
    const label = character.label || character.tag || "subject"
    const parts = []

    const relativePhrase = buildRelativePositionPhrase(character.relativePosition)
    if (relativePhrase) parts.push(relativePhrase)

    if (character.wardrobeDescription) parts.push(`wearing ${character.wardrobeDescription}`)
    if (character.poseDescription) parts.push(character.poseDescription)

    const body = parts.filter(Boolean).join(", ")
    return body ? `${label}, ${body}.` : `${label}.`
}

/**
 * Build a concise label used inside image-reference directives.
 *
 * @param {any} character
 * @returns {string}
 */
function buildCharacterDirectiveLabel(character) {
    return character.label || character.tag || "subject"
}

/**
 * Deterministically build the final raw prompt and ordered images[] from the parsed plan.
 *
 * @param {{
 *   originalPrompt: string,
 *   parsedPlan: any,
 *   tagMap: Record<string, any>
 * }} params
 * @returns {{
 *   rawPrompt: string,
 *   images: string[],
 *   directives: string[],
 *   sceneLines: string[]
 * }}
 */
function buildRawPromptFromPlan({ originalPrompt, parsedPlan, tagMap }) {
    const images = []
    const directives = []
    const sceneLines = []

    let imageIndex = 1

    if (parsedPlan.sceneDescription) {
        // Split on double newlines to preserve paragraph breaks from the original
        parsedPlan.sceneDescription
            .split(/\n{2,}/)
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(para => sceneLines.push(para))
    }
    else {
        sceneLines.push(originalPrompt)
    }

    for (const character of parsedPlan.characters) {
        const tag = tagMap[character.tag]
        if (!tag || tag.type !== "character") {
            continue
        }

        const sceneSentence = buildCharacterSceneSentence(character)

        const label = buildCharacterDirectiveLabel(character)
        const assets = getCharacterAssetsForPlan(tag)

        let faceStart = null
        let faceEnd = null
        let bodyImageIndex = null

        if (assets.face.length) {
            faceStart = imageIndex
            for (const asset of assets.face) {
                images.push(asset.url)
                imageIndex += 1
            }
            faceEnd = imageIndex - 1
        }

        if (assets.body.length) {
            bodyImageIndex = imageIndex
            images.push(assets.body[0].url)
            imageIndex += 1
        }

        const poseClause = character.poseDescription
            ? `, ${character.poseDescription}`
            : ""
        const NAKED_WORDS = ["naked", "nude", "nothing", "bare", "undressed", "unclothed", "no clothes", "no clothing"];

        const wardrobeClause = (() => {
            if (!character.wardrobeDescription) return "";
            const lower = character.wardrobeDescription.toLowerCase().trim();
            // If the description just means naked, say it directly without "wearing"
            if (NAKED_WORDS.some((w) => lower === w || lower === `is ${w}` || lower === `are ${w}`)) {
                return `, naked`;
            }
            return ` wearing ${character.wardrobeDescription}`;
        })();

        if (character.useAppearance && faceStart !== null) {
            const range = faceEnd > faceStart ? `${faceStart}-${faceEnd}` : `${faceStart}`
            directives.push(`Use image[${range}] exclusively for ${label}${poseClause}${wardrobeClause}.`)
        }

        if (character.useBodyShape && bodyImageIndex !== null) {
            directives.push(`Use image[${bodyImageIndex}] exclusively for the body shape of ${label}.`)
        }

        if (character.useAppearance && tag.lock?.appearanceDescription) {
            directives.push(`${label} is ${tag.lock.appearanceDescription}.`)
        }

        if (character.useBodyShape && tag.lock?.bodyDescription) {
            directives.push(`${label} has ${tag.lock.bodyDescription}.`)
        }
    }

    for (const prop of parsedPlan.props) {
        const tag = tagMap[prop.tag]
        if (!tag || tag.type !== "prop") {
            continue
        }

        const assets = getNonCharacterAssetsForPlan(tag)
        if (!assets.length) {
            continue
        }

        const start = imageIndex
        for (const asset of assets) {
            images.push(asset.url)
            imageIndex += 1
        }
        const end = imageIndex - 1

        if (prop.placement) {
            sceneLines.push(`Include ${prop.tag} ${prop.placement}.`)
        }

        if (start === end) {
            directives.push(`Use image[${start}] as reference for ${prop.tag}.`)
        }
        else {
            directives.push(`Use image[${start}-${end}] as reference for ${prop.tag}.`)
        }

        if (prop.useBasicLock && tag.lock?.basicDescription) {
            directives.push(`${prop.tag} should appear as ${tag.lock.basicDescription}.`)
        }
    }

    for (const outfit of parsedPlan.outfits) {
        const tag = tagMap[outfit.tag]
        if (!tag || tag.type !== "outfit") {
            continue
        }

        const assets = getNonCharacterAssetsForPlan(tag)
        if (!assets.length) {
            continue
        }

        const start = imageIndex
        for (const asset of assets) {
            images.push(asset.url)
            imageIndex += 1
        }
        const end = imageIndex - 1

        if (outfit.placement) {
            sceneLines.push(`Include ${outfit.tag} ${outfit.placement}.`)
        }

        if (start === end) {
            directives.push(`Use image[${start}] as reference for ${outfit.tag}.`)
        }
        else {
            directives.push(`Use image[${start}-${end}] as reference for ${outfit.tag}.`)
        }

        if (outfit.useBasicLock && tag.lock?.basicDescription) {
            directives.push(`${outfit.tag} should appear as ${tag.lock.basicDescription}.`)
        }
    }

    for (const location of parsedPlan.locations) {
        const tag = tagMap[location.tag]
        if (!tag || tag.type !== "location") {
            continue
        }

        const assets = getNonCharacterAssetsForPlan(tag)
        if (!assets.length) {
            continue
        }

        const start = imageIndex
        for (const asset of assets) {
            images.push(asset.url)
            imageIndex += 1
        }
        const end = imageIndex - 1

        if (start === end) {
            directives.push(`Use image[${start}] as reference for ${location.tag}.`)
        }
        else {
            directives.push(`Use image[${start}-${end}] as reference for ${location.tag}.`)
        }

        if (location.useBasicLock && tag.lock?.basicDescription) {
            directives.push(`${location.tag} should appear as ${tag.lock.basicDescription}.`)
        }
    }

    for (const line of parsedPlan.extraDirectives || []) {
        directives.push(line)
    }

    if (images.length > MODEL_MAX_IMAGES) {
        throw new Error(`Resolved ${images.length} images, which exceeds the model max of ${MODEL_MAX_IMAGES}`)
    }

    const rawPrompt = [
        ...sceneLines.filter(Boolean),
        "",
        ...directives.filter(Boolean),
        "",
        "Each person is a completely distinct individual. Do not mix or merge facial features, hair, or appearance between subjects"
    ].join("\n\n")

    return {
        rawPrompt,
        images,
        directives,
        sceneLines
    }
}

/**
 * Main orchestration function used by /compile and /generate.
 *
 * Flow:
 * 1. Optionally enrich lock descriptions with vision
 * 2. Collapse tag assets if needed
 * 3. Ask the text LLM to build a structured plan
 * 4. Deterministically build the final raw prompt and image list
 *
 * @param {{
 *   prompt: string,
 *   tags: any[],
 *   tagLocks?: any,
 *   parserOptions?: any,
 *   visionOptions?: any
 * }} params
 * @returns {Promise<{
 *   parsedPlan: any,
 *   tagMap: Record<string, any>,
 *   rawPrompt: string,
 *   images: string[],
 *   directives: string[],
 *   sceneLines: string[]
 * }>}
 */
async function compilePrompt({
    prompt,
    tags,
    tagLocks = {},
    parserOptions = {},
    visionOptions = {}
}) {
    const visionEnrichedTags = await enrichTagLocksWithVision(tags, visionOptions)
    const collapsedTags = await collapseTagsIfNeeded(visionEnrichedTags)
    const tagMap = Object.fromEntries(collapsedTags.map((tag) => [tag.key, tag]))

    const parsedPlan = await parsePromptWithLLM({
        prompt,
        tags: collapsedTags,
        tagLocks,
        llmOptions: parserOptions
    })

    const built = buildRawPromptFromPlan({
        originalPrompt: prompt,
        parsedPlan,
        tagMap
    })

    return {
        parsedPlan,
        tagMap,
        rawPrompt: built.rawPrompt,
        images: built.images,
        directives: built.directives,
        sceneLines: built.sceneLines
    }
}

module.exports = {
    MODEL_MAX_IMAGES,
    TAG_TYPES,
    ASSET_GROUPS,
    POSITION_HORIZONTAL,
    POSITION_VERTICAL,
    POSITION_DEPTH,
    RELATIONS,
    FACING_VALUES,
    STANCE_VALUES,
    SUPPORT_VALUES,
    createEmptyAssets,
    createDefaultLocks,
    buildTagRecord,
    extractTags,
    countTagImages,
    collapseTagsIfNeeded,
    parsePromptWithLLM,
    enrichTagLocksWithVision,
    buildRawPromptFromPlan,
    compilePrompt
}