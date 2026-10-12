/**
 * routes/assets.js
 *
 * Asset CRUD routes:
 *   GET    /assets              — list all assets (filter: ?hidden=, ?folder=)
 *   GET    /assets/folders      — list all folders with counts
 *   POST   /assets/folders      — create a user folder
 *   DELETE /assets/folders/:name — delete an empty user folder
 *   POST   /assets/move         — move assets to a folder
 *   GET    /assets/:id          — single asset
 *   POST   /assets              — upload one or more images as new assets
 *   PATCH  /assets/:id          — update hidden / purpose
 *   DELETE /assets/:id          — remove asset record (cleans up tag assetIds references)
 *
 * NOTE: Literal routes (/folders, /move) are registered before /:id wildcards
 * to prevent Express from matching the literal path as an :id param.
 */

const crypto  = require("crypto");
const express = require("express");
const path    = require("path");
const fs      = require("fs");
const fsp     = require("fs").promises;
const sharp   = require("sharp");
const db      = require("../db");
const { uploadBufferToWaveSpeed } = require("../api/wavespeed");
const { parseBase64Image }        = require("../utils/imageCollage");
const { saveToFolder, healAsset }            = require("../utils/assets");

const router = express.Router();

const BUILTIN_FOLDERS  = db.assets.constructor.BUILTIN_FOLDERS;
const getAssetFolder   = db.assets.constructor.getAssetFolder;
const FOLDER_NAME_RE   = /^[a-zA-Z0-9_-]+$/;

// ─── Folder helpers ───────────────────────────────────────────────────────────

/** Resolve a unique target path inside a folder, appending -2/-3/… on conflict. */
async function resolveTargetPath(folder, filename) {
  const ext      = path.extname(filename);
  const base     = path.basename(filename, ext);
  let   candidate = path.join(db.ASSETS_DIR, folder, filename);
  let   suffix   = 1;
  while (true) {
    try {
      await fsp.access(candidate);
      // File exists — try next suffix
      suffix++;
      candidate = path.join(db.ASSETS_DIR, folder, `${base}-${suffix}${ext}`);
    } catch {
      // File does not exist — use this path
      return candidate;
    }
  }
}

// ─── GET /assets ─────────────────────────────────────────────────────────────

router.get("/assets", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 30));
    const filter   = {};
    if (req.query.hidden !== undefined) filter.hidden = req.query.hidden === "true";
    if (req.query.folder !== undefined) filter.folder = req.query.folder;
    let list  = (await db.assets.getAssets(filter))
    console.log(list)
    for (let i = 0; i < list.length; i++) {
      list[i].url = (await healAsset({...list[i]})).url
    }
    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({ ok: true, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1, count: slice.length, assets: slice });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch assets", details: error.message });
  }
});

// ─── GET /assets/:id/file ────────────────────────────────────────────────────

router.get("/assets/:id/file", async (req, res) => {
  try {
    const asset = await db.assets.getAsset(req.params.id);
    if (!asset?.assetPath) return res.status(404).json({ error: "no local file" });
    const filePath = path.join(db.ASSETS_DIR, ...asset.assetPath.split("/"));
    res.set("Cache-Control", "public, max-age=86400");
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "local file missing" });
    });
  } catch (error) {
    res.status(500).json({ error: "failed to serve file", details: error.message });
  }
});

// ─── GET /assets/folders ─────────────────────────────────────────────────────

router.get("/assets/folders", async (req, res) => {
  try {
    const folders = await db.assets.getAllFolders();
    res.json({ ok: true, folders });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch folders", details: error.message });
  }
});

// ─── POST /assets/folders ────────────────────────────────────────────────────

router.post("/assets/folders", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().toLowerCase();
    if (!name)               return res.status(400).json({ error: "name is required" });
    if (!FOLDER_NAME_RE.test(name)) return res.status(400).json({ error: "name must be alphanumeric with dashes/underscores only" });
    if (BUILTIN_FOLDERS.includes(name)) return res.status(400).json({ error: `"${name}" is a built-in folder and cannot be created` });
    await db.assets.addUserFolder(name);
    res.json({ ok: true, folder: { name, count: 0, builtin: false } });
  } catch (error) {
    res.status(500).json({ error: "failed to create folder", details: error.message });
  }
});

// ─── DELETE /assets/folders/:name ────────────────────────────────────────────

router.delete("/assets/folders/:name", async (req, res) => {
  try {
    const name = req.params.name;
    if (BUILTIN_FOLDERS.includes(name)) return res.status(400).json({ error: `"${name}" is a built-in folder and cannot be deleted` });
    // Ensure the folder is empty
    const inFolder = await db.assets.getAssets({ folder: name });
    if (inFolder.length > 0) return res.status(400).json({ error: `folder "${name}" is not empty (${inFolder.length} assets)` });
    await db.assets.removeUserFolder(name);
    res.json({ ok: true, deleted: name });
  } catch (error) {
    res.status(500).json({ error: "failed to delete folder", details: error.message });
  }
});

// ─── POST /assets/move ───────────────────────────────────────────────────────

