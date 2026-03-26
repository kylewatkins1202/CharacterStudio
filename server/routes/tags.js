/**
 * routes/tags.js
 *
 * Tag CRUD routes:
 *   POST   /tag
 *   GET    /tags
 *   GET    /tags/:key
 *   POST   /tags/:key/images
 *   DELETE /tags/:key/images
 *   DELETE /tags/:key
 *
 * Tags store asset references by ID (assetIds) rather than embedding full
 * asset objects. All mutations create/delete records in db.assets and keep
 * assetIds in sync. GET routes populate assets from the assets table before
 * responding, so callers always receive the familiar `assets: { group: [...] }`
 * shape.
 *
 * Backward compat: tags that still carry embedded `assets` objects (written
 * before this refactor) are returned as-is; the populate helper detects the
 * format automatically.
 */

const crypto  = require("crypto");
const express = require("express");
const db      = require("../db");
const { uploadBufferToWaveSpeed } = require("../api/wavespeed");
const { sanitizeTagKey, parseBase64Image } = require("../utils/imageCollage");
const { TAG_TYPES, ASSET_GROUPS, buildTagRecord } = require("../utils/tagCompiler");
const { saveAssetLocally } = require("../utils/assets");

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBasicDescription(type, key) {
  if (type === "location" || type === "prop" || type === "outfit") {
    return key.replace(/[-_]/g, " ");
  }
  return "";
}

function mergeTagLockDescriptions(tag, body) {
  const nextLock = { ...(tag.lock || {}) };
  if (typeof body.basicDescription     === "string") nextLock.basicDescription     = body.basicDescription.trim();
  if (typeof body.appearanceDescription === "string") nextLock.appearanceDescription = body.appearanceDescription.trim();
  if (typeof body.bodyDescription      === "string") nextLock.bodyDescription      = body.bodyDescription.trim();
  if (!nextLock.basicDescription && tag.type !== "character") {
    nextLock.basicDescription = makeBasicDescription(tag.type, tag.key);
  }
  return nextLock;
}

/**
 * Populate a tag's `assets` field from the assets DB using stored IDs.
 *
 * If the tag already has embedded assets (old format, no assetIds) it is
 * returned as-is for backward compatibility.
 *
 * @param {object|null} tag
 * @returns {Promise<object|null>}
 */
async function populateTag(tag) {
  if (!tag) return null;
  // Old format — assets are embedded directly; nothing to resolve
  if (!tag.assetIds) return tag;

  const allIds  = Object.values(tag.assetIds).flat().filter(Boolean);
  const fetched = await db.assets.getAssetsByIds(allIds);
  const byId    = Object.fromEntries(fetched.map((a) => [a.id, a]));

  const assets = {};
  for (const [group, ids] of Object.entries(tag.assetIds)) {
    assets[group] = ids.map((id) => byId[id]).filter(Boolean);
  }

  return { ...tag, assets };
}

/**
 * Strip raw buffer fields from a populated tag before sending to the client.
 * @param {object|null} tag
 * @returns {object|null}
 */
function serializeTag(tag) {
  if (!tag) return null;
  return {
    ...tag,
    assets: Object.fromEntries(
      Object.entries(tag.assets || {}).map(([group, items]) => [
        group,
        Array.isArray(items) ? items.map(({ buffer, ...rest }) => rest) : [],
      ])
    ),
  };
}

/**
 * Upload an image, save it locally, register it in the assets DB, and
 * return the asset record. The caller appends `asset.id` to the tag's
 * assetIds.
 */
