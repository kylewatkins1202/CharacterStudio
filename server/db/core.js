/**
 * db/core.js
 *
 * File-system path constants shared across the db layer.
 *
 * Data files are stored in:
 *   - Electron builds: ~/Library/Application Support/<appName>/data/
 *   - Plain Node:      <projectRoot>/server/data/
 *
 * Initialization logic lives in index.js (setupDb) — this module is
 * intentionally side-effect-free so it can be imported without triggering I/O.
 */

const path = require("path");

// Resolve the Electron app handle if running inside Electron, otherwise null.
const { app } = (() => {
  try { return require("electron"); }
  catch { return { app: null }; }
})();

// Root data directory — differs between Electron and plain Node environments.
const DATA_DIR = app
  ? path.join(app.getPath("userData"), "data")   // ~/Library/Application Support/.../data
  : path.join(__dirname, "..", "data");           // <projectRoot>/server/data

// Absolute paths to the two JSON database files.
const TAG_DB_PATH     = path.join(DATA_DIR, "tags.json");
const GALLERY_DB_PATH = path.join(DATA_DIR, "gallery.json");

// Directory ehere cache is stored
const CACHE_PATH      = path.join(DATA_DIR, "prompt_cache.json")

// Directory where locally downloaded gallery images are saved.
const DOWNLOADS_DIR = path.join(DATA_DIR, "downloads");

module.exports = {
  DATA_DIR,
  TAG_DB_PATH,
  GALLERY_DB_PATH,
  DOWNLOADS_DIR,
  CACHE_PATH
};
