/**
 * routes/assets.js
 *
 * Asset CRUD routes:
 *   GET    /assets          — list all assets (filter: ?hidden=)
 *   GET    /assets/:id      — single asset
 *   POST   /assets          — upload one or more images as new assets
 *   PATCH  /assets/:id      — update hidden / purpose
 *   DELETE /assets/:id      — remove asset record (cleans up any tag assetIds references)
 */

const crypto  = require("crypto");
const express = require("express");
const db      = require("../db");
const { uploadBufferToWaveSpeed } = require("../api/wavespeed");
const { parseBase64Image }        = require("../utils/imageCollage");
const { saveAssetLocally }        = require("../utils/assets");
const path  = require("path");
const fs    = require("fs");
const sharp = require("sharp");

const router = express.Router();

router.get("/assets", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 30));
    const filter = {};
    if (req.query.hidden !== undefined) filter.hidden = req.query.hidden === "true";
    const list  = await db.assets.getAssets(filter);
    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({ ok: true, total, page, pageSize, totalPages: Math.ceil(total / pageSize), count: slice.length, assets: slice });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch assets", details: error.message });
  }
});

router.get("/assets/:id/thumb", async (req, res) => {
  try {
    const asset = await db.assets.getAsset(req.params.id);
    if (!asset?.assetPath) return res.status(404).json({ error: "no local file" });
    const filePath = path.join(db.ASSETS_DIR, asset.assetPath);
    const buf = await sharp(filePath)
      .resize(300, 300, { fit: "cover", position: "center" })
      .jpeg({ quality: 75 })
      .toBuffer();
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (error) {
    res.status(500).json({ error: "thumbnail failed", details: error.message });
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

/**
 * POST /assets
 * Upload one or more images as new assets.
 * Body: { images: [base64string, ...] }
 */
router.post("/assets", async (req, res) => {
  try {
    const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
    if (!rawImages.length) return res.status(400).json({ error: "images array is required" });

    const created = await Promise.all(
      rawImages.map(async (b64, i) => {
        const parsed   = parseBase64Image(b64);
        const filename = `asset-${Date.now()}-${i}.${parsed.ext}`;
        const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
        const { localPath, assetPath } = await saveAssetLocally("unassigned", "upload", filename, parsed.buffer);
        return db.assets.createAsset({
          id:        crypto.randomUUID(),
          url:       uploaded.url,
          localPath,
          assetPath,
          filename,
          mimeType:  parsed.mimeType,
          hidden:    false,
          timestamp: new Date().toISOString(),
        });
      })
    );

    res.json({ ok: true, assets: created });
  } catch (error) {
    res.status(500).json({ error: "failed to upload assets", details: error.message });
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
    const asset = await db.assets.getAsset(req.params.id);

    const filePath = path.join(db.ASSETS_DIR, asset?.assetPath);

    if (filePath) {
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        console.warn(`Failed to delete local asset file at ${filePath}:`, err);
      }
    }

    const deleted = await db.assets.deleteAsset(req.params.id);
    if (!deleted) return res.status(404).json({ error: `asset not found: ${req.params.id}` });

    // Remove the asset ID from any tag that references it
    const allTags = await db.tags.searchTags("");
    await Promise.all(
      allTags
        .filter((tag) => tag.assetIds && Object.values(tag.assetIds).flat().includes(req.params.id))
        .map((tag) =>
          db.tags.updateTag(tag.key, (t) => {
            for (const group of Object.keys(t.assetIds || {})) {
              t.assetIds[group] = (t.assetIds[group] || []).filter((id) => id !== req.params.id);
            }
            return t;
          })
        )
    );

    const galleryEntries = await db.gallery.getGalleryEntries();  
    // Delete gallery entries with imageAssetId matching the deleted asset
    await Promise.all(
      galleryEntries
        .filter((entry) => entry.imageAssetId === req.params.id)
        .map((entry) => db.gallery.deleteGalleryEntry(entry.id))
    );

    res.json({ ok: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "failed to delete asset", details: error.message });
  }
});

module.exports = router;
