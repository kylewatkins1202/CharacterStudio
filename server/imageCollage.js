const sharp = require("sharp")

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

function sanitizeTagKey(key) {
    return String(key || "")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/[^a-z0-9_-]/g, "")
}

function assertBufferSize(buffer, maxBytes = MAX_IMAGE_BYTES) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error("Expected a Buffer")
    }

    if (buffer.length > maxBytes) {
        throw new Error(`Image exceeds max size of ${maxBytes} bytes`)
    }
}

function parseBase64Image(input, fallbackMimeType = "image/jpeg") {
    if (!input || typeof input !== "string") {
        throw new Error("Invalid base64 image")
    }

    let mimeType = fallbackMimeType
    let base64Data = input

    const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (match) {
        mimeType = match[1]
        base64Data = match[2]
    }

    const buffer = Buffer.from(base64Data, "base64")

    const extensionMap = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/bmp": "bmp",
        "image/tiff": "tiff"
    }

    const ext = extensionMap[mimeType]
    if (!ext) {
        throw new Error(`Unsupported image mime type: ${mimeType}`)
    }

    assertBufferSize(buffer)

    return {
        mimeType,
        ext,
        buffer
    }
}

/**
 * Convenience helper for turning a base64 payload into a normalized upload object.
 * Useful before calling uploadBufferToWaveSpeed().
 */
function base64ToUploadObject(input, fallbackMimeType = "image/jpeg") {
    const parsed = parseBase64Image(input, fallbackMimeType)

    return {
        buffer: parsed.buffer,
        mimeType: parsed.mimeType,
        ext: parsed.ext
    }
}

async function normalizeToPngBuffer(buffer, size = 1024) {
    return sharp(buffer)
        .rotate()
        .resize(size, size, {
            fit: "contain",
            background: "#111111",
            withoutEnlargement: false
        })
        .png()
        .toBuffer()
}

async function createImageGridFromBuffers(buffers, options = {}) {
    const cellSize = options.cellSize || 1024
    const background = options.background || "#111111"

    if (!Array.isArray(buffers) || buffers.length === 0) {
        throw new Error("No buffers provided for collage")
    }

    if (buffers.length === 1) {
        return sharp(buffers[0])
            .rotate()
            .jpeg({ quality: 92 })
            .toBuffer()
    }

    const normalizedBuffers = await Promise.all(
        buffers.map((buffer) => normalizeToPngBuffer(buffer, cellSize))
    )

    const count = normalizedBuffers.length
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)

    const width = cols * cellSize
    const height = rows * cellSize

    const composites = normalizedBuffers.map((input, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)

        return {
            input,
            left: col * cellSize,
            top: row * cellSize
        }
    })

    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background
        }
    })
        .composite(composites)
        .jpeg({ quality: 92 })
        .toBuffer()
}

/**
 * Utility for LLM vision calls:
 * given an array of stored assets, return only valid URLs.
 */
function assetUrls(assets) {
    if (!Array.isArray(assets)) {
        return []
    }
    return assets
        .map((asset) => asset && asset.url)
        .filter((url) => typeof url === "string" && url.trim())
}

module.exports = {
    MAX_IMAGE_BYTES,
    sanitizeTagKey,
    assertBufferSize,
    parseBase64Image,
    base64ToUploadObject,
    normalizeToPngBuffer,
    createImageGridFromBuffers,
    assetUrls
}