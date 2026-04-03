/**
 * routes/generate.js
 *
 * Generate route:
 *   POST /generate
 *
 * Reference images come in three forms:
 *   referenceAssetIds   — existing asset IDs (picked from asset library)
 *   referenceImages     — base64 uploads (new photos, creates asset records)
 *   referenceImageUrls  — pasted URLs; healed if a matching asset exists, used
 *                         as-is otherwise (no new asset created for bare URLs)
 */

const crypto = require("crypto");
const express = require("express");
const db = require("../db");
const wavespeed = require("../api/wavespeed");
const comfyui = require("../api/comfyui")
const { parseBase64Image } = require("../utils/imageCollage");
const { extractTags, compilePrompt } = require("../utils/tagCompiler");
const { healTagAssets, healReferenceItems, healAsset, saveAssetLocally } = require("../utils/assets");

const router = express.Router();

const LLM_MODEL    = process.env.LLM_MODEL    || "google/gemini-2.5-flash";
const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COST_PER_MEGAPIXEL = 0.06;

function estimateCost(model, {usedLLM = false, useVision = false} = {}) {
  const modelCost = wavespeed.MODELS[model].cost 
  const llmCost = usedLLM ? wavespeed.LLM_MODELS[LLM_MODEL].cost : 0;
  const visionCost = useVision ? wavespeed.LLM_MODELS[VISION_MODEL].cost : 0;

  return parseFloat(modelCost) + parseFloat(llmCost) + parseFloat(visionCost);
}

