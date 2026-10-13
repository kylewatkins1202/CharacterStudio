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

// Built-in folders that always exist and cannot be deleted
const BUILTIN_FOLDERS = ["assets", "generated", "upscaled"];

/** Extract the top-level folder name from an asset's assetPath. */
function getAssetFolder(asset) {
  if (!asset.assetPath) return "assets";
  const i = asset.assetPath.indexOf("/");
  return i === -1 ? asset.assetPath : asset.assetPath.substring(0, i);
}

class AssetsTable extends DbTable {
  constructor() {
    super();
    this.DIRECTORY   = ASSETS_DB_PATH;
    this.declaration = { assets: {}, userFolders: [] };
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
   * Get all assets, optionally filtered by hidden state and/or folder.
   * @param {{ hidden?: boolean, folder?: string }} [filter={}]
   */
  async getAssets(filter = {}) {
    const db   = await this.read();
    let   list = Object.values(db.assets);
    if (filter.hidden !== undefined) list = list.filter((a) => Boolean(a.hidden) === filter.hidden);
    if (filter.folder !== undefined) list = list.filter((a) => getAssetFolder(a) === filter.folder);
    return list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }

  async getAssetByUrl(url) {
    const db = await this.read()
    let   list = Object.values(db.assets);
    return list.find((item) => item.assetPath === url) 
  }

  // ─── Folder management ────────────────────────────────────────────────────────

  async getUserFolders() {
    const data = await this.read();
    return data.userFolders || [];
  }

  async addUserFolder(name) {
    await this.atomicUpdate((data) => {
      if (!Array.isArray(data.userFolders)) data.userFolders = [];
      if (!data.userFolders.includes(name)) data.userFolders.push(name);
      return data;
    });
  }

  async removeUserFolder(name) {
    await this.atomicUpdate((data) => {
      if (Array.isArray(data.userFolders)) {
        data.userFolders = data.userFolders.filter((f) => f !== name);
      }
      return data;
    });
  }

  /** Return all folder names that have at least one asset, plus user folders. */
  async getAllFolders() {
    const data    = await this.read();
    const list    = Object.values(data.assets);
    const fromAssets = [...new Set(list.map(getAssetFolder))];
    const userFolders = data.userFolders || [];
    // Merge: builtins first, then asset-derived, then user-only, deduped
    const all = [...new Set([...BUILTIN_FOLDERS, ...fromAssets, ...userFolders])];
    // Count assets per folder
    const counts = {};
    for (const a of list) {
      const f = getAssetFolder(a);
      counts[f] = (counts[f] || 0) + 1;
    }
    return all.map((name) => ({
      name,
      count:   counts[name] || 0,
      builtin: BUILTIN_FOLDERS.includes(name),
    }));
  }

  /** Expose the folder helper and builtin list for use in routes. */
  static getAssetFolder = getAssetFolder;
  static BUILTIN_FOLDERS = BUILTIN_FOLDERS;

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
