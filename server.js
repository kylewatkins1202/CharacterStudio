const fs = require("fs/promises");
const path = require("path");
const envPath = process.env.NODE_ENV === "production"
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");

require("dotenv").config({ path: envPath });
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { ensureDb, getTag, saveTag, getTags, searchTags, updateTag, readDb, writeDb, saveGalleryEntry, getGalleryEntries, deleteGalleryEntry, DOWNLOADS_DIR } = require("./server/db");
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

// ─── Persistent prompt compile cache ──────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PATH = path.join(__dirname, "server", "data", "prompt_cache.json");

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write prompt cache:", err.message);
  }
}

function makeCacheKey(prompt, tagLocks, tags) {
  const tagStamps = tags.map((t) => `${t.key}:${t.meta?.updatedAt || ""}`).join(",");
  const raw = JSON.stringify({ prompt, tagLocks: tagLocks || {}, tagStamps });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function getCached(key) {
  const cache = await readCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    // Expired — clean it up
    delete cache[key];
    await writeCache(cache);
    return null;
  }
  return entry.value;
}

async function setCached(key, value) {
  const cache = await readCache();
  cache[key] = { value, timestamp: Date.now() };
  await writeCache(cache);
}

async function deleteCached(key) {
  const cache = await readCache();
  if (cache[key]) {
    delete cache[key];
    await writeCache(cache);
  }
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


api.use("/downloads", express.static(DOWNLOADS_DIR));

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

/**
 * POST /api/gallery/:id/download
 * Downloads the image locally and updates the gallery entry with the local path.
 */
api.post("/gallery/:id/download", async (req, res) => {
  try {
    const entries = await getGalleryEntries();
    const entry = entries.find((e) => e.id === req.params.id);

    if (!entry) {
      return res.status(404).json({ error: `entry not found: ${req.params.id}` });
    }

    if (entry.localPath) {
      // Already downloaded — return existing local URL
      return res.json({ ok: true, localUrl: `/api/downloads/${path.basename(entry.localPath)}` });
    }

    // Fetch the remote image
    const response = await fetch(entry.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect extension from content-type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const filename = `${entry.id}.${ext}`;
    const localPath = path.join(DOWNLOADS_DIR, filename);

    // Write to disk
    await fs.writeFile(localPath, buffer);

    // Update the gallery entry with the local path
    const { readGallery, writeGallery } = require("./server/db");
    const data = await readGallery();
    const idx = data.entries.findIndex((e) => e.id === req.params.id);
    if (idx !== -1) {
      data.entries[idx].localPath = localPath;
      data.entries[idx].localUrl = `/api/downloads/${filename}`;
      await writeGallery(data);
    }

    res.json({ ok: true, localUrl: `/api/downloads/${filename}` });
  } catch (error) {
    res.status(500).json({ error: "failed to download image", details: error.message });
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
    const resetCache = req.body.resetCache === true;

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const tagKeys = extractTags(prompt);
    const tags = await getTags(tagKeys);

    let compiled;

    if (tags.length > 0) {
      const cacheKey = makeCacheKey(prompt, tagLocks, tags);

      if (resetCache) {
        await deleteCached(cacheKey);
        console.log(`[cache reset] ${cacheKey.slice(0, 12)}…`);
      }

      compiled = await getCached(cacheKey);

      if (compiled) {
        console.log(`[cache hit] ${cacheKey.slice(0, 12)}…`);
      } else {
        compiled = await compilePrompt({
          prompt, tags, tagLocks,
          parserOptions: { model: LLM_MODEL },
          visionOptions: { enable: false, force: false, model: VISION_MODEL }
        });
        await setCached(cacheKey, compiled);
      }
    }

    // Upload any raw base64 reference images and get their URLs
    const rawReferenceImages = Array.isArray(req.body.referenceImages) ? req.body.referenceImages : [];
    const rawReferenceUrls = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls : [];

    // Get url referenced images
    // Build a flat list of { url, purpose } for all reference images
    const PURPOSE_DIRECTIVES = {
      composition: {
        singular: "Use image[{n}] as a reference for the overall composition, framing, and subject placement.",
        plural:   "Use image[{n}] as a reference for the overall composition, framing, and placement of all subjects.",
      },
      style: {
        singular: "Use image[{n}] as a reference for the visual style, lighting mood, and color grade.",
        plural:   "Use image[{n}] as a reference for the visual style, lighting mood, and color grade across all subjects.",
      },
      pose: {
        singular: "Use image[{n}] as a reference for the subject's body pose, gesture, and stance.",
        plural:   "Use image[{n}] as a reference for the subjects' body poses, gestures, and stances.",
      },
      scene: {
        singular: "Use image[{n}] as a reference for the background, environment, and setting.",
        plural:   "Use image[{n}] as a reference for the background, environment, and setting shared by all subjects.",
      },
      wardrobe: {
        singular: "Use image[{n}] as a reference for clothing, styling, and accessories.",
        plural:   "Use image[{n}] as a reference for the clothing, styling, and accessories of the subjects.",
      },
      face: {
        singular: "Use image[{n}] as a reference for facial features and appearance.",
        plural:   "Use image[{n}] as a reference for the facial features and appearance of the subjects.",
      },
    };

    // Upload base64 items, keeping purpose alongside
    const uploadedBase64 = await Promise.all(
      rawReferenceImages.map(async (item, i) => {
        const b64 = typeof item === "string" ? item : item.data;
        const purpose = (typeof item === "object" && item.purpose) ? item.purpose : "composition";
        const parsed = parseBase64Image(b64);
        const filename = `ref-${Date.now()}-${i}.${parsed.ext}`;
        const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
        return { url: uploaded.url, purpose };
      })
    );

    // URL items already have a purpose attached
    const uploadedUrlItems = rawReferenceUrls.map(item =>
      typeof item === "string"
        ? { url: item, purpose: "composition" }
        : { url: item.url, purpose: item.purpose || "composition" }
    );

    const allReferenceItems = [...uploadedUrlItems, ...uploadedBase64];
    const uploadedReferenceUrls = allReferenceItems.map(item => item.url);
    
    // Final prompt
    let finalPrompt = compiled.rawPrompt ?? prompt

    // All reference items
    if (allReferenceItems.length > 0) {
      const characterCount = (compiled?.parsedPlan?.characters ?? tags.filter(t => t.type === "character")).length;
      const isPlural = characterCount > 1;
      const baseIndex = (compiled?.images ?? []).length;

      const refDirectives = allReferenceItems.map(({ purpose }, i) => {
        const n = baseIndex + i + 1;
        const entry = PURPOSE_DIRECTIVES[purpose] || PURPOSE_DIRECTIVES.composition;
        const template = isPlural ? entry.plural : entry.singular;
        return template.replace("{n}", n);
      }).join("\n");

      finalPrompt = `${finalPrompt}\n\n${refDirectives}`;
    }

    if (!compiled) compiled = { images: [], rawPrompt: prompt };
    compiled.images.push(...uploadedReferenceUrls);
    compiled.rawPrompt = finalPrompt

    const result = await generateSeedreamEdit({
        images: compiled.images,
        prompt: compiled.rawPrompt,
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
