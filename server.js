require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const { ensureDb, getTag, saveTag, getTags, searchTags, updateTag } = require("./server/db");
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
const LLM_MODEL = "google/gemini-2.5-flash";
const VISION_MODEL = "google/gemini-2.5-flash";
app.use(express.json({ limit: JSON_BODY_LIMIT }));

function makeBasicDescription(type, key) {
  if (type === "location") {
    return key.replace(/[-_]/g, " ");
  }

  if (type === "prop") {
    return key.replace(/[-_]/g, " ");
  }

  if (type === "outfit") {
    return key.replace(/[-_]/g, " ");
  }

  return "";
}

function mergeTagLockDescriptions(tag, body) {
  const nextLock = { ...(tag.lock || {}) };

  if (typeof body.basicDescription === "string") {
    nextLock.basicDescription = body.basicDescription.trim();
  }

  if (typeof body.appearanceDescription === "string") {
    nextLock.appearanceDescription = body.appearanceDescription.trim();
  }

  if (typeof body.bodyDescription === "string") {
    nextLock.bodyDescription = body.bodyDescription.trim();
  }

  if (!nextLock.basicDescription && tag.type !== "character") {
    nextLock.basicDescription = makeBasicDescription(tag.type, tag.key);
  }

  return nextLock;
}

/**
 * Remove local-only buffer fields from returned tag assets.
 *
 * @param {any} tag
 * @returns {any}
 */
function serializeTag(tag) {
  if (!tag) return null;

  return {
    ...tag,
    assets: Object.fromEntries(
      Object.entries(tag.assets || {}).map(([group, items]) => [
        group,
        Array.isArray(items)
          ? items.map(({ buffer, ...rest }) => rest)
          : []
      ])
    )
  };
}

/**
 * Build a normalized stored asset record.
 *
 * @param {{
 *   uploaded: { url: string },
 *   filename: string,
 *   mimeType: string,
 *   buffer: Buffer,
 *   source?: string
 * }} params
 * @returns {{
 *   id: string,
 *   url: string,
 *   filename: string,
 *   mimeType: string,
 *   source: string,
 *   buffer: Buffer
 * }}
 */
function createStoredAsset({ uploaded, filename, mimeType, buffer, source = "base64" }) {
  return {
    id: crypto.randomUUID(),
    url: uploaded.url,
    filename,
    mimeType,
    source,
    buffer
  };
}

app.get("/health", async (req, res) => {
  res.json({ ok: true });
});

