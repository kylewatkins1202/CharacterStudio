/**
 * utils/sseEmitter.js
 *
 * Singleton EventEmitter shared by all server modules for pushing
 * real-time gallery updates to connected SSE clients.
 *
 * Event names:
 *   "gallery:new"    — emitted when a loading entry is created (generation started)
 *   "gallery:update" — emitted when a generation completes or fails
 */

const EventEmitter = require("events");

const emitter = new EventEmitter();
// Allow up to 50 concurrent SSE listeners before Node warns about leaks
emitter.setMaxListeners(50);

module.exports = emitter;
