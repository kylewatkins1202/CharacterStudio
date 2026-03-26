/**
 * server.js
 *
 * Express entry point — loads environment, configures middleware,
 * mounts the API router, and starts the HTTP server.
 */

const path = require("path");

// In production the .env lives next to the packaged binary; in dev it's at the project root.
const envPath = process.env.NODE_ENV === "production"
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");

// Load environment variables before any other module reads process.env
require("dotenv").config({ path: envPath });
const express = require("express");
const cors = require("cors");
const db = require("./server/db");
const { setApiKey } = require("./server/api/wavespeed");

const app = express();
// Default port is 4989; can be overridden via PORT env var
const PORT = Number(process.env.PORT || 4989);
// Allow large payloads — base64 images can be several MB each
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "100mb";

// Allow requests from the Vite dev server, CRA dev server, and the API itself
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", `http://localhost:${PORT}`],
  credentials: true
}));
// Parse JSON bodies up to the configured limit
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// ─── Mount & start ─────────────────────────────────────────────────────────────

// All API routes live under /api
app.use("/api", require("./server/routes"));

// Initialize data directories and seed JSON files before accepting connections
db.setupDb()
  .then(async () => {
    // Load the persisted API key and activate it — falls back to the env var if unset
    const saved = await db.settings.getSettings();
    setApiKey(saved.wavespeedApiKey || process.env.WAVESPEED_API_KEY || "");
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  🎨  Seedream Studio`);
      console.log(`  ➜  API:    http://localhost:${PORT}/api`);
      console.log(`  ➜  Client: http://localhost:5173  (dev)\n`);
    });
  })
  .catch((error) => {
    // A db init failure is unrecoverable — log and exit so the process manager restarts
    console.error("Failed to initialize:", error);
    process.exit(1);
  });