app.post("/tag", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.body.key);
    const type = String(req.body.type || "").trim().toLowerCase();

    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }

    if (!TAG_TYPES.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${TAG_TYPES.join(", ")}`
      });
    }

    const existingTag = await getTag(key);
    const tag = buildTagRecord({ key, type, existingTag });

    for (const group of ASSET_GROUPS) {
      const rawImages = Array.isArray(req.body[group]) ? req.body[group] : [];

      for (let index = 0; index < rawImages.length; index += 1) {
        const parsed = parseBase64Image(rawImages[index]);
        const filename = `${key}-${group}-${Date.now()}-${index}.${parsed.ext}`;

        const uploaded = await uploadBufferToWaveSpeed(
          parsed.buffer,
          filename,
          parsed.mimeType
        );

        tag.assets[group].push(
          createStoredAsset({
            uploaded,
            filename,
            mimeType: parsed.mimeType,
            buffer: parsed.buffer,
            source: "base64"
          })
        );
      }
    }

    tag.meta = tag.meta || {};
    const now = new Date().toISOString();
    if (!tag.meta.createdAt) {
      tag.meta.createdAt = now;
    }
    tag.meta.updatedAt = now;

    await saveTag(tag);

    res.json({
      ok: true,
      tag: serializeTag(tag)
    });
  } catch (error) {
    res.status(500).json({
      error: "failed to create/update tag",
      details: error.message
    });
  }
});

/**
 * GET /tags
 *
 * Query params:
 * - key: partial key search
 *
 * Examples:
 * - GET /tags
 * - GET /tags?key=ri
 */
app.get("/tags", async (req, res) => {
  try {
    const keyQuery = String(req.query.key || "").trim();
    const tags = await searchTags(keyQuery);

    res.json({
      ok: true,
      count: tags.length,
      tags: tags.map(serializeTag)
    });
  } catch (error) {
    res.status(500).json({
      error: "failed to fetch tags",
      details: error.message
    });
  }
});

/**
 * GET /tags/:key
 *
 * Returns one exact tag by key.
 */
app.get("/tags/:key", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    const tag = await getTag(key);

    if (!tag) {
      return res.status(404).json({
        error: `tag not found: ${key}`
      });
    }

    res.json({
      ok: true,
      tag: serializeTag(tag)
    });
  } catch (error) {
    res.status(500).json({
      error: "failed to fetch tag",
      details: error.message
    });
  }
});

/**
 * POST /tags/:key/images
 *
 * Add images to an existing tag.
 *
 * Body example:
 * {
 *   "face": ["data:image/jpeg;base64,..."],
 *   "body": ["data:image/jpeg;base64,..."]
 * }
 */
app.post("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    const existingTag = await getTag(key);

    if (!existingTag) {
      return res.status(404).json({
        error: `tag not found: ${key}`
      });
    }

    const updated = await updateTag(key, async (tag) => {
      for (const group of ASSET_GROUPS) {
        const rawImages = Array.isArray(req.body[group]) ? req.body[group] : [];

        for (let index = 0; index < rawImages.length; index += 1) {
          const parsed = parseBase64Image(rawImages[index]);
          const filename = `${key}-${group}-${Date.now()}-${index}.${parsed.ext}`;

          const uploaded = await uploadBufferToWaveSpeed(
            parsed.buffer,
            filename,
            parsed.mimeType
          );

          tag.assets[group].push(
            createStoredAsset({
              uploaded,
              filename,
              mimeType: parsed.mimeType,
              buffer: parsed.buffer,
              source: "base64"
            })
          );
        }
      }

      tag.meta = tag.meta || {};
      tag.meta.updatedAt = new Date().toISOString();

      return tag;
    });

    res.json({
      ok: true,
      tag: serializeTag(updated)
    });
  } catch (error) {
    res.status(500).json({
      error: "failed to add images to tag",
      details: error.message
    });
  }
});

/**
 * DELETE /tags/:key/images
 *
 * Delete specific images from an existing tag by asset id.
 *
 * Body example:
 * {
 *   "face": ["asset-id-1", "asset-id-2"],
 *   "body": ["asset-id-3"]
 * }
 */
app.delete("/tags/:key/images", async (req, res) => {
  try {
    const key = sanitizeTagKey(req.params.key);
    const existingTag = await getTag(key);

    if (!existingTag) {
      return res.status(404).json({
        error: `tag not found: ${key}`
      });
    }

    const deleted = {};
    let totalDeleted = 0;

    const updated = await updateTag(key, async (tag) => {
      for (const group of ASSET_GROUPS) {
        const idsToDelete = new Set(
          Array.isArray(req.body[group])
            ? req.body[group].map((id) => String(id))
            : []
        );

        if (!idsToDelete.size) {
          continue;
        }

        const before = Array.isArray(tag.assets[group]) ? tag.assets[group] : [];
        const after = before.filter(
          (asset) => !idsToDelete.has(String(asset.id || ""))
        );

        const removedCount = before.length - after.length;

        if (removedCount > 0) {
          deleted[group] = removedCount;
          totalDeleted += removedCount;
        }

        tag.assets[group] = after;
      }

      tag.meta = tag.meta || {};
      tag.meta.updatedAt = new Date().toISOString();

      return tag;
    });

    res.json({
      ok: true,
      totalDeleted,
      deleted,
      tag: serializeTag(updated)
    });
  } catch (error) {
    res.status(500).json({
      error: "failed to delete images from tag",
      details: error.message
    });
  }
});

app.post("/compile", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "");
    const tagLocks = req.body.tagLocks || {};

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const tagKeys = extractTags(prompt);
    const tags = await getTags(tagKeys);

    const compiled = await compilePrompt({
        prompt: prompt,
        tags: tags,
        tagLocks: tagLocks,
        parserOptions: {
            model: LLM_MODEL
        },
        visionOptions: {
            enable: true,   // or false if you only want manual lock descriptions
            force: false,
            model: VISION_MODEL
        }
    });

    res.json({
        ok: true,
        compiled
    });
  } 
  catch (error) {
    res.status(500).json({
      error: "failed to compile prompt",
      details: error.message
    });
  }
});

app.post("/generate", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "");
    const size = req.body.size;
    const tagLocks = req.body.tagLocks || {};
    const enableSyncMode = req.body.enable_sync_mode !== false;
    const enableBase64Output = req.body.enable_base64_output === true;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const tagKeys = extractTags(prompt);
    const tags = await getTags(tagKeys);

    const compiled = await compilePrompt({
        prompt: prompt,
        tags: tags,
        tagLocks: tagLocks,
        parserOptions: {
            model: LLM_MODEL
        },
        visionOptions: {
            enable: true,   // or false if you only want manual lock descriptions
            force: false,
            model: VISION_MODEL
        }
    });

    const result = await generateSeedreamEdit({
      images: compiled.images,
      prompt: compiled.rawPrompt,
      size,
      enableSyncMode,
      enableBase64Output
    });

    res.json({
      ok: true,
      compiled,
      wavespeed: result
    });
  } catch (error) {
    res.status(500).json({
      error: "generation failed",
      details: error.response?.data || error.message
    });
  }
});

ensureDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  });