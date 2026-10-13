/**
 * imageCollage.js
 *
 * Image-processing utilities used throughout the server:
 * - Sanitizing tag keys
 * - Validating and parsing base64 image strings
 * - Normalizing images to a fixed-size PNG via sharp
 * - Building grid collages from multiple image buffers
 * - Extracting asset URLs from tag asset arrays
 */

/** @typedef {import('../types').TagAsset} TagAsset */
/** @typedef {import('../types').ParsedImage} ParsedImage */
/** @typedef {import('../types').UploadObject} UploadObject */
/** @typedef {import('../types').CollageOptions} CollageOptions */
const fs = require('fs/promises')
const sharp = require("sharp")
const path = require('path')
/** Maximum allowed image size in bytes (20 MB). */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * Normalize a raw string into a valid tag key.
 *
 * Strips leading `@` signs, converts to lowercase, and removes any
 * characters that are not alphanumeric, underscores, or hyphens.
 *
 * @param {string} key - Raw input (typically from user input or a URL param).
 * @returns {string} Sanitized tag key, may be an empty string if input is blank.
 */
function sanitizeTagKey(key) {
    return String(key || "")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/[^a-z0-9_-]/g, "")
}

/**
 * Detects whether a string is a Base64 Data URI, a valid URL, or a File Path.
 * @param {string} str - The input string to inspect.
 * @returns {'data-uri' | 'url' | 'filepath' | 'unknown'}
 */
function detectStringType(str) {
  if (typeof str !== 'string' || !str.trim()) {
    return 'unknown';
  }
  
  const trimmed = str.trim();

  // 1. Check for Base64 Data URI
  // Matches "data:[mediatype];base64,[data]"
  const dataUriRegex = /^\s*data:[a-z]+\/[a-z0-9-+.]+(;[a-z0-9-]+=[a-z0-9-]+)*(;base64),([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?\s*$/i;
  if (dataUriRegex.test(trimmed)) {
    return 'data-uri';
  }

  // 3. Check for File Paths (Windows & Unix/POSIX)
  // Unix absolute path: starts with /
  // Windows absolute path: starts with C:\ or \\ (UNC share)
  // Relative paths: starts with ./ or ../
  const filePathRegex = /^([a-zA-Z]:[\\/ ]|\/[^/]|\\\\[^\\]|\.\.[\\/ ]|\.[\\/ ])/;
  if (filePathRegex.test(trimmed)) {
    return 'filepath';
  }

  // 2. Check for a valid URL (http, https, file, etc.)
  try {
    const parsedUrl = new URL(trimmed);
    // Ensure it has a valid protocol and isn't just a drive letter evaluated as a protocol
    if (parsedUrl.protocol && parsedUrl.protocol !== 'localhost:') {
      return 'url';
    }
  } catch (e) {
    // Not a valid URL structure, continue to check file path
  }

  return 'unknown';
}

/**
 * Converts a file path into a Base64 Data URI
 * @param {string} filePath - The path to the file
 * @returns {string} The fully formatted Base64 Data URI
 */
async function filePathToDataUri(filePath) {
  // 1. Read the file into a binary buffer
  const fileBuffer = await fs.readFile(filePath);
  
  // 2. Convert the buffer to a base64 string
  const base64Data = fileBuffer.toString('base64');
  
  // 3. Resolve the extension to guess the MIME type
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  
  // 4. Construct common MIME types (adjust if using non-image files like application/pdf)
  let mimeType = `image/${ext}`;
  if (ext === 'pdf') mimeType = 'application/pdf';
  if (ext === 'txt') mimeType = 'text/plain';

  // 5. Combine into a complete Data URI
  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Assert that a value is a Buffer and does not exceed the allowed size.
 *
 * Throws a descriptive error if either condition is violated, allowing
 * callers to surface a clean 400-level error to clients.
 *
 * @param {Buffer} buffer
 * @param {number} [maxBytes=MAX_IMAGE_BYTES]
 * @returns {void}
 */
function assertBufferSize(buffer, maxBytes = MAX_IMAGE_BYTES) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error("Expected a Buffer")
    }

    if (buffer.length > maxBytes) {
        throw new Error(`Image exceeds max size of ${maxBytes} bytes`)
    }
}

/**
 * Parse a base64 image string into its MIME type, file extension, and raw buffer.
 *
 * Accepts both bare base64 strings and data-URI strings of the form
 * `data:<mimeType>;base64,<data>`. Throws if the MIME type is unsupported
 * or the buffer exceeds MAX_IMAGE_BYTES.
 *
 * @param {string} input - Raw base64 string or data-URI.
 * @param {string} [fallbackMimeType="image/jpeg"] - MIME type assumed when no data-URI prefix is present.
 * @returns {ParsedImage}
 */
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
 *
 * Parses the base64 string and returns only the fields needed by
 * uploadBufferToWaveSpeed — strips any extra fields produced by parseBase64Image.
 *
 * @param {string} input - Raw base64 string or data-URI.
 * @param {string} [fallbackMimeType="image/jpeg"]
 * @returns {UploadObject}
 */
function base64ToUploadObject(input, fallbackMimeType = "image/jpeg") {
    const parsed = parseBase64Image(input, fallbackMimeType)

    return {
        buffer: parsed.buffer,
        mimeType: parsed.mimeType,
        ext: parsed.ext
    }
}

/**
 * Resize and convert an image buffer to a square PNG.
 *
 * Uses sharp's "contain" fit so the image is letterboxed rather than
 * cropped, preserving the full composition. EXIF rotation is applied
 * automatically before resizing.
 *
 * @param {Buffer} buffer - Source image in any format sharp supports.
 * @param {number} [size=1024] - Target width and height in pixels.
 * @returns {Promise<Buffer>} PNG-encoded image buffer.
 */
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

/**
 * Arrange multiple image buffers into a grid collage and return it as a JPEG buffer.
 *
 * Grid dimensions are chosen automatically: columns = ceil(sqrt(n)), rows fill
 * the remaining images. Each cell is first normalized to a square PNG via
 * normalizeToPngBuffer so the layout is uniform. A single-image input skips
 * the grid path and is returned directly as JPEG.
 *
 * @param {Buffer[]} buffers - Source image buffers; must contain at least one entry.
 * @param {CollageOptions} [options={}]
 * @returns {Promise<Buffer>} JPEG-encoded collage buffer.
 */
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
 * Extract valid URL strings from an array of stored tag assets.
 *
 * Filters out any entries with a missing or non-string URL so callers
 * can pass the result directly to callAnyLLMVision without extra guards.
 *
 * @param {TagAsset[]} assets
 * @returns {string[]}
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
    assetUrls,
    filePathToDataUri,
    detectStringType
}