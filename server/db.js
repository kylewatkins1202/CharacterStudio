const fs = require("fs/promises")
const path = require("path")

const DATA_DIR = path.join(__dirname, "data")
const TAG_DB_PATH = path.join(DATA_DIR, "tags.json")
const GALLERY_DB_PATH = path.join(DATA_DIR, "gallery.json")

async function ensureDb() {
    await fs.mkdir(DATA_DIR, { recursive: true })

    try {
        await fs.access(TAG_DB_PATH)
    }
    catch {
        await fs.writeFile(TAG_DB_PATH, JSON.stringify({ tags: {} }, null, 2), "utf8")
    }

    try {
        await fs.access(GALLERY_DB_PATH)
    }
    catch {
        await fs.writeFile(GALLERY_DB_PATH, JSON.stringify({ entries: [] }, null, 2), "utf8")
    }
}

async function readDb() {
    await ensureDb()
    const raw = await fs.readFile(TAG_DB_PATH, "utf8")
    return JSON.parse(raw)
}

async function writeDb(db) {
    await ensureDb()
    await fs.writeFile(TAG_DB_PATH, JSON.stringify(db, null, 2), "utf8")
}

// ─── Gallery ───────────────────────────────────────────────────────────────────

async function readGallery() {
    await ensureDb()
    const raw = await fs.readFile(GALLERY_DB_PATH, "utf8")
    return JSON.parse(raw)
}

async function writeGallery(data) {
    await ensureDb()
    await fs.writeFile(GALLERY_DB_PATH, JSON.stringify(data, null, 2), "utf8")
}

/**
 * Save a generation entry to the gallery.
 *
 * @param {{
 *   id: string,
 *   imageUrl: string,
 *   userPrompt: string,
 *   compiledPrompt: string|null,
 *   size: string,
 *   cost: string|null,
 *   timestamp: string
 * }} entry
 * @returns {Promise<any>}
 */
async function saveGalleryEntry(entry) {
    const data = await readGallery()
    data.entries.unshift(entry) // newest first
    await writeGallery(data)
    return entry
}

/**
 * Get all gallery entries, newest first.
 *
 * @returns {Promise<any[]>}
 */
async function getGalleryEntries() {
    const data = await readGallery()
    return data.entries || []
}

/**
 * Delete a gallery entry by id.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteGalleryEntry(id) {
    const data = await readGallery()
    const before = data.entries.length
    data.entries = data.entries.filter((e) => e.id !== id)
    await writeGallery(data)
    return data.entries.length < before
}

// ─── Tags ──────────────────────────────────────────────────────────────────────

/**
 * Get a single tag by exact key.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getTag(key) {
    const db = await readDb()
    return db.tags[key] || null
}

/**
 * Save or replace a tag.
 *
 * @param {any} tag
 * @returns {Promise<any>}
 */
async function saveTag(tag) {
    const db = await readDb()
    db.tags[tag.key] = tag
    await writeDb(db)
    return tag
}

/**
 * Get multiple tags by exact keys.
 *
 * @param {string[]} keys
 * @returns {Promise<any[]>}
 */
async function getTags(keys) {
    const db = await readDb()
    return keys.map((key) => db.tags[key]).filter(Boolean)
}

/**
 * Get all tags, optionally filtered by a partial key search.
 *
 * @param {string} [query=""]
 * @returns {Promise<any[]>}
 */
async function searchTags(query = "") {
    const db = await readDb()
    const allTags = Object.values(db.tags || {})

    const normalizedQuery = String(query || "").trim().toLowerCase()
    if (!normalizedQuery) {
        return allTags
    }

    return allTags.filter((tag) =>
        String(tag.key || "").toLowerCase().includes(normalizedQuery)
    )
}

/**
 * Update a tag in place using a mutator function.
 *
 * @param {string} key
 * @param {(tag: any) => any} updater
 * @returns {Promise<any|null>}
 */
async function updateTag(key, updater) {
    const db = await readDb()
    const existing = db.tags[key]

    if (!existing) {
        return null
    }

    const updated = await updater(existing)
    db.tags[key] = updated
    await writeDb(db)

    return updated
}

module.exports = {
    ensureDb,
    readDb,
    writeDb,
    getTag,
    saveTag,
    getTags,
    searchTags,
    updateTag,
    saveGalleryEntry,
    getGalleryEntries,
    deleteGalleryEntry,
}
