/**
 * routes/generate.js
 *
 * Generate route:
 *   POST /generate
 *
 * Fire-and-forget pattern:
 *   1. Parse inputs, compile tags, resolve reference images (synchronous — fast)
 *   2. Create a loading gallery entry and respond immediately
 *   3. Run the actual generation (WaveSpeed / ComfyUI) in a background IIFE
 *   4. On completion emit an SSE gallery:update event so the frontend updates live
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
const { parseBase64Image, filePathToDataUri, detectStringType } = require("../utils/imageCollage");
const { extractTags, compilePrompt } = require("../utils/tagCompiler");
const { healTagAssets, healReferenceItems, healAsset, saveToFolder } = require("../utils/assets");
const emitter = require("../utils/sseEmitter");
const { activeJobs } = require("./events");
const { populateEntry } = require("./gallery");
const fs      = require("fs/promises");
const resolveReferenceImages = require("../utils/assetResolve");

const router = express.Router();

const LLM_MODEL    = process.env.LLM_MODEL    || "google/gemini-2.5-flash";
const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COST_PER_MEGAPIXEL = 0.06;

/**
 * Skips LLM compilation — replaces @tags directly with image[n] references.
 * Single image → "image[n]", multiple images → "image[n - m]".
 */
function buildRawCompiled(prompt, tagList) {
  const images = [];
  let rawPrompt = prompt;

  for (const tag of tagList) {
    const { assets = {} } = tag;
    const tagImages = [
      ...(assets.face     || []),
      ...(assets.body     || []),
      ...(assets.prop     || []),
      ...(assets.outfit   || []),
      ...(assets.location || []),
    ].map((a) => a.localPath).filter(Boolean);

    if (tagImages.length === 0) continue;

    const startIdx = images.length;
    images.push(...tagImages);
    const endIdx = images.length - 1;

    const ref = tagImages.length === 1
      ? `image[${startIdx}]`
      : `image[${startIdx} - ${endIdx}]`;

    rawPrompt = rawPrompt.replace(new RegExp(`@${tag.key}\\b`, "gi"), ref);
  }

  return { rawPrompt, images };
}

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
  none: {
    singular: "",
    plural:   "",
  },
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

// ─── Cost estimation route ────────────────────────────────────────────────────

/**
 * POST /generate/image/cost
 *
 * Returns the estimated cost for a generation without actually generating.
 * Compiles tags (or uses cache) to determine the number of images, then calls
 * the WaveSpeed pricing endpoint. Falls back to the static model cost on error.
 */
router.post("/image/cost", async (req, res) => {
  try {
    const prompt    = String(req.body.prompt || "");
    const model     = req.body.model || "seedream";
    const tagLocks  = req.body.tagLocks || {};
    const size      = req.body.modelParams?.size;
    const aspectRatio = req.body.modelParams?.aspect_ratio;
    const resolution  = req.body.modelParams?.resolution || "1k";

    const modelDef = wavespeed.MODELS[model];
    if (!modelDef) return res.status(400).json({ error: `Unknown model: ${model}` });

    // Compile tags (or use cache) to discover how many images will be sent
    let imageUrls = [];
    let cached = false;
    if (prompt) {
      const tagKeys = extractTags(prompt);
      const tagList = tagKeys.length ? await healTagAssets(await db.tags.getTags(tagKeys)) : [];
      if (tagList.length > 0) {
        const cacheKey = db.cache.makeCacheKey(prompt, tagLocks, tagList);
        const hit = await db.cache.getCached(cacheKey);
        if (hit) {
          imageUrls = hit.images || [];
          cached = true;
        }
      }
    }

    // Determine which modelId to price (edit if images present, text-to-image otherwise)
    const useEdit = imageUrls.length > 0;
    const modelId = useEdit ? (modelDef.editModelId || modelDef.modelId) : modelDef.modelId;

    // Build inputs for the pricing call
    const inputs = { prompt };
    if (useEdit) inputs.images = imageUrls;
    const schemas = wavespeed.getModelSchemas();
    if (schemas?.[model]?.aspectRatios) {
      if (aspectRatio) inputs.aspect_ratio = aspectRatio;
      inputs.resolution = resolution;
    } else {
      if (size) inputs.size = size;
    }

    let unitPrice, currency;
    try {
      const pricing = await wavespeed.getModelPricing(modelId, inputs);
      unitPrice = pricing.unitPrice + (cached ? 0 : 0.001);
      currency  = pricing.currency;
    } catch {
      // Pricing API unavailable — fall back to static cost
      unitPrice = parseFloat(modelDef.cost) + (cached ? 0 : 0.001);
      currency  = "USD";
    }

    res.json({ ok: true, unitPrice, currency, cached });
  } catch (error) {
    res.status(500).json({ error: "cost estimation failed", details: error.message });
  }
});

