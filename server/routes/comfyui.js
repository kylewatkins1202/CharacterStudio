const express = require("express");
const { MODELS, LORAS, SCHEDULERS, SAMPLERS } = require("../api/comfyui");

const router = express.Router();

/**
 * GET /comfyui/options
 * Returns available model keys and lora keys for the local ComfyUI backend.
 */
router.get("/comfyui/options", (req, res) => {
  res.json({
    ok:         true,
    models:     Object.keys(MODELS),
    loras:      Object.keys(LORAS),
    schedulers: SCHEDULERS,
    samplers:   SAMPLERS,
  });
});

module.exports = router;
