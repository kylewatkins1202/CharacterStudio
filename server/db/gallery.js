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
    await this.atomicUpdate((data) => {
      data.entries.unshift(entry);
      return data;
    });
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
   * Merge patch into an existing gallery entry and persist.
   *
   * @param {string} id    - The `id` of the entry to update.
   * @param {object} patch - Fields to merge into the entry.
   * @returns {Promise<GalleryEntry|null>} The updated entry, or null if not found.
   */
  async updateGalleryEntry(id, patch) {
    let updated = null;
    await this.atomicUpdate((data) => {
      const idx = data.entries.findIndex((e) => e.id === id);
      if (idx !== -1) {
        data.entries[idx] = { ...data.entries[idx], ...patch };
        updated = data.entries[idx];
      }
      return data;
    });
    return updated;
  }

  /**
   * Delete a gallery entry by id.
   *
   * @param {string} id - The `id` field of the entry to remove.
   * @returns {Promise<boolean>} True if an entry was removed, false if the id was not found.
   */
  async deleteGalleryEntry(id) {
    let removed = false;
    await this.atomicUpdate((data) => {
      const before = data.entries.length;
      data.entries = data.entries.filter((e) => e.id !== id);
      removed = data.entries.length < before;
      return data;
    });
    return removed;
  }
}

module.exports = new GalleryTable();
