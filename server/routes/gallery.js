/**
 * routes/gallery.js
 *
 * Gallery routes:
 *   GET    /gallery
 *   DELETE /gallery/:id
 *   PATCH  /gallery/:id
 *   POST   /gallery/:id/download
 *
 * Gallery entries store asset IDs (imageAssetId, referenceAssetIds) rather
 * than raw URLs. GET /gallery resolves and heals those IDs before responding
 * so the frontend always receives fresh, working URLs.
 *
 * Legacy entries that still carry imageUrl / referenceImages / referenceImageUrls
 * are returned as-is for backward compatibility.
 */

const crypto  = require("crypto");
const express = require("express");
const db      = require("../db");
const { healAsset, saveAssetLocally } = require("../utils/assets");

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve and heal a gallery entry's asset references, returning a version
 * safe to send to the client (with live imageUrl / referenceImages / localUrl).
 */
async function populateEntry(entry) {
  let imageUrl = entry.imageUrl || null;   // legacy fallback
  let localUrl = entry.localUrl || null;
  let hidden   = entry.hidden   || false;  // legacy fallback

  // Resolve generated image asset
  if (entry.imageAssetId) {
    const asset  = await db.assets.getAsset(entry.imageAssetId);
    const healed = asset ? await healAsset(asset) : null;
    if (healed) {
      imageUrl = healed.url;
      localUrl = healed.assetPath ? `/api/assets/${healed.assetPath}` : null;
      hidden   = Boolean(healed.hidden);
    }
  }

  // Resolve reference asset IDs → [{ url, purpose }]
  let referenceImages = entry.referenceImages || [];   // legacy fallback
  if (entry.referenceAssetIds?.length) {
    // Support both old format (string[]) and new format ({ id, purpose }[])
    const items      = entry.referenceAssetIds.map((item) =>
      typeof item === "string" ? { id: item, purpose: "" } : item
    );
    const ids        = items.map((i) => i.id);
    const purposeMap = Object.fromEntries(items.map((i) => [i.id, i.purpose]));
    const assets     = await db.assets.getAssetsByIds(ids);
    const healed     = await Promise.all(assets.map(healAsset));
    referenceImages  = healed
      .filter(Boolean)
      .map((a) => ({ url: a.url, purpose: purposeMap[a.id] ?? a.purpose ?? "" }));
  }

  return { ...entry, imageUrl, localUrl, referenceImages, hidden };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/gallery", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const all      = await db.gallery.getGalleryEntries();

    // Optional hidden filter — mirrors the assets route behaviour.
    // Requires a single batch asset lookup to resolve hidden state for new-format entries.
    let filtered = all;
    if (req.query.hidden !== undefined) {
      const wantHidden = req.query.hidden === "true";
      const assetList  = await db.assets.getAssets();
      const hiddenById = Object.fromEntries(assetList.map((a) => [a.id, Boolean(a.hidden)]));
      filtered = all.filter((entry) => {
        const isHidden = entry.imageAssetId
          ? Boolean(hiddenById[entry.imageAssetId])
          : Boolean(entry.hidden);
        return isHidden === wantHidden;
      });
    }

    const total     = filtered.length;
    const slice     = filtered.slice((page - 1) * pageSize, page * pageSize);
    const populated = await Promise.all(slice.map(populateEntry));
    res.json({ ok: true, total, page, pageSize, totalPages: Math.ceil(total / pageSize), count: populated.length, entries: populated });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch gallery", details: error.message });
  }
});

router.delete("/gallery/:id", async (req, res) => {
  try {
    const deleted = await db.gallery.deleteGalleryEntry(req.params.id);
    if (!deleted) return res.status(404).json({ error: `entry not found: ${req.params.id}` });
    res.json({ ok: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "failed to delete gallery entry", details: error.message });
  }
});

router.patch("/gallery/:id", async (req, res) => {
  try {
    const data = await db.gallery.read();
    const idx  = data.entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: `entry not found: ${req.params.id}` });

    const entry = data.entries[idx];

    // Hidden state lives on the asset, not the gallery entry
    if (req.body.hidden !== undefined) {
      if (entry.imageAssetId) {
        await db.assets.updateAsset(entry.imageAssetId, { hidden: Boolean(req.body.hidden) });
      } else {
        // Legacy entry: no asset record, fall back to gallery-level flag
        entry.hidden = Boolean(req.body.hidden);
        await db.gallery.write(data);
      }
    }

    res.json({ ok: true, entry: await populateEntry(entry) });
  } catch (error) {
    res.status(500).json({ error: "failed to update gallery entry", details: error.message });
  }
});

/**
 * POST /gallery/:id/download
 * Ensures the gallery image has a local copy and returns its static URL.
 * If the asset already has a local copy, returns it immediately.
 * Otherwise downloads the remote URL, saves it to disk, and updates the asset record.
 * For legacy entries (no imageAssetId) a new asset record is created and the
 * gallery entry is updated with the new imageAssetId.
 */
router.post("/gallery/:id/download", async (req, res) => {
  try {
    const entries = await db.gallery.getGalleryEntries();
    const entry   = entries.find((e) => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: `entry not found: ${req.params.id}` });

    // Helper: download a URL, save locally, return { localPath, assetPath }
    const downloadAndSave = async (url, existingFilename) => {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`fetch failed: ${imgRes.status}`);
      const buffer      = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const ext         = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const filename    = existingFilename || `generated-${Date.now()}.${ext}`;
      const saved       = await saveAssetLocally("generated", "result", filename, buffer);
      return { ...saved, contentType, filename };
    };

    // New-format entry: resolve via asset record
    if (entry.imageAssetId) {
      const asset  = await db.assets.getAsset(entry.imageAssetId);
      const healed = asset ? await healAsset(asset) : null;

      // Already saved locally
      if (healed?.assetPath) {
        return res.json({ ok: true, localUrl: `/api/assets/${healed.assetPath}` });
      }

      // Asset exists but no local copy — download now and update the record
      const url = healed?.url || asset?.url;
      if (url) {
        const { localPath, assetPath, filename } = await downloadAndSave(url, asset?.filename);
        await db.assets.updateAsset(entry.imageAssetId, { localPath, assetPath });
        return res.json({ ok: true, localUrl: `/api/assets/${assetPath}` });
      }

      return res.status(404).json({ error: "no URL available to download" });
    }

    // Legacy entry: already has a local copy
    if (entry.localUrl) {
      return res.json({ ok: true, localUrl: entry.localUrl });
    }

    // Legacy entry: download, create asset record, update gallery entry
    const url = entry.imageUrl;
    if (url) {
      const { localPath, assetPath, contentType, filename } = await downloadAndSave(url, null);
      const imageAsset = await db.assets.createAsset({
        id: crypto.randomUUID(), url, localPath, assetPath, filename,
        mimeType: contentType, hidden: false, timestamp: new Date().toISOString(),
      });
      // Upgrade the gallery entry to use an asset ID
      const data = await db.gallery.read();
      const idx  = data.entries.findIndex((e) => e.id === entry.id);
      if (idx !== -1) { data.entries[idx].imageAssetId = imageAsset.id; await db.gallery.write(data); }
      return res.json({ ok: true, localUrl: `/api/assets/${assetPath}` });
    }

    res.status(404).json({ error: "no URL available for legacy entry" });
  } catch (error) {
    res.status(500).json({ error: "failed to resolve download", details: error.message });
  }
});

module.exports = router;