router.post("/assets/move", async (req, res) => {
  try {
    const ids    = Array.isArray(req.body.ids) ? req.body.ids : [];
    const folder = String(req.body.folder || "").trim();
    if (!ids.length)  return res.status(400).json({ error: "ids array is required" });
    if (!folder)      return res.status(400).json({ error: "folder is required" });
    if (!FOLDER_NAME_RE.test(folder)) return res.status(400).json({ error: "invalid folder name" });

    // Ensure target folder dir exists
    await fsp.mkdir(path.join(db.ASSETS_DIR, folder), { recursive: true });

    const results = [];
    for (const id of ids) {
      const asset = await db.assets.getAsset(id);
      if (!asset) { results.push({ id, ok: false, error: "not found" }); continue; }
      if (!asset.assetPath) { results.push({ id, ok: false, error: "no local file" }); continue; }

      const filename     = asset.assetPath.split("/").pop();
      const oldAbs       = path.join(db.ASSETS_DIR, ...asset.assetPath.split("/"));
      const newAbs       = await resolveTargetPath(folder, filename);
      const newFile      = path.basename(newAbs);
      const newAssetPath = `${folder}/${newFile}`;

      try {
        await fsp.rename(oldAbs, newAbs);
      } catch (err) {
        // If rename fails across devices, fall back to copy+delete
        await fsp.copyFile(oldAbs, newAbs);
        await fsp.unlink(oldAbs).catch(() => {});
      }

      await db.assets.updateAsset(id, { assetPath: newAssetPath, localPath: newAbs });
      results.push({ id, ok: true });
    }

    const moved  = results.filter((r) => r.ok).length;
    const errors = results.filter((r) => !r.ok);
    res.json({ ok: true, moved, errors });
  } catch (error) {
    res.status(500).json({ error: "failed to move assets", details: error.message });
  }
});

// ─── GET /assets/:id/thumb ───────────────────────────────────────────────────

router.get("/assets/:id/thumb", async (req, res) => {
  try {
    const asset = await db.assets.getAsset(req.params.id);
    if (!asset?.assetPath) return res.status(404).json({ error: "no local file" });
    const filePath = path.join(db.ASSETS_DIR, ...asset.assetPath.split("/"));
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

// ─── GET /assets/:id ─────────────────────────────────────────────────────────

router.get("/assets/:id", async (req, res) => {
  try {
    const asset = await db.assets.getAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: `asset not found: ${req.params.id}` });
    res.json({ ok: true, asset });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch asset", details: error.message });
  }
});

// ─── POST /assets ─────────────────────────────────────────────────────────────

/**
 * Upload one or more images as new assets into the "assets" folder.
 * Body: { images: [base64string, ...], folder?: string }
 */
router.post("/assets", async (req, res) => {
  try {
    const rawImages    = Array.isArray(req.body.images) ? req.body.images : [];
    const targetFolder = String(req.body.folder || "assets").trim() || "assets";
    if (!rawImages.length) return res.status(400).json({ error: "images array is required" });

    const created = [];
    for (let i = 0; i < rawImages.length; i++) {
      const parsed   = parseBase64Image(rawImages[i]);
      const filename = `asset-${Date.now()}-${i}.${parsed.ext}`;
      const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
      const { localPath, assetPath } = await saveToFolder(targetFolder, filename, parsed.buffer);
      const asset = await db.assets.createAsset({
        id:        crypto.randomUUID(),
        url:       uploaded.url,
        localPath,
        assetPath,
        filename,
        mimeType:  parsed.mimeType,
        hidden:    false,
        timestamp: new Date().toISOString(),
      });
      created.push(asset);
    }

    res.json({ ok: true, assets: created });
  } catch (error) {
    res.status(500).json({ error: "failed to upload assets", details: error.message });
  }
});

// ─── PATCH /assets/:id ───────────────────────────────────────────────────────

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

// ─── DELETE /assets/:id ──────────────────────────────────────────────────────

router.delete("/assets/:id", async (req, res) => {
  try {
    const asset = await db.assets.getAsset(req.params.id);

    if (asset?.assetPath) {
      const filePath = path.join(db.ASSETS_DIR, ...asset.assetPath.split("/"));
      try {
        await fsp.unlink(filePath);
      } catch (err) {
        console.warn(`Failed to delete local asset file at ${filePath}:`, err);
      }
    }

    const deleted = await db.assets.deleteAsset(req.params.id);
    if (!deleted) return res.status(404).json({ error: `asset not found: ${req.params.id}` });

    // Remove the asset ID from any tag that references it
    const allTags = await db.tags.searchTags("");
    const referencingTags = allTags.filter(
      (tag) => tag.assetIds && Object.values(tag.assetIds).flat().includes(req.params.id)
    );
    for (const tag of referencingTags) {
      await db.tags.updateTag(tag.key, (t) => {
        for (const group of Object.keys(t.assetIds || {})) {
          t.assetIds[group] = (t.assetIds[group] || []).filter((id) => id !== req.params.id);
        }
        return t;
      });
    }

    const galleryEntries = await db.gallery.getGalleryEntries();
    for (const entry of galleryEntries.filter((e) => e.imageAssetId === req.params.id)) {
      await db.gallery.deleteGalleryEntry(entry.id);
    }

    res.json({ ok: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "failed to delete asset", details: error.message });
  }
});

module.exports = router;
