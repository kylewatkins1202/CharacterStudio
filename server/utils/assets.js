/**
 * utils/assets.js
 *
 * Tag asset URL healing.
 *
 * WaveSpeed CDN URLs expire after some period. When a tag asset's URL is
 * no longer reachable, this module re-uploads the image from the locally
 * saved copy and writes the new URL back to the database.
 *
 * Assets uploaded before local storage was introduced have no localPath
 * and cannot be healed — they are silently removed from the asset array
 * so the rest of the tag still works.
 *
 * Usage:
 *   const { healTagAssets } = require("./utils/assets");
 *   const healedTags = await healTagAssets(tagList);
 */

const fs   = require("fs/promises");
const db   = require("../db");
const { uploadBufferToWaveSpeed } = require("../api/wavespeed");

// Per-session cache of known-good URLs — avoids redundant HEAD checks
// while the server is running.
const verifiedUrls = new Set();

/**
 * Check whether a URL is currently reachable via a HEAD request.
 *
 * Results are cached in `verifiedUrls` for the lifetime of the process
 * so each URL is only checked once per server session.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isUrlReachable(url) {
  // Skip the network check if we already confirmed this URL is good
  if (verifiedUrls.has(url)) return true;
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) {
      // Cache the positive result
      verifiedUrls.add(url);
      return true;
    }
    return false;
  } catch {
    // Network error — treat as unreachable
    return false;
  }
}

/**
 * Attempt to heal a single asset whose CDN URL may have expired.
 *
 * - If the URL is still reachable, the original asset is returned unchanged.
 * - If the URL is stale and the asset has a `localPath`, the file is read
 *   from disk, re-uploaded to WaveSpeed, and the asset is returned with the
 *   new URL.
 * - If the URL is stale and there is no `localPath`, null is returned so the
 *   caller can filter the asset out.
 *
 * @param {object} asset
 * @returns {Promise<object|null>}
 */
async function healAsset(asset) {
  if (!asset?.url) return null;
  // URL is still good — nothing to do
  if (await isUrlReachable(asset.url)) return asset;

  if (!asset.localPath) {
    // No local copy — asset is unrecoverable
    console.warn(`[assets] stale URL with no local copy: ${asset.filename || asset.url}`);
    return null;
  }

  try {
    // Read the locally saved file and re-upload it
    const buffer   = await fs.readFile(asset.localPath);
    const uploaded = await uploadBufferToWaveSpeed(buffer, asset.filename, asset.mimeType);
    // Cache the fresh URL so it isn't re-checked this session
    verifiedUrls.add(uploaded.url);
    console.log(`[assets] re-uploaded ${asset.filename} → ${uploaded.url}`);
    return { ...asset, url: uploaded.url };
  } catch (err) {
    console.warn(`[assets] failed to re-upload ${asset.filename}: ${err.message}`);
    // Return null so the caller can skip this asset gracefully
    return null;
  }
}

/**
 * Heal all assets across a list of tags.
 *
 * For each tag, every asset group is checked concurrently. Any asset whose
 * URL was re-uploaded is replaced with the updated record. If any URLs
 * changed the tag is persisted to the database.
 *
 * Assets that are unrecoverable (stale URL + no local copy) are removed
 * from the group array so compilation can still proceed with the remaining
 * valid assets.
 *
 * @param {object[]} tags
 * @returns {Promise<object[]>} Tags with all reachable (possibly freshly uploaded) asset URLs.
 */
async function healTagAssets(tags) {
  const healed = [];

  for (const tag of tags) {
    const groups    = Object.keys(tag.assets || {});
    const nextAssets = {};
    let changed = false;

    for (const group of groups) {
      const originals = Array.isArray(tag.assets[group]) ? tag.assets[group] : [];
      // Check all assets in this group concurrently
      const fixed = (await Promise.all(originals.map(healAsset))).filter(Boolean);
      nextAssets[group] = fixed;
      // Flag if any URL changed or any asset was removed
      if (
        fixed.length !== originals.length ||
        fixed.some((a, i) => a.url !== originals[i]?.url)
      ) {
        changed = true;
      }
    }

    if (changed) {
      const updatedTag = { ...tag, assets: nextAssets };
      // Persist the updated URLs so future runs don't re-upload unnecessarily
      await db.tags.saveTag(updatedTag);
      console.log(`[assets] healed tag: ${tag.key}`);
      healed.push(updatedTag);
    } else {
      healed.push(tag);
    }
  }

  return healed;
}

module.exports = { healTagAssets };
