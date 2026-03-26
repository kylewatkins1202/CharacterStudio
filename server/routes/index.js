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

// Health check
router.get("/health", (req, res) => res.json({ ok: true }));

// Route groups
router.use(require("./tags"));
router.use(require("./gallery"));
router.use(require("./generate"));
router.use(require("./compile"));
router.use(require("./settings"));

module.exports = router;
