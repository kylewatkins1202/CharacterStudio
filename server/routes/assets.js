/**
 * routes/assets.js
 *
 * Asset CRUD routes:
 *   GET    /assets          — list assets (filter: ?type=, ?tagKey=, ?hidden=)
 *   GET    /assets/:id      — single asset
 *   PATCH  /assets/:id      — update hidden / purpose
 *   DELETE /assets/:id      — remove asset record
 */

const express = require("express");
const db      = require("../db");

const router = express.Router();

router.get("/assets", async (req, res) => {
  try {
    const filter = {};
    if (req.query.type)   filter.type   = String(req.query.type);
    if (req.query.tagKey) filter.tagKey = String(req.query.tagKey);
    if (req.query.hidden !== undefined) filter.hidden = req.query.hidden === "true";

    const list = await db.assets.getAssets(filter);
    res.json({ ok: true, count: list.length, assets: list });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch assets", details: error.message });
  }
});

router.get("/assets/:id", async (req, res) => {
  try {
    const asset = await db.assets.getAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: `asset not found: ${req.params.id}` });
    res.json({ ok: true, asset });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch asset", details: error.message });
  }
});

router.patch("/assets/:id", async (req, res) => {
  try {
    const patch = {};
    if (req.body.hidden  !== undefined) patch.hidden  = Boolean(req.body.hidden);
    if (req.body.purpose !== undefined) patch.purpose = String(req.body.purpose);

    const updated = await db.assets.updateAsset(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: `asset not found: ${req.params.id}` });
    res.json({ ok: true, asset: updated });
  } catch (error) {
    res.status(500).json({ error: "failed to update asset", details: error.message });
  }
});

router.delete("/assets/:id", async (req, res) => {
  try {
    const deleted = await db.assets.deleteAsset(req.params.id);
    if (!deleted) return res.status(404).json({ error: `asset not found: ${req.params.id}` });
    res.json({ ok: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "failed to delete asset", details: error.message });
  }
});

module.exports = router;
