/**
 * routes/events.js
 *
 * Server-Sent Events endpoint:
 *   GET /events
 *
 * Clients subscribe here to receive real-time gallery updates pushed from the
 * server. Two named events are sent:
 *
 *   gallery:new    — a generation has started; payload is the loading entry
 *   gallery:update — a generation completed or failed; payload is the final entry
 *
 * activeJobs is exported so the generate route can add/remove in-flight jobs.
 * New SSE clients receive a replay of all currently in-flight jobs on connect,
 * so a page reload during generation still shows the pending card.
 */

const express = require("express");
const emitter = require("../utils/sseEmitter");

const router = express.Router();

/**
 * Map of entryId → loading entry for all generations currently in progress.
 * Exported so server/routes/generate.js can register and deregister jobs.
 * @type {Map<string, object>}
 */
const activeJobs = new Map();

router.get("/events", (req, res) => {
  // SSE headers
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");  // disable nginx buffering if ever proxied
  res.flushHeaders();

  // Helper: write a named SSE event to this client
  const send = (eventName, data) => {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected mid-write — ignore
    }
  };

  // Replay all currently in-flight jobs so the client sees pending cards
  // immediately (handles page reloads while a generation is running)
  for (const entry of activeJobs.values()) {
    send("gallery:new", entry);
  }

  // Forward future emitter events to this SSE client
  const onNew    = (entry) => send("gallery:new",    entry);
  const onUpdate = (entry) => send("gallery:update", entry);

  emitter.on("gallery:new",    onNew);
  emitter.on("gallery:update", onUpdate);

  // Keep the connection alive — browsers auto-close idle SSE connections
  const keepalive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { /* ignore */ }
  }, 25_000);

  // Clean up when the client disconnects
  req.on("close", () => {
    emitter.off("gallery:new",    onNew);
    emitter.off("gallery:update", onUpdate);
    clearInterval(keepalive);
  });
});

module.exports = { router, activeJobs };
