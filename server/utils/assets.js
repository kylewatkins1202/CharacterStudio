/**
 * utils/assets.js
 *
 * Asset storage and URL healing.
 *
 * All healing now operates on the assets DB (db.assets) rather than on the
 * tags or a special _refs tag. Tags reference assets by ID, so healing a URL
 * only requires updating the asset record — no tag writes needed.
 *
 * The assets DB stores only metadata (id, url, localPath, filename, etc.).
 * Binary image files live in ASSETS_DIR on disk; localPath is the pointer.
 *
 * Exports:
 *   saveAssetLocally(tagKey, group, filename, buffer) → localPath
 *   healAsset(asset)                                 → healed asset | null
 *   healTagAssets(populatedTags)                     → healed populated tags
 *   healReferenceItems(items)                        → healed { url, purpose }[]
 */

const fs   = require("fs/promises");
const path = require("path");
const db   = require("../db");
const { uploadBufferToWaveSpeed } = require("../api/wavespeed");

// Per-session cache of known-good URLs — avoids redundant HEAD checks.
const verifiedUrls = new Set();

// ─── URL reachability ─────────────────────────────────────────────────────────

/**
 * Check whether a URL is currently reachable via a HEAD request.
 * Results are cached in `verifiedUrls` for the process lifetime.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isUrlReachable(url) {
  if (verifiedUrls.has(url)) return true;
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) { verifiedUrls.add(url); return true; }
    return false;
  } catch {
    return false;
  }
}

// ─── Local storage ────────────────────────────────────────────────────────────

/**
 * Save an image buffer to the local assets directory on disk.
 * The DB stores only the returned localPath — the binary never enters the DB.
 *
 * Path: ASSETS_DIR/{tagKey}/{group}/{filename}
 *
 * @param {string} tagKey  - Tag key, or a virtual namespace (e.g. "refs")
 * @param {string} group   - Asset group (e.g. "face", "reference")
 * @param {string} filename
 * @param {Buffer} buffer
 * @returns {Promise<string>} Absolute local path to the saved file.
 */
/**
 * Save an image buffer to the local assets directory on disk.
 * Returns both the absolute localPath (for fs reads) and the assetPath
 * (relative to ASSETS_DIR, forward-slash separated) used to build the
 * /api/assets/… fallback URL.
 */
async function saveAssetLocally(tagKey, group, filename, buffer) {
  const dir       = path.join(db.ASSETS_DIR, tagKey, group);
  await fs.mkdir(dir, { recursive: true });
  const localPath = path.join(dir, filename);
  await fs.writeFile(localPath, buffer);
  const assetPath = `${tagKey}/${group}/${filename}`;
  return { localPath, assetPath };
}

// ─── Healing ─────────────────────────────────────────────────────────────────

/**
 * Attempt to heal a single asset whose CDN URL may have expired.
 *
 * - URL still good  → return asset unchanged.
 * - URL stale + localPath → read binary from disk, re-upload to WaveSpeed,
 *                           update only the `url` field in the assets DB,
 *                           return healed asset.
 * - URL stale + no localPath → return null (unrecoverable).
 *
 * @param {object} asset - Full asset record from db.assets.
 * @returns {Promise<object|null>}
 */
async function healAsset(asset) {
  if (!asset?.url) return null;
  if (await isUrlReachable(asset.url)) return asset;

  if (!asset.localPath) {
    console.warn(`[assets] stale URL with no local copy: ${asset.filename || asset.url}`);
    return null;
  }

  try {
    // Read the binary from the local file — not from the DB
    const buffer   = await fs.readFile(asset.localPath);
    const uploaded = await uploadBufferToWaveSpeed(buffer, asset.filename, asset.mimeType);
    verifiedUrls.add(uploaded.url);
    console.log(`[assets] re-uploaded ${asset.filename} → ${uploaded.url}`);

    // Only the URL changes in the assets DB; the file on disk is untouched
    const healed = await db.assets.updateAsset(asset.id, { url: uploaded.url });
    return healed || { ...asset, url: uploaded.url };
  } catch (err) {
    console.warn(`[assets] failed to re-upload ${asset.filename}: ${err.message}`);
    return null;
  }
}

/**
 * Heal all assets across a list of already-populated tags.
 *
 * For each tag, every asset in every group is checked. Stale URLs are
 * re-uploaded from the local file on disk and the assets DB is updated.
 * Unrecoverable assets (no localPath) are dropped from the group so
 * compilation still proceeds with the remaining valid ones.
 *
 * @param {object[]} tags - Tags with `assets` already populated (not assetIds).
 * @returns {Promise<object[]>}
 */
async function healTagAssets(tags) {
  return Promise.all(tags.map(async (tag) => {
    const groups     = Object.keys(tag.assets || {});
    const nextAssets = {};

    for (const group of groups) {
      const originals   = Array.isArray(tag.assets[group]) ? tag.assets[group] : [];
      const fixed       = (await Promise.all(originals.map(healAsset))).filter(Boolean);
      nextAssets[group] = fixed;
    }

    return { ...tag, assets: nextAssets };
  }));
}

/**
 * Heal a list of reference image items `{ url, purpose }` whose WaveSpeed
 * URLs may have expired.
 *
 * For each stale URL, looks up the corresponding asset record in the assets DB
 * by URL to find localPath, reads the binary from disk, re-uploads to
 * WaveSpeed, and updates only the `url` field in the assets DB.
 *
 * @param {Array<{ url: string, purpose: string }>} items
 * @returns {Promise<Array<{ url: string, purpose: string }>>}
 */
async function healReferenceItems(items) {
  if (!items.length) return items;

  return Promise.all(items.map(async (item) => {
    if (await isUrlReachable(item.url)) return item;

    const asset = await db.assets.getAssetByUrl(item.url);
    if (!asset?.localPath) {
      console.warn(`[assets] stale ref URL with no local copy: ${item.url}`);
      return item;
    }

    try {
      // Read binary from disk, not from the DB
      const buffer   = await fs.readFile(asset.localPath);
      const uploaded = await uploadBufferToWaveSpeed(buffer, asset.filename, asset.mimeType);
      verifiedUrls.add(uploaded.url);
      console.log(`[assets] re-uploaded ref ${asset.filename} → ${uploaded.url}`);
      // Only the URL field is updated in the assets DB
      await db.assets.updateAsset(asset.id, { url: uploaded.url });
      return { ...item, url: uploaded.url };
    } catch (err) {
      console.warn(`[assets] failed to re-upload ref: ${err.message}`);
      return item;
    }
  }));
}

module.exports = { saveAssetLocally, healAsset, healTagAssets, healReferenceItems };
