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
 * GET /models/comfyui/options
 * Returns available model keys and lora keys for the local ComfyUI backend.
 */
router.get("/models/wavespeed/options", (req, res) => {
  res.json({
    ok:         true,
    models:     Object.keys(wavespeed.MODELS),
  });
});


module.exports = router;
