/**
 * db.js
 *
 * Lightweight JSON file-based persistence layer for tags and gallery entries.
 *
 * Data files are stored in:
 *   - Electron builds: ~/Library/Application Support/<appName>/data/
 *   - Plain Node:      <projectRoot>/server/data/
 *
 * All functions ensure the data directory and files exist before reading or
 * writing, so callers do not need to handle first-run initialization.
 */

/** @typedef {import('./types').Tag} Tag */
/** @typedef {import('./types').TagDb} TagDb */
/** @typedef {import('./types').GalleryEntry} GalleryEntry */
/** @typedef {import('./types').GalleryDb} GalleryDb */

const fs = require("fs/promises")
const path = require("path")
const { app } = (() => {
  try { return require("electron"); }
  catch { return { app: null }; }
})();

const DATA_DIR = app
  ? path.join(app.getPath("userData"), "data")  // ~/Library/Application Support/Seedream Studio/data
  : path.join(__dirname, "data");                // normal node, use local
const TAG_DB_PATH = path.join(DATA_DIR, "tags.json")
const GALLERY_DB_PATH = path.join(DATA_DIR, "gallery.json")
const DOWNLOADS_DIR = path.join(DATA_DIR, "downloads")

/**
 * Ensure the downloads directory exists, creating it recursively if needed.
 *
 * @returns {Promise<void>}
 */
async function ensureDownloadsDir() {
    await fs.mkdir(DOWNLOADS_DIR, { recursive: true })
}

/**
 * Ensure the data directory, downloads directory, and both JSON database files
 * exist. Missing files are seeded with empty default structures.
 *
 * Safe to call multiple times — all operations are idempotent.
 *
 * @returns {Promise<void>}
 */
async function ensureDb() {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await ensureDownloadsDir()

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

/**
 * Read and parse the full tags database from disk.
 *
 * @returns {Promise<TagDb>}
 */
async function readDb() {
    await ensureDb()
    const raw = await fs.readFile(TAG_DB_PATH, "utf8")
    return JSON.parse(raw)
}

/**
 * Serialize and write the full tags database to disk.
 *
 * @param {TagDb} db
 * @returns {Promise<void>}
 */
async function writeDb(db) {
    await ensureDb()
    await fs.writeFile(TAG_DB_PATH, JSON.stringify(db, null, 2), "utf8")
}

// ─── Gallery ───────────────────────────────────────────────────────────────────

/**
 * Read and parse the full gallery database from disk.
 *
 * @returns {Promise<GalleryDb>}
 */
async function readGallery() {
    await ensureDb()
    const raw = await fs.readFile(GALLERY_DB_PATH, "utf8")
    return JSON.parse(raw)
}

/**
 * Serialize and write the full gallery database to disk.
 *
 * @param {GalleryDb} data
 * @returns {Promise<void>}
 */
async function writeGallery(data) {
    await ensureDb()
    await fs.writeFile(GALLERY_DB_PATH, JSON.stringify(data, null, 2), "utf8")
}

/**
 * Prepend a generation entry to the gallery (newest first) and persist it.
 *
 * @param {GalleryEntry} entry
 * @returns {Promise<GalleryEntry>}
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
 * @returns {Promise<GalleryEntry[]>}
 */
async function getGalleryEntries() {
    const data = await readGallery()
    return data.entries || []
}

/**
 * Delete a gallery entry by id.
 *
 * @param {string} id - The `id` field of the entry to remove.
 * @returns {Promise<boolean>} True if an entry was removed, false if id was not found.
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
 * @returns {Promise<Tag|null>}
 */
async function getTag(key) {
    const db = await readDb()
    return db.tags[key] || null
}

/**
 * Save or replace a tag. Uses `tag.key` as the record identifier.
 *
 * @param {Tag} tag
 * @returns {Promise<Tag>}
 */
async function saveTag(tag) {
    const db = await readDb()
    db.tags[tag.key] = tag
    await writeDb(db)
    return tag
}

/**
 * Get multiple tags by exact keys. Missing keys are silently omitted.
 *
 * @param {string[]} keys
 * @returns {Promise<Tag[]>}
 */
async function getTags(keys) {
    const db = await readDb()
    return keys.map((key) => db.tags[key]).filter(Boolean)
}

/**
 * Get all tags, optionally filtered by a partial (case-insensitive) key search.
 *
 * @param {string} [query=""] - Substring to match against tag keys. Pass empty string to return all.
 * @returns {Promise<Tag[]>}
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
 * Reads the current record, passes it to `updater`, and writes the result back.
 * Returns null without writing if no tag exists for the given key.
 *
 * @param {string} key
 * @param {(tag: Tag) => Tag | Promise<Tag>} updater
 * @returns {Promise<Tag|null>}
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
    readGallery,
    writeGallery,
    DOWNLOADS_DIR,
    ensureDownloadsDir
}