async function createTagAsset({ tagKey, group, parsed, filename }) {
  const uploaded                  = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
  const { localPath, assetPath }  = await saveAssetLocally(tagKey, group, filename, parsed.buffer);
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
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post("/tag", async (req, res) => {
  try {
    const key  = sanitizeTagKey(req.body.key);
    const type = String(req.body.type || "").trim().toLowerCase();

    if (!key) return res.status(400).json({ error: "key is required" });
    if (!TAG_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${TAG_TYPES.join(", ")}` });

    const existingTag = await db.tags.getTag(key);
    // buildTagRecord initialises the legacy `assets` shape; we'll convert below
    const tag = buildTagRecord({ key, type, existingTag });
    tag.lock = mergeTagLockDescriptions(tag, req.body);

    // Migrate embedded assets to assetIds on first edit if needed
    if (!tag.assetIds) {
      tag.assetIds = Object.fromEntries(
        ASSET_GROUPS.map((g) => [g, (tag.assets?.[g] || []).map((a) => a.id).filter(Boolean)])
      );
    }
    delete tag.assets; // no longer stored on the tag record

    for (const group of ASSET_GROUPS) {
      const rawImages = Array.isArray(req.body[group]) ? req.body[group] : [];
      for (let i = 0; i < rawImages.length; i++) {
        const parsed   = parseBase64Image(rawImages[i]);
        const filename = `${key}-${group}-${Date.now()}-${i}.${parsed.ext}`;
        const asset    = await createTagAsset({ tagKey: key, group, parsed, filename });
        if (!Array.isArray(tag.assetIds[group])) tag.assetIds[group] = [];
        tag.assetIds[group].push(asset.id);
      }
    }

    tag.meta = tag.meta || {};
    const now = new Date().toISOString();
    if (!tag.meta.createdAt) tag.meta.createdAt = now;
    tag.meta.updatedAt = now;
    await db.tags.saveTag(tag);

    res.json({ ok: true, tag: serializeTag(await populateTag(tag)) });
  } catch (error) {
    res.status(500).json({ error: "failed to create/update tag", details: error.message });
  }
});

router.get("/tags", async (req, res) => {
  try {
    const tagList    = await db.tags.searchTags(String(req.query.key || "").trim());
    const populated  = await Promise.all(tagList.map(populateTag));
    res.json({ ok: true, count: populated.length, tags: populated.map(serializeTag) });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch tags", details: error.message });
  }
});

router.get("/tags/:key", async (req, res) => {
  try {
    const tag = await db.tags.getTag(sanitizeTagKey(req.params.key));
    if (!tag) return res.status(404).json({ error: `tag not found: ${req.params.key}` });
    res.json({ ok: true, tag: serializeTag(await populateTag(tag)) });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch tag", details: error.message });
  }
});

router.post("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    if (!await db.tags.getTag(key)) return res.status(404).json({ error: `tag not found: ${key}` });

    const updated = await db.tags.updateTag(key, async (tag) => {
      if (!tag.assetIds) tag.assetIds = Object.fromEntries(ASSET_GROUPS.map((g) => [g, []]));

      for (const group of ASSET_GROUPS) {
        const rawImages = Array.isArray(req.body[group]) ? req.body[group] : [];
        for (let i = 0; i < rawImages.length; i++) {
          const parsed   = parseBase64Image(rawImages[i]);
          const filename = `${key}-${group}-${Date.now()}-${i}.${parsed.ext}`;
          const asset    = await createTagAsset({ tagKey: key, group, parsed, filename });
          if (!Array.isArray(tag.assetIds[group])) tag.assetIds[group] = [];
          tag.assetIds[group].push(asset.id);
        }
      }
      tag.meta = tag.meta || {};
      tag.meta.updatedAt = new Date().toISOString();
      return tag;
    });

    res.json({ ok: true, tag: serializeTag(await populateTag(updated)) });
  } catch (error) {
    res.status(500).json({ error: "failed to add images to tag", details: error.message });
  }
});

/**
 * POST /tags/:key/assets/:assetId
 * Assign an existing (unassigned) asset to a tag group.
 * Body: { group: "face" | "body" | ... }
 */
router.post("/tags/:key/assets/:assetId", async (req, res) => {
  try {
    const key     = sanitizeTagKey(req.params.key);
    const assetId = req.params.assetId;
    const group   = String(req.body.group || "").trim();

    if (!ASSET_GROUPS.includes(group)) {
      return res.status(400).json({ error: `group must be one of: ${ASSET_GROUPS.join(", ")}` });
    }

    const tag   = await db.tags.getTag(key);
    if (!tag) return res.status(404).json({ error: `tag not found: ${key}` });

    const asset = await db.assets.getAsset(assetId);
    if (!asset) return res.status(404).json({ error: `asset not found: ${assetId}` });

    const updated = await db.tags.updateTag(key, async (t) => {
      if (!t.assetIds) t.assetIds = Object.fromEntries(ASSET_GROUPS.map((g) => [g, []]));
      if (!Array.isArray(t.assetIds[group])) t.assetIds[group] = [];
      if (!t.assetIds[group].includes(assetId)) t.assetIds[group].push(assetId);
      t.meta = t.meta || {};
      t.meta.updatedAt = new Date().toISOString();
      return t;
    });

    res.json({ ok: true, tag: serializeTag(await populateTag(updated)) });
  } catch (error) {
    res.status(500).json({ error: "failed to assign asset to tag", details: error.message });
  }
});

router.delete("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    if (!await db.tags.getTag(key)) return res.status(404).json({ error: `tag not found: ${key}` });

    const deleted = {};
    let totalDeleted = 0;

    const updated = await db.tags.updateTag(key, async (tag) => {
      const groups = Object.keys(tag.assetIds || tag.assets || {});
      for (const group of groups) {
        const idsToDelete = new Set(Array.isArray(req.body[group]) ? req.body[group].map(String) : []);
        if (!idsToDelete.size) continue;

        if (tag.assetIds) {
          const before = tag.assetIds[group] || [];
          tag.assetIds[group] = before.filter((id) => !idsToDelete.has(id));
          const removed = before.length - tag.assetIds[group].length;
          if (removed > 0) { deleted[group] = removed; totalDeleted += removed; }
          // Asset records are not modified — the tag simply stops referencing them
        } else {
          // Old format fallback
          const before = Array.isArray(tag.assets[group]) ? tag.assets[group] : [];
          tag.assets[group] = before.filter((a) => !idsToDelete.has(String(a.id || "")));
          const removed = before.length - tag.assets[group].length;
          if (removed > 0) { deleted[group] = removed; totalDeleted += removed; }
        }
      }
      tag.meta = tag.meta || {};
      tag.meta.updatedAt = new Date().toISOString();
      return tag;
    });

    res.json({ ok: true, totalDeleted, deleted, tag: serializeTag(await populateTag(updated)) });
  } catch (error) {
    res.status(500).json({ error: "failed to delete images from tag", details: error.message });
  }
});

router.delete("/tags/:key", async (req, res) => {
  try {
    const key    = sanitizeTagKey(req.params.key);
    const dbData = await db.tags.read();
    if (!dbData.tags[key]) return res.status(404).json({ error: `tag not found: ${key}` });
    // Asset records are not modified when a tag is deleted — they remain in the assets DB
    delete dbData.tags[key];
    await db.tags.write(dbData);
    res.json({ ok: true, deleted: key });
  } catch (error) {
    res.status(500).json({ error: "failed to delete tag", details: error.message });
  }
});

module.exports = router;
