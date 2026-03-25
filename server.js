const path = require('path')
const envPath = process.env.NODE_ENV === "production"
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");

require("dotenv").config({ path: envPath });
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { ensureDb, getTag, saveTag, getTags, searchTags, updateTag, readDb, writeDb, saveGalleryEntry, getGalleryEntries, deleteGalleryEntry } = require("./server/db");
const { uploadBufferToWaveSpeed, generateSeedreamEdit } = require("./server/wavespeed");
const { sanitizeTagKey, parseBase64Image } = require("./server/imageCollage");
const {
  TAG_TYPES,
  ASSET_GROUPS,
  extractTags,
  buildTagRecord,
  compilePrompt
} = require("./server/tagCompiler");

const app = express();
const PORT = Number(process.env.PORT || 4989);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "100mb";
const LLM_MODEL = process.env.LLM_MODEL || "google/gemini-2.5-flash";
const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";
const STORE_BUFFERS = process.env.STORE_BUFFERS === "true";

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", `http://localhost:${PORT}`],
  credentials: true
}));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

const api = express.Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeBasicDescription(type, key) {
  if (type === "location" || type === "prop" || type === "outfit") {
    return key.replace(/[-_]/g, " ");
  }
  return "";
}

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

// ─── Prompt compile cache ──────────────────────────────────────────────────────
const promptCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function makeCacheKey(prompt, tagLocks, tags) {
  const tagStamps = tags.map((t) => `${t.key}:${t.meta?.updatedAt || ""}`).join(",");
  const raw = JSON.stringify({ prompt, tagLocks: tagLocks || {}, tagStamps });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getCached(key) {
  const entry = promptCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { promptCache.delete(key); return null; }
  return entry.value;
}

function setCached(key, value) {
  promptCache.set(key, { value, timestamp: Date.now() });
}

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

// ─── Cost estimation ───────────────────────────────────────────────────────────
const COST_PER_MEGAPIXEL = 0.06;

function estimateCost(sizeStr) {
  if (!sizeStr) return null;
  const [w, h] = sizeStr.split("*").map(Number);
  if (!w || !h) return null;
  return ((w * h) / 1_000_000 * COST_PER_MEGAPIXEL).toFixed(4);
}

function extractImageUrlFromResult(result) {
  if (!result) return null;
  const d = result?.data || result;
  return d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
    result?.outputs?.[0] || result?.images?.[0] || result?.image_url || result?.url || null;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

api.get("/health", async (req, res) => {
  res.json({ ok: true });
});

// ── Tags ──────────────────────────────────────────────────────────────────────

api.post("/tag", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.body.key);
    const type = String(req.body.type || "").trim().toLowerCase();

    if (!key) return res.status(400).json({ error: "key is required" });
    if (!TAG_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${TAG_TYPES.join(", ")}` });

    const existingTag = await getTag(key);
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
    await saveTag(tag);

    res.json({ ok: true, tag: serializeTag(tag) });
  } catch (error) {
    res.status(500).json({ error: "failed to create/update tag", details: error.message });
  }
});

api.get("/tags", async (req, res) => {
  try {
    const tags = await searchTags(String(req.query.key || "").trim());
    res.json({ ok: true, count: tags.length, tags: tags.map(serializeTag) });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch tags", details: error.message });
  }
});

api.get("/tags/:key", async (req, res) => {
  try {
    const tag = await getTag(sanitizeTagKey(req.params.key));
    if (!tag) return res.status(404).json({ error: `tag not found: ${req.params.key}` });
    res.json({ ok: true, tag: serializeTag(tag) });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch tag", details: error.message });
  }
});

api.post("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    if (!await getTag(key)) return res.status(404).json({ error: `tag not found: ${key}` });

    const updated = await updateTag(key, async (tag) => {
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

api.delete("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    if (!await getTag(key)) return res.status(404).json({ error: `tag not found: ${key}` });

    const deleted = {};
    let totalDeleted = 0;

    const updated = await updateTag(key, async (tag) => {
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

api.delete("/tags/:key", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    const db = await readDb();
    if (!db.tags[key]) return res.status(404).json({ error: `tag not found: ${key}` });
    delete db.tags[key];
    await writeDb(db);
    res.json({ ok: true, deleted: key });
  } catch (error) {
    res.status(500).json({ error: "failed to delete tag", details: error.message });
  }
});

// ── Gallery ───────────────────────────────────────────────────────────────────

/**
 * GET /api/gallery
 * Returns all gallery entries, newest first.
 */
api.get("/gallery", async (req, res) => {
  try {
    const entries = await getGalleryEntries();
    res.json({ ok: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch gallery", details: error.message });
  }
});

/**
 * DELETE /api/gallery/:id
 * Delete a single gallery entry by id.
 */
api.delete("/gallery/:id", async (req, res) => {
  try {
    const deleted = await deleteGalleryEntry(req.params.id);
    if (!deleted) return res.status(404).json({ error: `entry not found: ${req.params.id}` });
    res.json({ ok: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "failed to delete gallery entry", details: error.message });
  }
});

// ── Compile ───────────────────────────────────────────────────────────────────

api.post("/compile", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "");
    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const tagKeys = extractTags(prompt);
    const tags = await getTags(tagKeys);

    const compiled = await compilePrompt({
      prompt, tags,
      tagLocks: req.body.tagLocks || {},
      parserOptions: { model: LLM_MODEL },
      visionOptions: { enable: true, force: false, model: VISION_MODEL }
    });

    res.json({ ok: true, compiled });
  } catch (error) {
    res.status(500).json({ error: "failed to compile prompt", details: error.message });
  }
});

// ── Generate ──────────────────────────────────────────────────────────────────

api.post("/generate", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "");
    const size = req.body.size;
    const tagLocks = req.body.tagLocks || {};
    const enableSyncMode = req.body.enable_sync_mode !== false;
    const enableBase64Output = req.body.enable_base64_output === true;
    const rawReferenceImages = Array.isArray(req.body.referenceImages) ? req.body.referenceImages : [];

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const tagKeys = extractTags(prompt);
    const tags = await getTags(tagKeys);

    let compiled;

    if (tags.length > 0) {
      const cacheKey = makeCacheKey(prompt, tagLocks, tags);
      compiled = getCached(cacheKey);
      if (compiled) {
        console.log(`[cache hit] ${cacheKey.slice(0, 12)}…`);
      } else {
        compiled = await compilePrompt({
          prompt, tags, tagLocks,
          parserOptions: { model: LLM_MODEL },
          visionOptions: { enable: false, force: false, model: VISION_MODEL }
        });
        setCached(cacheKey, compiled);
      }
    }

    // Upload any raw base64 reference images and get their URLs
    const uploadedReferenceUrls = await Promise.all(
        rawReferenceImages.map(async (b64, i) => {
            const parsed = parseBase64Image(b64);
            const filename = `ref-${Date.now()}-${i}.${parsed.ext}`;
            const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
            return uploaded.url;
        })
    );

    // Reference images go FIRST so their indices are predictable
    const allImages = [...uploadedReferenceUrls, ...(compiled?.images ?? [])];

    // If there are reference images, prepend a directive to the prompt
    let finalPrompt = compiled?.rawPrompt ?? prompt;
    if (uploadedReferenceUrls.length > 0) {
        const refDirectives = uploadedReferenceUrls
            .map((_, i) => `Use image[${i + 1}] as a visual reference for the overall scene style and composition.`)
            .join("\n");
        finalPrompt = `${finalPrompt}\n\n${refDirectives}`;
    }

    const result = await generateSeedreamEdit({
        images: allImages,
        prompt: finalPrompt,
        size,
        enableSyncMode,
        enableBase64Output
    });

    // Persist to gallery
    const imageUrl = extractImageUrlFromResult(result);
    if (imageUrl) {
      await saveGalleryEntry({
        id: crypto.randomUUID(),
        imageUrl,
        userPrompt: prompt,
        compiledPrompt: compiled?.rawPrompt || null,
        compiledImages: compiled?.images || [],
        referenceImageUrls: uploadedReferenceUrls,
        size: size || null,
        cost: estimateCost(size),
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ ok: true, compiled, wavespeed: result });
  } catch (error) {
    res.status(500).json({
      error: "generation failed",
      details: error.response?.data || error.message
    });
  }
});

// ─── Mount & start ─────────────────────────────────────────────────────────────

app.use("/api", api);

ensureDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  🎨  Seedream Studio`);
      console.log(`  ➜  API:    http://localhost:${PORT}/api`);
      console.log(`  ➜  Client: http://localhost:5173  (dev)\n`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize:", error);
    process.exit(1);
  });
