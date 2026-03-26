/**
 * db/index.js
 *
 * Entry point for the db layer.
 *
 * Exposes setupDb() for server startup and re-exports all tag/gallery
 * methods as flat named exports so existing callers don't need to change.
 *
 * Usage:
 *   const { setupDb, getTag, saveGalleryEntry, DOWNLOADS_DIR } = require('./db');
 */

const fs      = require("fs/promises");
const { DATA_DIR, DOWNLOADS_DIR } = require("./core");

// Singleton table instances
const tags     = require("./tags");
const gallery  = require("./gallery");
const cache    = require("./cache");
const settings = require("./settings");

/**
 * Initialize the data directory and all database tables.
 *
 * Creates DATA_DIR and DOWNLOADS_DIR if they don't exist, then delegates
 * file-seeding to each table's ensureDbTable() method.
 *
 * Called once at server startup before app.listen().
 *
 * @returns {Promise<void>}
 */
async function setupDb() {
  // Create the root data directory
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Create the downloads sub-directory
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
  // Seed each table's JSON file if it doesn't already exist
  await tags.ensureDbTable();
  await gallery.ensureDbTable();
  await cache.ensureDbTable();
  await settings.ensureDbTable();
}

module.exports = {
  setupDb,

  // ─── Path constants ────────────────────────────────────────────────────────
  DATA_DIR,
  DOWNLOADS_DIR,

  // ─── Table singletons ──────────────────────────────────────────────────────
  tags,
  gallery,
  cache,
  settings,
};
