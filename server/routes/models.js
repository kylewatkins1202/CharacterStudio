const express = require("express");
const comfyui = require("../api/comfyui");
const wavespeed = require("../api/wavespeed");
const router = express.Router();

/**
 * GET /models/comfyui/options
 * Returns available model keys and lora keys for the local ComfyUI backend.
 */
router.get("/models/comfyui/options", (req, res) => {
  res.json({
    ok:         true,
    models:     Object.keys(comfyui.MODELS),
    loras:      Object.keys(comfyui.LORAS),
    schedulers: comfyui.SCHEDULERS,
    samplers:   comfyui.SAMPLERS,
  });
});

/**
 * GET /models/wavespeed/options
 * Returns available wavespeed model keys with merged live schema data.
 * Fetches from WaveSpeed API on first call; subsequent calls use the in-memory cache.
 */
router.get("/models/wavespeed/options", async (req, res) => {
  try {
    await wavespeed.fetchAndCacheModelSchemas();
    const schemas = wavespeed.getModelSchemas();
    res.json({ ok: true, models: schemas });
  } catch (err) {
    // Fallback to static data if something went wrong
    res.json({
      ok:     true,
      models: Object.fromEntries(Object.entries(wavespeed.MODELS).map(([k, v]) => [k, {
        name:   v.name,
        cost:   v.cost,
        schema: v.schema || "standard",
        min:    v.min ?? 512,
        max:    v.max ?? 8192,
      }])),
    });
  }
});


module.exports = router;
