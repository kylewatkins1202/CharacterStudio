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
 */

const crypto = require("crypto");
const express = require("express");
const db = require("../db");
const { uploadBufferToWaveSpeed } = require("../wavespeed");
const { sanitizeTagKey, parseBase64Image } = require("../utils/imageCollage");
const { TAG_TYPES, ASSET_GROUPS, buildTagRecord } = require("../utils/tagCompiler");

const router = express.Router();

// Whether to persist the raw image buffer alongside the URL.
const STORE_BUFFERS = process.env.STORE_BUFFERS === "true";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a plain-text description for non-character tags that have no
 * explicit description yet.
 *
 * @param {string} type
 * @param {string} key
 * @returns {string}
 */
function makeBasicDescription(type, key) {
  if (type === "location" || type === "prop" || type === "outfit") {
    return key.replace(/[-_]/g, " ");
  }
  return "";
}

/**
 * Merge incoming description fields from the request body into the tag's
 * lock object, applying a fallback basic description when needed.
 *
 * @param {object} tag
 * @param {object} body - req.body
 * @returns {object} Updated lock object.
 */
function mergeTagLockDescriptions(tag, body) {
  const nextLock = { ...(tag.lock || {}) };
  if (typeof body.basicDescription === "string") nextLock.basicDescription = body.basicDescription.trim();
  if (typeof body.appearanceDescription === "string") nextLock.appearanceDescription = body.appearanceDescription.trim();
  if (typeof body.bodyDescription === "string") nextLock.bodyDescription = body.bodyDescription.trim();
  if (!nextLock.basicDescription && tag.type !== "character") {
    nextLock.basicDescription = makeBasicDescription(tag.type, tag.key);
  }
  return nextLock;
}

/**
 * Strip raw image buffers from a tag before sending it to the client.
 *
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
        Array.isArray(items) ? items.map(({ buffer, ...rest }) => rest) : []
      ])
    )
  };
}

/**
 * Build a stored-asset record from an uploaded file.
 *
 * @param {object} options
 * @param {{ url: string }} options.uploaded
 * @param {string}          options.filename
 * @param {string}          options.mimeType
 * @param {Buffer}          options.buffer
 * @param {string}          [options.source]
 * @returns {object}
 */
function createStoredAsset({ uploaded, filename, mimeType, buffer, source = "base64" }) {
  return {
    id: crypto.randomUUID(),
    url: uploaded.url,
    filename,
    mimeType,
    source,
    ...(STORE_BUFFERS && { buffer })
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.post("/tag", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.body.key);
    const type = String(req.body.type || "").trim().toLowerCase();

    if (!key) return res.status(400).json({ error: "key is required" });
    if (!TAG_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${TAG_TYPES.join(", ")}` });

    const existingTag = await db.tags.getTag(key);
    const tag = buildTagRecord({ key, type, existingTag });
    tag.lock = mergeTagLockDescriptions(tag, req.body);

    for (const group of ASSET_GROUPS) {
      const rawImages = Array.isArray(req.body[group]) ? req.body[group] : [];
      for (let index = 0; index < rawImages.length; index += 1) {
        const parsed = parseBase64Image(rawImages[index]);
        const filename = `${key}-${group}-${Date.now()}-${index}.${parsed.ext}`;
        const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
        tag.assets[group].push(createStoredAsset({ uploaded, filename, mimeType: parsed.mimeType, buffer: parsed.buffer }));
      }
    }

    tag.meta = tag.meta || {};
    const now = new Date().toISOString();
    if (!tag.meta.createdAt) tag.meta.createdAt = now;
    tag.meta.updatedAt = now;
    await db.tags.saveTag(tag);

    res.json({ ok: true, tag: serializeTag(tag) });
  } catch (error) {
    res.status(500).json({ error: "failed to create/update tag", details: error.message });
  }
});

router.get("/tags", async (req, res) => {
  try {
    const tagList = await db.tags.searchTags(String(req.query.key || "").trim());
    res.json({ ok: true, count: tagList.length, tags: tagList.map(serializeTag) });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch tags", details: error.message });
  }
});

router.get("/tags/:key", async (req, res) => {
  try {
    const tag = await db.tags.getTag(sanitizeTagKey(req.params.key));
    if (!tag) return res.status(404).json({ error: `tag not found: ${req.params.key}` });
    res.json({ ok: true, tag: serializeTag(tag) });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch tag", details: error.message });
  }
});

router.post("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    if (!await db.tags.getTag(key)) return res.status(404).json({ error: `tag not found: ${key}` });

    const updated = await db.tags.updateTag(key, async (tag) => {
      for (const group of ASSET_GROUPS) {
        const rawImages = Array.isArray(req.body[group]) ? req.body[group] : [];
        for (let index = 0; index < rawImages.length; index += 1) {
          const parsed = parseBase64Image(rawImages[index]);
          const filename = `${key}-${group}-${Date.now()}-${index}.${parsed.ext}`;
          const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
          tag.assets[group].push(createStoredAsset({ uploaded, filename, mimeType: parsed.mimeType, buffer: parsed.buffer }));
        }
      }
      tag.meta = tag.meta || {};
      tag.meta.updatedAt = new Date().toISOString();
      return tag;
    });

    res.json({ ok: true, tag: serializeTag(updated) });
  } catch (error) {
    res.status(500).json({ error: "failed to add images to tag", details: error.message });
  }
});

router.delete("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    if (!await db.tags.getTag(key)) return res.status(404).json({ error: `tag not found: ${key}` });

    const deleted = {};
    let totalDeleted = 0;

    const updated = await db.tags.updateTag(key, async (tag) => {
      for (const group of ASSET_GROUPS) {
        const idsToDelete = new Set(Array.isArray(req.body[group]) ? req.body[group].map(String) : []);
        if (!idsToDelete.size) continue;
        const before = Array.isArray(tag.assets[group]) ? tag.assets[group] : [];
        const after = before.filter((a) => !idsToDelete.has(String(a.id || "")));
        const removed = before.length - after.length;
        if (removed > 0) { deleted[group] = removed; totalDeleted += removed; }
        tag.assets[group] = after;
      }
      tag.meta = tag.meta || {};
      tag.meta.updatedAt = new Date().toISOString();
      return tag;
    });

    res.json({ ok: true, totalDeleted, deleted, tag: serializeTag(updated) });
  } catch (error) {
    res.status(500).json({ error: "failed to delete images from tag", details: error.message });
  }
});

router.delete("/tags/:key", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    const dbTags = await db.tags.read();
    if (!dbTags.tags[key]) return res.status(404).json({ error: `tag not found: ${key}` });
    delete dbTags.tags[key];
    await db.tags.write(dbTags);
    res.json({ ok: true, deleted: key });
  } catch (error) {
    res.status(500).json({ error: "failed to delete tag", details: error.message });
  }
});

module.exports = router;
