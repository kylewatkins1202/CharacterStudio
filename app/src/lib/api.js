/**
 * lib/api.js
 *
 * Thin fetch wrapper used across all components.
 * All methods return the parsed JSON body directly.
 *
 * The POST method applies a 5-minute abort timeout to guard against
 * long-running generation requests hanging indefinitely.
 */

const API_BASE = "/api";
const TIMEOUT_MS = 5 * 60 * 1000;

export const api = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    return r.json();
  },

  async post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return r.json();
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Request timed out after 5 minutes");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  async put(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  },

  async patch(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  },

  async delete(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return r.json();
  },
};

/**
 * Read a File object and resolve with its base64 data-URI string.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export const toBase64 = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