// ─── Generate route ───────────────────────────────────────────────────────────

router.post("/image", async (req, res) => {
  try {
    const prompt             = String(req.body.prompt || "");
    const negPrompt          = String(req.body.negPrompt || "");
    const tagLocks           = req.body.tagLocks || {};
    const enableSyncMode     = req.body.enable_sync_mode !== false;
    const enableBase64Output = req.body.enable_base64_output === true;
    const resetCache         = req.body.resetCache === true;
    const useRawPrompt       = req.body.useRawPrompt === true;
    const mode               = req.body.mode
    const model              = req.body.model
    const size               = req.body.modelParams?.size;
    const resolution         = req.body.modelParams?.resolution || "1k"
    const aspectRatio        = req.body.modelParams?.aspect_ratio || null
    const modelParams        = req.body.modelParams || {}
    const loras              = req.body.loras
    const steps              = req.body.steps
    const cfg                = req.body.cfg
    const denoise            = req.body.denoise
    const scheduler          = req.body.scheduler
    const sampler            = req.body.sampler
    const refernceImages     = req.body.refernceImages

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    // ── Tag compilation ────────────────────────────────────────────────────
    // Get tag keys
    const tagKeys = extractTags(prompt);
    let didCompile = false
    const useVision = false
    let compiled

    // Tag list to populate
    let tagList = []

    // In wavespeed mode
    if (mode === 'wavespeed') {
      // healTagAssets takes raw DB tags (assetIds format), heals + populates them
      tagList = await healTagAssets(await db.tags.getTags(tagKeys));

      // If tag list is not empty
      if (tagList.length > 0) {
        // If use raw prompt is true
        if (useRawPrompt) {
          // Skip LLM — replace @tags with image[n] references directly
          compiled = buildRawCompiled(prompt, tagList);
        } else {
          const cacheKey = db.cache.makeCacheKey(prompt, tagLocks, tagList);

          // Reset cache
          if (resetCache) {
            await db.cache.deleteCached(cacheKey);
            console.log(`[cache reset] ${cacheKey.slice(0, 12)}…`);
          }

          // Check for compile cache
          compiled = await db.cache.getCached(cacheKey);

          if (compiled) {
            console.log(`[cache hit] ${cacheKey.slice(0, 12)}…`);
          } else {
            compiled = await compilePrompt({
              prompt, tags: tagList, tagLocks,
              parserOptions: { model: LLM_MODEL },
              visionOptions: { enable: useVision, force: false, model: VISION_MODEL }
            });
            didCompile = true
            await db.cache.setCached(cacheKey, compiled);
          }
        }
      }
    }

    // ── Reference images ───────────────────────────────────────────────────
    // Resolve all reference images
    const allReferenceItems     = await resolveReferenceImages(refernceImages)
    
    // Store { id, purpose } so the gallery can restore generation-time purposes.
    const referenceAssetIds     = allReferenceItems
      .filter((i) => i.id)
      .map((i) => ({ id: i.id, purpose: i.purpose ?? "" }));
    
    // Get uploaded urls
    const uploadedReferenceUrls = allReferenceItems.map((i) => i.url || i?.data);
    
    // ── Prompt assembly ────────────────────────────────────────────────────
    let finalPrompt = compiled?.rawPrompt ?? prompt;

    // If in wavespeed mode and there are reference items
    if (mode === 'wavespeed' && allReferenceItems.length > 0) {
      // Get character count
      const characterCount = (compiled?.parsedPlan?.characters ?? tagList.filter((t) => t.type === "character")).length;
      
      // Get if plural should be true or not
      const isPlural  = characterCount > 1;

      // Base index
      const baseIndex = (compiled?.images ?? []).length;

      // Get ref derivativs and join
      const refDirectives = allReferenceItems.map(({ purpose }, i) => {
        if (purpose === '') return ''
        const n        = baseIndex + i + 1;
        const entry    = PURPOSE_DIRECTIVES[purpose] || PURPOSE_DIRECTIVES.composition;
        const template = isPlural ? entry.plural : entry.singular;
        return template.replace("{n}", n);
      }).join("\n");

      // Create final prompt
      finalPrompt = `${finalPrompt}\n\n${refDirectives}`;
    }

    // If not compiled
    if (!compiled) compiled = { images: [], rawPrompt: prompt };

    // Add images to compiled photo
    compiled.images.push(...uploadedReferenceUrls);
    compiled.rawPrompt = finalPrompt;

    // For each compiled prompt image
    for (let i = 0; i < compiled.images.length; i++) {
      // If is a data value, continue
      if (compiled.images[i].startsWith('data')) continue
      
      // Get string type
      let type = detectStringType(compiled.images[i])
      
      // If string type is file path
      if (type === 'filepath') {
        // Get base64String
        const base64String = await filePathToDataUri(compiled.images[i])
        
        // Replace local path with base64 string
        compiled.images[i] = base64String
      }
    }

    // If compile raw failed
    if (!compiled.rawPrompt) {
      throw 'Error with raw prompt'
    }

    // ── Create loading gallery entry & respond ─────────────────────────────
    const entryId = crypto.randomUUID();
    const loadingEntry = {
      id:               entryId,
      loading:          true,
      userPrompt:       prompt,
      compiledPrompt:   compiled.rawPrompt || null,
      compiledImages:   compiled.images    || [],
      referenceAssetIds,
      size:             size || null,
      mode,
      model,
      modelParams,
      negPrompt,
      useRawPrompt:     useRawPrompt || false,
      timestamp:        new Date().toISOString(),
    };

    await db.gallery.saveGalleryEntry(loadingEntry);
    activeJobs.set(entryId, loadingEntry);
    emitter.emit("gallery:new", loadingEntry);

    // Respond immediately — the generate button re-enables now
    res.json({ ok: true, entryId, loading: true });

    // ── Background generation ──────────────────────────────────────────────
    // Everything below runs after the response has been sent.
    (async () => {
      try {
        let result, imageUrl;

        if (mode === "wavespeed") {
          // Generate and poll seedream edit
          result = await wavespeed.generateSeedreamEdit({
            model,
            images:             compiled.images,
            prompt:             compiled.rawPrompt,
            size:              modelParams?.size ?? size,
            aspect_ratio:       modelParams?.aspect_ratio ?? aspectRatio,
            resolution:      modelParams?.resolution ?? resolution,
            extraParams:        modelParams,
            enableSyncMode:     false,
            enableBase64Output,
          });

          // If failed throw error
          if (result.data?.status === "failed") {
            throw new Error(`WaveSpeed generation failed: ${result.data?.error || "unknown error"}`);
          }

          // Extract image url from result
          imageUrl = extractImageUrlFromResult(result);
        } else {
          // Generate comfy ui image an poll
          result = await comfyui.generateComfyImage({
            images:    compiled.images,
            prompt:    compiled.rawPrompt,
            negPrompt,
            size,
            model:     model     || "DarkBeast",
            loras:     loras     || [],
            steps:     steps     != null ? steps     : 4,
            cfg:       cfg       != null ? cfg       : 1.5,
            denoise:   denoise   != null ? denoise   : 0.9,
            scheduler: scheduler || "sgm_uniform",
            sampler:   sampler   || "euler",
          });

          // Extract image from result
          imageUrl = extractImageUrlFromResult(result);
        }

        // ── Persist generated image as an asset ──────────────────────────
        let imageAssetId = null;

        // If image url is valid
        if (imageUrl) {
          try {
            // Fetch image from url
            const imgRes = await fetch(imageUrl);
            
            // If valid, save image locally and update database
            if (imgRes.ok) {
              const buffer      = Buffer.from(await imgRes.arrayBuffer());
              const contentType = imgRes.headers.get("content-type") || "image/jpeg";
              const ext         = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
              const uuid = crypto.randomUUID()
              const filename    = `generated-${uuid}.${ext}`;
              const { localPath, assetPath } = await saveToFolder("generated", filename, buffer);
              const imageAsset = await db.assets.createAsset({
                id:        uuid,
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

        // ── Update gallery entry with final data ─────────────────────────
        const cost = mode === 'local' ? 0 : estimateCost(model, { usedLLM: didCompile, useVision });
        const patch = {
          loading:        false,
          imageAssetId,
          cost,
          cfg,
          steps,
          denoise,
          loras,
          scheduler,
          sampler
        };

        const updated = await db.gallery.updateGalleryEntry(entryId, patch);
        activeJobs.delete(entryId);

        if (updated) {
          const populated = await populateEntry(updated);
          // Include the known CDN URL as a fallback in case the asset hasn't
          // been written to the DB cache yet when populateEntry runs.
          emitter.emit("gallery:update", {
            ...populated,
            imageUrl: populated.imageUrl || imageUrl,
          });
        }

      } catch (bgErr) {
        console.error("[generate bg]", bgErr.message);
        const errPatch = { loading: false, error: bgErr.message };
        const updated  = await db.gallery.updateGalleryEntry(entryId, errPatch);
        activeJobs.delete(entryId);
        if (updated) emitter.emit("gallery:update", updated);
        
      }
    })();

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
        const { localPath, assetPath } = await saveToFolder("upscaled", filename, buffer);

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
