/**
 * db/gallery.js
 *
 * Gallery CRUD — extends DbTable for file initialization and low-level I/O,
 * adds query methods for the gallery JSON database.
 *
 * Exports a singleton instance so the same object is shared across all
 * requires in the process.
 */

/** @typedef {import('../types').GalleryEntry} GalleryEntry */
/** @typedef {import('../types').GalleryDb} GalleryDb */

const DbTable = require("./DbTable");
const { GALLERY_DB_PATH } = require("./core");

class GalleryTable extends DbTable {
  constructor() {
    super();
    // Absolute path to the gallery JSON file
    this.DIRECTORY   = GALLERY_DB_PATH;
    // Default structure written on first run
    this.declaration = { entries: [] };
  }

  // ─── Gallery queries ─────────────────────────────────────────────────────────

  /**
   * Prepend a generation entry to the gallery (newest first) and persist it.
   *
   * @param {GalleryEntry} entry
   * @returns {Promise<GalleryEntry>}
   */
  async saveGalleryEntry(entry) {
    const data = await this.read();
    // Unshift so the newest entry appears first
    data.entries.unshift(entry);
    await this.write(data);
    return entry;
  }

  /**
   * Get all gallery entries, newest first.
   *
   * @returns {Promise<GalleryEntry[]>}
   */
  async getGalleryEntries() {
    const data = await this.read();
    // Guard against a missing entries array in legacy data
    return data.entries || [];
  }

  /**
   * Delete a gallery entry by id.
   *
   * @param {string} id - The `id` field of the entry to remove.
   * @returns {Promise<boolean>} True if an entry was removed, false if the id was not found.
   */
  async deleteGalleryEntry(id) {
    const data = await this.read();
    const before = data.entries.length;
    // Filter out the matching entry
    data.entries = data.entries.filter((e) => e.id !== id);
    await this.write(data);
    // Return true only if something was actually removed
    return data.entries.length < before;
  }
}

module.exports = new GalleryTable();
