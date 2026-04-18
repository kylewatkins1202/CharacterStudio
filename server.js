/**
 * server.js
 *
 * Express entry point — loads environment, configures middleware,
 * mounts the API router, and starts the HTTP server.
 */

const path = require("path");

// In production the .env lives next to the packaged binary; in dev it's at the project root.
const envPath = process.env.NODE_ENV === "production"
  ? path.join(process.env.RESOURCES_PATH || process.resourcesPath, ".env")
  : path.join(__dirname, ".env");

// Load environment variables before any other module reads process.env
require("dotenv").config({ path: envPath });
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
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

// Serve the built React frontend in production
if (process.env.NODE_ENV !== "development") {
  const frontendDist = path.join(__dirname, "app", "dist");
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

// Initialize data directories and seed JSON files before accepting connections
const ready = db.setupDb()
  .then(async () => {
    // Load the persisted API key and activate it — falls back to the env var if unset
    const saved = await db.settings.getSettings();
    setApiKey(saved.wavespeedApiKey || process.env.WAVESPEED_API_KEY || "");
  })
  .then(() => new Promise((resolve) => {
    const httpServer = app.listen(PORT, () => {
      console.log(`\n  🎨  Character Studio`);
      console.log(`  ➜  API:    http://localhost:${PORT}/api`);
      console.log(`  ➜  Client: http://localhost:5173  (dev)\n`);

      // ── WebSocket server for mobile clients ──────────────────────────────
      const { activeJobs } = require("./server/routes/events");
      const emitter = require("./server/utils/sseEmitter");
      const wss = new WebSocketServer({ noServer: true });

      const broadcast = (event, data) => {
        const msg = JSON.stringify({ event, data });
        for (const client of wss.clients) {
          if (client.readyState === 1) client.send(msg);
        }
      };

      emitter.on("gallery:new",    (entry) => broadcast("gallery:new",    entry));
      emitter.on("gallery:update", (entry) => broadcast("gallery:update", entry));

      httpServer.on("upgrade", (req, socket, head) => {
        if (req.url === "/api/ws") {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
            for (const entry of activeJobs.values()) {
              ws.send(JSON.stringify({ event: "gallery:new", data: entry }));
            }
          });
        } else {
          socket.destroy();
        }
      });

      resolve();
    });
  }))
  .catch((error) => {
    // A db init failure is unrecoverable — log and exit so the process manager restarts
    console.error("Failed to initialize:", error);
    process.exit(1);
  });

module.exports = { ready };
