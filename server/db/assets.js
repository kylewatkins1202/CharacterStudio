/**
 * db/assets.js
 *
 * Assets table — canonical store for every uploaded image in the system.
 *
 * Each record has a stable UUID. Tags reference assets by ID rather than
 * embedding the full record, so healing a URL only touches this table.
 *
 * Asset types:
 *   "tag_asset"  — an image belonging to a tag (face, body, outfit, etc.)
 *   "reference"  — a reference image used during generation
 *
 * Record shape:
 *   { id, type, url, localPath, filename, mimeType, hidden, timestamp,
 *     tagKey?, group?,   // for tag_asset
 *     purpose?           // for reference
 *   }
 */

const DbTable = require("./DbTable");
const { ASSETS_DB_PATH } = require("./core");

class AssetsTable extends DbTable {
  constructor() {
    super();
    this.DIRECTORY   = ASSETS_DB_PATH;
    this.declaration = { assets: {} };
  }

  /**
   * Save a new asset record. Caller is responsible for supplying a unique id.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createAsset(data) {
    const db = await this.read();
    db.assets[data.id] = data;
    await this.write(db);
    return data;
  }

  /**
   * Get a single asset by id, or null if not found.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getAsset(id) {
    const db = await this.read();
    return db.assets[id] || null;
  }

  /**
   * Get all assets, optionally filtered.
   * @param {{ type?: string, tagKey?: string, hidden?: boolean }} [filter={}]
   * @returns {Promise<object[]>}
   */
  async getAssets(filter = {}) {
    const db   = await this.read();
    let   list = Object.values(db.assets);
    if (filter.type   !== undefined) list = list.filter((a) => a.type   === filter.type);
    if (filter.tagKey !== undefined) list = list.filter((a) => a.tagKey === filter.tagKey);
    if (filter.hidden !== undefined) list = list.filter((a) => Boolean(a.hidden) === filter.hidden);
    // Newest first
    return list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }

  /**
   * Fetch multiple assets by their ids. Missing ids are silently omitted.
   * @param {string[]} ids
   * @returns {Promise<object[]>}
   */
  async getAssetsByIds(ids) {
    const db = await this.read();
    return ids.map((id) => db.assets[id]).filter(Boolean);
  }

  /**
   * Find the first asset whose `url` matches exactly, or null.
   * Used by healing to look up a stale URL's local copy.
   * @param {string} url
   * @returns {Promise<object|null>}
   */
  async getAssetByUrl(url) {
    const db = await this.read();
    return Object.values(db.assets).find((a) => a.url === url) || null;
  }

  /**
   * Patch an asset record. Only the provided keys are updated.
   * @param {string} id
   * @param {object} patch
   * @returns {Promise<object|null>}
   */
  async updateAsset(id, patch) {
    const db = await this.read();
    if (!db.assets[id]) return null;
    db.assets[id] = { ...db.assets[id], ...patch };
    await this.write(db);
    return db.assets[id];
  }

  /**
   * Delete an asset record.
   * @param {string} id
   * @returns {Promise<boolean>} True if something was deleted.
   */
  async deleteAsset(id) {
    const db = await this.read();
    if (!db.assets[id]) return false;
    delete db.assets[id];
    await this.write(db);
    return true;
  }
}

module.exports = new AssetsTable();
