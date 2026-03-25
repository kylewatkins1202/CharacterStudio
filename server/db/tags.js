/**
 * db/tags.js
 *
 * Tag CRUD — extends DbTable for file initialization and low-level I/O,
 * adds query methods for the tags JSON database.
 *
 * Exports a singleton instance so the same object is shared across all
 * requires in the process.
 */

/** @typedef {import('../types').Tag} Tag */
/** @typedef {import('../types').TagDb} TagDb */

const DbTable = require("./DbTable");
const { TAG_DB_PATH } = require("./core");

class TagsTable extends DbTable {
  constructor() {
    super();
    // Absolute path to the tags JSON file
    this.DIRECTORY   = TAG_DB_PATH;
    // Default structure written on first run
    this.declaration = { tags: {} };
  }

  // ─── Tag queries ─────────────────────────────────────────────────────────────

  /**
   * Get a single tag by exact key.
   *
   * @param {string} key
   * @returns {Promise<Tag|null>}
   */
  async getTag(key) {
    const db = await this.read();
    // Return null rather than undefined when the key is missing
    return db.tags[key] || null;
  }

  /**
   * Save or replace a tag. Uses `tag.key` as the record identifier.
   *
   * @param {Tag} tag
   * @returns {Promise<Tag>}
   */
  async saveTag(tag) {
    const db = await this.read();
    // Upsert by key
    db.tags[tag.key] = tag;
    await this.write(db);
    return tag;
  }

  /**
   * Get multiple tags by exact keys. Missing keys are silently omitted.
   *
   * @param {string[]} keys
   * @returns {Promise<Tag[]>}
   */
  async getTags(keys) {
    const db = await this.read();
    // Map keys to tag records and drop any that don't exist
    return keys.map((key) => db.tags[key]).filter(Boolean);
  }

  /**
   * Get all tags, optionally filtered by a partial (case-insensitive) key search.
   *
   * @param {string} [query=""] - Substring to match against tag keys. Pass empty string to return all.
   * @returns {Promise<Tag[]>}
   */
  async searchTags(query = "") {
    const db = await this.read();
    const allTags = Object.values(db.tags || {});

    // Normalize the query — empty string returns everything
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return allTags;
    }

    // Filter to only tags whose key contains the search substring
    return allTags.filter((tag) =>
      String(tag.key || "").toLowerCase().includes(normalizedQuery)
    );
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
  async updateTag(key, updater) {
    const db = await this.read();
    const existing = db.tags[key];

    // Return null early if the tag doesn't exist
    if (!existing) {
      return null;
    }

    // Apply the mutator function (may be async)
    const updated = await updater(existing);
    // Persist the mutated record
    db.tags[key] = updated;
    await this.write(db);

    return updated;
  }
}

module.exports = new TagsTable();
