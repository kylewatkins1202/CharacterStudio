/**
 * routes/compile.js
 *
 * Compile route:
 *   POST /compile
 */

const express = require("express");
const db = require("../db");
const { extractTags, compilePrompt } = require("../utils/tagCompiler");

const router = express.Router();

const LLM_MODEL    = process.env.LLM_MODEL    || "google/gemini-2.5-flash";
const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

router.post("/compile", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "");
    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const tagKeys = extractTags(prompt);
    const tagList = await db.tags.getTags(tagKeys);

    const compiled = await compilePrompt({
      prompt, tags: tagList,
      tagLocks: req.body.tagLocks || {},
      parserOptions: { model: LLM_MODEL },
      visionOptions: { enable: true, force: false, model: VISION_MODEL }
    });

    res.json({ ok: true, compiled });
  } catch (error) {
    res.status(500).json({ error: "failed to compile prompt", details: error.message });
  }
});

module.exports = router;
