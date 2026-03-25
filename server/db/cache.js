/**
 * db/cache.js
 *
 * Persistent prompt-compile cache — extends DbTable for file initialization,
 * overrides read/write with error-tolerant versions, and adds cache helpers
 * keyed by a SHA-256 hash of the prompt inputs.
 *
 * Cache entries expire after CACHE_TTL_MS and are lazily evicted on next read.
 *
 * Exports a singleton instance.
 */

const crypto  = require("crypto");
const fs      = require("fs/promises");
const path    = require("path");
const DbTable = require("./DbTable");
const { CACHE_PATH } = require("./core");

// Cache entries older than this are considered stale and discarded on read.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class CacheTable extends DbTable {
  constructor() {
    super();
    // Absolute path to the cache JSON file
    this.DIRECTORY   = CACHE_PATH;
    // Default structure — an empty object (keys are SHA-256 hashes)
    this.declaration = {};
  }

  // ─── Overrides ───────────────────────────────────────────────────────────────

  /**
   * Read and parse the cache file from disk.
   *
   * Overrides DbTable.read() to return an empty object on any failure so that
   * a missing or corrupted cache never crashes the server.
   *
   * @returns {Promise<object>}
   */
  async read() {
    try {
      const raw = await fs.readFile(this.DIRECTORY, "utf8");
      return JSON.parse(raw);
    } catch {
      // File absent or unparseable — treat as an empty cache
      return {};
    }
  }

  /**
   * Serialize and write the cache to disk.
   *
   * Overrides DbTable.write() to log but not throw on failure so a cache
   * write error never interrupts a generation request.
   *
   * @param {object} data
   * @returns {Promise<void>}
   */
  async write(data) {
    try {
      await fs.writeFile(this.DIRECTORY, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      // Non-fatal — log and continue
      console.error("Failed to write prompt cache:", err.message);
    }
  }

  // ─── Cache operations ────────────────────────────────────────────────────────

  /**
   * Build a deterministic SHA-256 cache key from the prompt, tag locks, and
   * each tag's key + updatedAt timestamp.
   *
   * Including updatedAt means the cache is automatically invalidated whenever
   * a tag's images or descriptions change.
   *
   * @param {string} prompt
   * @param {object} tagLocks
   * @param {object[]} tagList
   * @returns {string} 64-character hex digest.
   */
  makeCacheKey(prompt, tagLocks, tagList) {
    // Stamp each tag with its key and last-updated time
    const tagStamps = tagList.map((t) => `${t.key}:${t.meta?.updatedAt || ""}`).join(",");
    const raw = JSON.stringify({ prompt, tagLocks: tagLocks || {}, tagStamps });
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Look up a compiled prompt by cache key.
   *
   * Returns null if the key is missing or the entry has expired.
   * Expired entries are evicted from disk on read.
   *
   * @param {string} key
   * @returns {Promise<object|null>}
   */
  async getCached(key) {
    const data = await this.read();
    const entry = data[key];
    // Miss — key not in cache
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      // Entry has expired — evict it and signal a miss
      delete data[key];
      await this.write(data);
      return null;
    }
    return entry.value;
  }

  /**
   * Store a compiled prompt under the given key with the current timestamp.
   *
   * @param {string} key
   * @param {object} value
   * @returns {Promise<void>}
   */
  async setCached(key, value) {
    const data = await this.read();
    // Write the value alongside a timestamp for TTL checks
    data[key] = { value, timestamp: Date.now() };
    await this.write(data);
  }

  /**
   * Remove a single entry from the cache by key.
   *
   * No-op if the key does not exist.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async deleteCached(key) {
    const data = await this.read();
    if (data[key]) {
      delete data[key];
      await this.write(data);
    }
  }
}

module.exports = new CacheTable();
