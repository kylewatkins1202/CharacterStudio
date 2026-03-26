/**
 * routes/settings.js
 *
 * User settings routes:
 *   GET  /settings              — return current settings
 *   PUT  /settings              — save updated settings
 *   POST /settings/clear-cache  — wipe the prompt compile cache
 *   POST /settings/clear-gallery — wipe all gallery entries
 */

const express = require("express");
const db = require("../db");
const { setApiKey } = require("../api/wavespeed");

const router = express.Router();

/**
 * GET /api/settings
 * Return the current user settings.
 */
router.get("/settings", async (req, res) => {
  try {
    const settings = await db.settings.getSettings();
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(500).json({ error: "failed to load settings", details: error.message });
  }
});

/**
 * PUT /api/settings
 * Save updated settings and apply them immediately (e.g. activate a new API key).
 */
router.put("/settings", async (req, res) => {
  try {
    // Only forward known fields — saveSettings ignores anything else
    const updated = await db.settings.saveSettings({
      wavespeedApiKey: req.body.wavespeedApiKey,
    });
    // Activate the new key immediately so in-flight requests use it
    setApiKey(updated.wavespeedApiKey);
    res.json({ ok: true, settings: updated });
  } catch (error) {
    res.status(500).json({ error: "failed to save settings", details: error.message });
  }
});

/**
 * POST /api/settings/clear-cache
 * Delete all entries from the prompt compile cache.
 */
router.post("/settings/clear-cache", async (req, res) => {
  try {
    // Overwrite the cache file with an empty object
    await db.cache.write({});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "failed to clear cache", details: error.message });
  }
});

/**
 * POST /api/settings/clear-gallery
 * Delete all entries from the gallery.
 */
router.post("/settings/clear-gallery", async (req, res) => {
  try {
    // Overwrite the gallery file with an empty entries array
    await db.gallery.write({ entries: [] });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "failed to clear gallery", details: error.message });
  }
});

module.exports = router;