function extractImageUrlFromResult(result) {
  if (!result) return null;
  const d = result?.data || result;
  return d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
    result?.outputs?.[0] || result?.images?.[0] || result?.image_url || result?.url || null;
}

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
    const prompt             = String(req.body.prompt || "");
    const negPrompt          = String(req.body.negPrompt || "");
    const size               = req.body.size;
    const tagLocks           = req.body.tagLocks || {};
    const enableSyncMode     = req.body.enable_sync_mode !== false;
    const enableBase64Output = req.body.enable_base64_output === true;
    const resetCache         = req.body.resetCache === true;
    const mode               = req.body.mode
    const model              = req.body.model
    const loras              = req.body.loras
    const steps              = req.body.steps
    const cfg                = req.body.cfg
    const denoise            = req.body.denoise
    const scheduler          = req.body.scheduler
    const sampler            = req.body.sampler

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    // ── Tag compilation ────────────────────────────────────────────────────
    let tagList = []

    // Get tag keys
    const tagKeys = extractTags(prompt);
    let didCompile = false
    const useVision = false
    let compiled
    // In wavespeed mode
    if (mode === 'wavespeed') {
      // healTagAssets takes raw DB tags (assetIds format), heals + populates them
      tagList = await healTagAssets(await db.tags.getTags(tagKeys));

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
            visionOptions: { enable: useVision, force: false, model: VISION_MODEL }
          });
          compile = true
          await db.cache.setCached(cacheKey, compiled);
        }
      }
    }

    // ── Reference images ───────────────────────────────────────────────────

    // 1. Existing asset ID refs — resolve and heal
    const rawAssetIdRefs = Array.isArray(req.body.referenceAssetIds) ? req.body.referenceAssetIds : [];
    const assetIdItems = (await Promise.all(
      rawAssetIdRefs.map(async (item) => {
        const assetId = typeof item === "string" ? item : item.id;
        const purpose = (typeof item === "object" && item.purpose) ? item.purpose : "";
        const asset   = await db.assets.getAsset(assetId);
        if (!asset) return null;
        const healed  = await healAsset(asset);
        return healed ? { id: healed.id, url: healed.url, purpose } : null;
      })
    )).filter(Boolean);

    // 2. Base64 uploads — new photos: upload, save locally, create asset record
    const rawReferenceImages = Array.isArray(req.body.referenceImages) ? req.body.referenceImages : [];
    const base64Items = await Promise.all(
      rawReferenceImages.map(async (item, i) => {
        const b64      = typeof item === "string" ? item : item.data;
        const purpose  = (typeof item === "object" && item.purpose) ? item.purpose : "";
        const parsed   = parseBase64Image(b64);
        const filename = `ref-${Date.now()}-${i}.${parsed.ext}`;
        const uploaded = await wavespeed.uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
        const { localPath, assetPath } = await saveAssetLocally("refs", "reference", filename, parsed.buffer);
        const asset = await db.assets.createAsset({
          id:        crypto.randomUUID(),
          url:       uploaded.url,
          localPath,
          assetPath,
          filename,
          mimeType:  parsed.mimeType,
          purpose,
          hidden:    false,
          timestamp: new Date().toISOString(),
        });
        return { id: asset.id, url: uploaded.url, purpose };
      })
    );

    // 3. Pasted URL refs — heal if a known asset, use as-is otherwise (no new asset)
    const rawReferenceUrls = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls : [];
    const rawUrlItems = rawReferenceUrls.map((item) =>
      typeof item === "string"
        ? { url: item, purpose: "" }
        : { url: item.url, purpose: item.purpose }
    );
    const urlItems = await healReferenceItems(rawUrlItems);

    const allReferenceItems     = [...assetIdItems, ...base64Items, ...urlItems];
    // Store { id, purpose } so the gallery can restore generation-time purposes.
    const referenceAssetIds     = allReferenceItems
      .filter((i) => i.id)
      .map((i) => ({ id: i.id, purpose: i.purpose ?? "" }));
    const uploadedReferenceUrls = allReferenceItems.map((i) => i.url);

    // ── Prompt assembly ────────────────────────────────────────────────────
    let finalPrompt = compiled?.rawPrompt ?? prompt;
 
    if (mode === 'wavespeed' && allReferenceItems.length > 0) {
      const characterCount = (compiled?.parsedPlan?.characters ?? tagList.filter((t) => t.type === "character")).length;
      const isPlural  = characterCount > 1;
      const baseIndex = (compiled?.images ?? []).length;

      const refDirectives = allReferenceItems.map(({ purpose }, i) => {
        if (purpose === '') return ''
        const n        = baseIndex + i + 1;
        const entry    = PURPOSE_DIRECTIVES[purpose] || PURPOSE_DIRECTIVES.composition;
        const template = isPlural ? entry.plural : entry.singular;
        return template.  replace("{n}", n);
      }).join("\n");

      finalPrompt = `${finalPrompt}\n\n${refDirectives}`;
    }

    // If not compiled
    if (!compiled)  compiled = { images: [], rawPrompt: prompt };

    // Add images to compiled photo
    compiled.images.push(...uploadedReferenceUrls);
    compiled.rawPrompt = finalPrompt;

    let result, imageUrl;
    // ── Generation ─────────────────────────────────────────────────────────
    if (mode === "wavespeed") {
      result = await wavespeed.generateSeedreamEdit({
        model:              model,
        images:             compiled.images,
        prompt:             compiled.rawPrompt,
        size,
        enableSyncMode,
        enableBase64Output
      });

      imageUrl = extractImageUrlFromResult(result);
    } else {
      let [width, height] = size.split('*')
      result = await comfyui.generateComfyImage({
        images:    compiled.images,
        prompt:    compiled.rawPrompt,
        negPrompt,
        size,
        model:    model   || "DarkBeast",
        loras:    loras   || [],
        steps:    steps   != null ? steps   : 4,
        cfg:       cfg       != null ? cfg       : 1.5,
        denoise:   denoise   != null ? denoise   : 0.9,
        scheduler: scheduler || "sgm_uniform",
        sampler:   sampler   || "euler",
      })

      imageUrl = extractImageUrlFromResult(result)
    }
    // ── Persist generated image as an asset ────────────────────────────────
    // The generated image is a new photo entering the system — save locally and register.
    
    let imageAssetId = null;

    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buffer      = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext         = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
          const filename    = `generated-${Date.now()}.${ext}`;
          const { localPath, assetPath } = await saveAssetLocally("generated", "result", filename, buffer);
          const imageAsset = await db.assets.createAsset({
            id:        crypto.randomUUID(),
            url:       imageUrl,
            localPath,
            assetPath,
            filename,
            mimeType:  contentType,
            hidden:    false,
            timestamp: new Date().toISOString(),
          });
          imageAssetId = imageAsset.id;
        }
      } catch (err) {
        console.warn(`[generate] failed to save generated image locally: ${err.message}`);
      }
    }

    // ── Persist to gallery ─────────────────────────────────────────────────
    if (imageUrl) {
      await db.gallery.saveGalleryEntry({
        id:               crypto.randomUUID(),
        imageAssetId,
        referenceAssetIds,
        userPrompt:       prompt,
        mode:             mode,
        model:            model,
        cfg:              cfg,
        steps:            steps,
        denoise:          denoise,
        loras:            loras,
        negPrompt:        negPrompt,
        compiledPrompt:   compiled?.rawPrompt || null,
        compiledImages:   compiled?.images || [],
        size:             size || null,
        cost:             mode === 'local' ? 0 : estimateCost(model, {usedLLM: didCompile, useVision: useVision}),
        timestamp:        new Date().toISOString(),
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

// ─── Upscale Route ────────────────────────────────────────────────────────────

function extractUpscaleImageUrl(result) {
  const d = result?.data || result;
  return d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
    result?.outputs?.[0] || result?.images?.[0] || result?.image_url || result?.url || null;
}

router.post("/upscale", async (req, res) => {
  try {
    const imageRef = req.body.image; // { assetId?, src?, url?, isUrl? }
    const targetResolution = req.body.targetResolution || "4k";

    if (!imageRef) return res.status(400).json({ error: "image is required" });

    // Resolve image reference to a URL
    let imageUrl;
    if (imageRef.assetId) {
      const asset = await db.assets.getAsset(imageRef.assetId);
      if (!asset) return res.status(400).json({ error: "Asset not found" });
      const healed = await healAsset(asset);
      imageUrl = healed?.url;
    } else if (imageRef.isUrl) {
      imageUrl = imageRef.url || imageRef.src;
    } else if (imageRef.src) {
      // base64 upload
      const parsed = parseBase64Image(imageRef.src);
      const filename = `upscale-input-${Date.now()}.${parsed.ext}`;
      const uploaded = await wavespeed.uploadBufferToWaveSpeed(parsed.buffer, filename, parsed.mimeType);
      imageUrl = uploaded.url;
    }

    if (!imageUrl) return res.status(400).json({ error: "Could not resolve image URL" });

    const result = await wavespeed.upscaleImage({ imageUrl, targetResolution });
    const upscaledUrl = extractUpscaleImageUrl(result);

    if (!upscaledUrl) return res.status(500).json({ error: "Upscale did not return an image URL" });

    // Save locally
    let localUrl = null;
    let imageAssetId = null;
    
    try {
      // Attempt to download the upscaled image and save it locally as an asset for future healing if the Wavespeed URL expires. This is a best-effort attempt; if it fails we still return the upscaled URL.
      const imgRes = await fetch(upscaledUrl);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const filename = `upscaled-${targetResolution}-${Date.now()}.png`;
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const ext         = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
        const { localPath, assetPath } = await saveAssetLocally("upscaled", "upscale", filename, buffer);

        // Create asset
        const imageAsset = await db.assets.createAsset({
            id:        crypto.randomUUID(),
            url:       upscaledUrl,
            localPath,
            assetPath,
            filename,
            mimeType:  contentType,
            hidden:    false,
            timestamp: new Date().toISOString(),
          });
          imageAssetId = imageAsset.id;
        localUrl = `/api/assets/${assetPath}`;
      }
    } catch {}

    res.json({ ok: true, url: upscaledUrl, localUrl });
  } catch (error) {
    res.status(500).json({ error: "Upscale failed", details: error.message });
  }
});

module.exports = router;
