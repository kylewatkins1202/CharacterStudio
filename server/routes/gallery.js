/**
 * routes/gallery.js
 *
 * Gallery routes:
 *   GET    /gallery
 *   DELETE /gallery/:id
 *   PATCH  /gallery/:id
 *   POST   /gallery/:id/download
 */

const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/gallery", async (req, res) => {
  try {
    const entries = await db.gallery.getGalleryEntries();
    res.json({ ok: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch gallery", details: error.message });
  }
});

router.delete("/gallery/:id", async (req, res) => {
  try {
    const deleted = await db.gallery.deleteGalleryEntry(req.params.id);
    if (!deleted) return res.status(404).json({ error: `entry not found: ${req.params.id}` });
    res.json({ ok: true, deleted: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "failed to delete gallery entry", details: error.message });
  }
});

router.patch("/gallery/:id", async (req, res) => {
  try {
    const data = await db.gallery.read();
    const idx = data.entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: `entry not found: ${req.params.id}` });

    // Only allow patching safe fields
    const allowedFields = ["hidden"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data.entries[idx][field] = req.body[field];
      }
    }

    await db.gallery.write(data);
    res.json({ ok: true, entry: data.entries[idx] });
  } catch (error) {
    res.status(500).json({ error: "failed to update gallery entry", details: error.message });
  }
});

router.post("/gallery/:id/download", async (req, res) => {
  try {
    const entries = await db.gallery.getGalleryEntries();
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
    const localPath = path.join(db.DOWNLOADS_DIR, filename);

    // Write to disk
    await fs.writeFile(localPath, buffer);

    // Update the gallery entry with the local path
    const data = await db.gallery.read();
    const idx = data.entries.findIndex((e) => e.id === req.params.id);
    if (idx !== -1) {
      data.entries[idx].localPath = localPath;
      data.entries[idx].localUrl = `/api/downloads/${filename}`;
      await db.gallery.write(data);
    }

    res.json({ ok: true, localUrl: `/api/downloads/${filename}` });
  } catch (error) {
    res.status(500).json({ error: "failed to download image", details: error.message });
  }
});

module.exports = router;
