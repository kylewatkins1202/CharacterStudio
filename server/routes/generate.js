/**
 * routes/generate.js
 *
 * Generate route:
 *   POST /generate
 */

const crypto = require("crypto");
const express = require("express");
const db = require("../db");
const { uploadBufferToWaveSpeed, generateSeedreamEdit } = require("../wavespeed");
const { parseBase64Image } = require("../imageCollage");
const { extractTags, compilePrompt } = require("../tagCompiler");

const router = express.Router();

const LLM_MODEL    = process.env.LLM_MODEL    || "google/gemini-2.5-flash";
const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COST_PER_MEGAPIXEL = 0.06;

/**
 * Estimate generation cost from a "WxH" size string.
 *
 * @param {string} sizeStr - e.g. "1024*1024"
 * @returns {string|null} Fixed-precision cost string, or null if unparseable.
 */
function estimateCost(sizeStr) {
  if (!sizeStr) return null;
  const [w, h] = sizeStr.split("*").map(Number);
  if (!w || !h) return null;
  return ((w * h) / 1_000_000 * COST_PER_MEGAPIXEL).toFixed(4);
}

/**
 * Extract a single image URL from a variety of WaveSpeed result shapes.
 *
 * @param {object} result
 * @returns {string|null}
 */
function extractImageUrlFromResult(result) {
  if (!result) return null;
  const d = result?.data || result;
  return d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
    result?.outputs?.[0] || result?.images?.[0] || result?.image_url || result?.url || null;
}

// Purpose directives injected into the final prompt for each reference image.
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

// ─── Route ───────────────────────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  try {
    const prompt            = String(req.body.prompt || "");
    const size              = req.body.size;
    const tagLocks          = req.body.tagLocks || {};
    const enableSyncMode    = req.body.enable_sync_mode !== false;
    const enableBase64Output = req.body.enable_base64_output === true;
    const resetCache        = req.body.resetCache === true;

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const tagKeys = extractTags(prompt);
    const tagList = await db.tags.getTags(tagKeys);

    let compiled;

    if (tagList.length > 0) {
      const cacheKey = db.cache.makeCacheKey(prompt, tagLocks, tagList);

      if (resetCache) {
        await db.cache.deleteCached(cacheKey);
        console.log(`[cache reset] ${cacheKey.slice(0, 12)}…`);
      }

      compiled = await db.cache.getCached(cacheKey);

      if (compiled) {
        console.log(`[cache hit] ${cacheKey.slice(0, 12)}…`);
      } else {
        compiled = await compilePrompt({
          prompt, tags: tagList, tagLocks,
          parserOptions: { model: LLM_MODEL },
          visionOptions: { enable: false, force: false, model: VISION_MODEL }
        });
        await db.cache.setCached(cacheKey, compiled);
      }
    }

    // Collect raw base64 and URL reference images from the request
    const rawReferenceImages = Array.isArray(req.body.referenceImages) ? req.body.referenceImages : [];
    const rawReferenceUrls   = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls : [];

    // Upload base64 items, keeping their purpose alongside the URL
    const uploadedBase64 = await Promise.all(
      rawReferenceImages.map(async (item, i) => {
        const b64     = typeof item === "string" ? item : item.data;
        const purpose = (typeof item === "object" && item.purpose) ? item.purpose : "composition";
        const parsed  = parseBase64Image(b64);
        const filename = `ref-${Date.now()}-${i}.${parsed.ext}`;
        const uploaded = await uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
        return { url: uploaded.url, purpose };
      })
    );

    // Normalise URL items to { url, purpose }
    const uploadedUrlItems = rawReferenceUrls.map(item =>
      typeof item === "string"
        ? { url: item, purpose: "composition" }
        : { url: item.url, purpose: item.purpose || "composition" }
    );

    const allReferenceItems    = [...uploadedUrlItems, ...uploadedBase64];
    const uploadedReferenceUrls = allReferenceItems.map(item => item.url);

    let finalPrompt = compiled?.rawPrompt ?? prompt;

    // Append per-image purpose directives to the final prompt
    if (allReferenceItems.length > 0) {
      const characterCount = (compiled?.parsedPlan?.characters ?? tagList.filter(t => t.type === "character")).length;
      const isPlural  = characterCount > 1;
      const baseIndex = (compiled?.images ?? []).length;

      const refDirectives = allReferenceItems.map(({ purpose }, i) => {
        const n        = baseIndex + i + 1;
        const entry    = PURPOSE_DIRECTIVES[purpose] || PURPOSE_DIRECTIVES.composition;
        const template = isPlural ? entry.plural : entry.singular;
        return template.replace("{n}", n);
      }).join("\n");

      finalPrompt = `${finalPrompt}\n\n${refDirectives}`;
    }

    if (!compiled) compiled = { images: [], rawPrompt: prompt };
    compiled.images.push(...uploadedReferenceUrls);
    compiled.rawPrompt = finalPrompt;

    const result = await generateSeedreamEdit({
      images:             compiled.images,
      prompt:             compiled.rawPrompt,
      size,
      enableSyncMode,
      enableBase64Output
    });

    // Persist to gallery
    const imageUrl = extractImageUrlFromResult(result);
    if (imageUrl) {
      await db.gallery.saveGalleryEntry({
        id:                  crypto.randomUUID(),
        imageUrl,
        userPrompt:          prompt,
        compiledPrompt:      compiled?.rawPrompt || null,
        compiledImages:      compiled?.images || [],
        referenceImageUrls:  uploadedReferenceUrls,
        size:                size || null,
        cost:                estimateCost(size),
        timestamp:           new Date().toISOString(),
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

module.exports = router;
