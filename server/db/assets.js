/**
 * db/assets.js
 *
 * Assets table — canonical store for every image in the system.
 *
 * Assets are context-agnostic. Who uses an asset is tracked externally:
 *   - Tags store `assetIds` keyed by group
 *   - Gallery entries store `imageAssetId` and `referenceAssetIds`
 *
 * Record shape: { id, url, localPath, assetPath, filename, mimeType, hidden, timestamp, purpose? }
 */

const DbTable = require("./DbTable");
const { ASSETS_DB_PATH } = require("./core");

class AssetsTable extends DbTable {
  constructor() {
    super();
    this.DIRECTORY   = ASSETS_DB_PATH;
    this.declaration = { assets: {} };
  }

  /** Save a new asset record. Caller supplies a unique id. */
  async createAsset(data) {
    const db = await this.read();
    db.assets[data.id] = data;
    await this.write(db);
    return data;
  }

  /** Get a single asset by id, or null. */
  async getAsset(id) {
    const db = await this.read();
    return db.assets[id] || null;
  }

  /**
   * Get all assets, optionally filtered by hidden state.
   * @param {{ hidden?: boolean }} [filter={}]
   */
  async getAssets(filter = {}) {
    const db   = await this.read();
    let   list = Object.values(db.assets);
    if (filter.hidden !== undefined) list = list.filter((a) => Boolean(a.hidden) === filter.hidden);
    return list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }

  /** Fetch multiple assets by their ids. Missing ids are silently omitted. */
  async getAssetsByIds(ids) {
    const db = await this.read();
    return ids.map((id) => db.assets[id]).filter(Boolean);
  }

  /** Find the first asset whose `url` matches exactly, or null. */
  async getAssetByUrl(url) {
    const db = await this.read();
    return Object.values(db.assets).find((a) => a.url === url) || null;
  }

  /** Patch an asset record. Only the provided keys are updated. */
  async updateAsset(id, patch) {
    const db = await this.read();
    if (!db.assets[id]) return null;
    db.assets[id] = { ...db.assets[id], ...patch };
    await this.write(db);
    return db.assets[id];
  }

  /**
   * Delete an asset record.
   * @returns {Promise<object|null>} The deleted record, or null if not found.
   */
  async deleteAsset(id) {
    const db = await this.read();
    const record = db.assets[id];
    if (!record) return null;
    delete db.assets[id];
    await this.write(db);
    return record;
  }
}

module.exports = new AssetsTable();
