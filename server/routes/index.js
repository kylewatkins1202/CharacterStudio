/**
 * routes/index.js
 *
 * Assembles the top-level API router and mounts all route groups.
 * Consumed by server.js via:  app.use("/api", require("./server/routes"))
 */

const express = require("express");
const db = require("../db");

const router = express.Router();

// Serve locally downloaded gallery images
router.use("/downloads", express.static(db.DOWNLOADS_DIR));

// Serve locally stored tag and reference assets (fallback when CDN URLs expire)
router.use("/assets", express.static(db.ASSETS_DIR));

// Health check
router.get("/health", (req, res) => res.json({ ok: true }));

// Feature flags
router.get("/config", (req, res) => res.json({
  localGenerationEnabled: process.env.LOCAL_GENERATION === "true",
}));

// Route groups
router.use(require("./assets"));
router.use(require("./tags"));
router.use(require("./comfyui"));
router.use(require("./gallery"));
router.use("/image", require("./generate"));
router.use(require("./compile"));
router.use(require("./settings"));
router.use(require("./models"));

module.exports = router;
