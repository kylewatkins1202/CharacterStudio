/**
 * utils/assets.js
 *
 * Asset storage and URL healing.
 *
 * - saveAssetLocally   → writes binary to disk, returns { localPath, assetPath }
 * - healAsset(asset)   → checks URL; re-uploads from local if stale; returns healed asset | null
 * - healTagAssets(tags) → takes raw DB tags (assetIds format), fetches + heals assets,
 *                         returns tags with `assets` field populated (ready for compilePrompt)
 * - healReferenceItems(items) → heals [{ url, purpose }] items; creates asset records for
 *                               any URL that has no record yet; returns [{ id, url, purpose }]
 */

const fs   = require("fs/promises");
const path = require("path");
const db   = require("../db");
const { uploadBufferToWaveSpeed } = require("../api/wavespeed");

// Per-session cache of known-good URLs — avoids redundant HEAD checks.
const verifiedUrls = new Set();

// ─── URL reachability ─────────────────────────────────────────────────────────

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
 * - URL stale + localPath → read binary from disk, re-upload, update DB, return healed asset.
 * - URL stale + no localPath → return null (unrecoverable).
 */
async function healAsset(asset) {
  if (!asset?.url) return null;
  if (await isUrlReachable(asset.url)) return asset;

  if (!asset.localPath) {
    console.warn(`[assets] stale URL with no local copy: ${asset.filename || asset.url}`);
    return null;
  }

  try {
    const buffer   = await fs.readFile(asset.localPath);
    const uploaded = await uploadBufferToWaveSpeed(buffer, asset.filename, asset.mimeType);
    verifiedUrls.add(uploaded.url);
    console.log(`[assets] re-uploaded ${asset.filename} → ${uploaded.url}`);
    const healed = await db.assets.updateAsset(asset.id, { url: uploaded.url });
    return healed || { ...asset, url: uploaded.url };
  } catch (err) {
    console.warn(`[assets] failed to re-upload ${asset.filename}: ${err.message}`);
    return null;
  }
}

/**
 * Given raw DB tags (which have `assetIds`, not populated `assets`), fetch all
 * referenced assets, heal any stale CDN URLs, and return tags with a fully
 * populated `assets: { group: [...] }` field ready for compilePrompt.
 *
 * Also handles legacy tags that still embed assets directly (no assetIds).
 */
async function healTagAssets(tags) {
  // ── New format: collect all IDs, fetch + heal in one pass ─────────────────
  const newFormat = tags.filter((t) => t.assetIds);
  const oldFormat = tags.filter((t) => !t.assetIds);

  const allIds = [...new Set(
    newFormat.flatMap((t) => Object.values(t.assetIds).flat().filter(Boolean))
  )];

  const fetched  = allIds.length ? await db.assets.getAssetsByIds(allIds) : [];
  const byId     = {};
  await Promise.all(fetched.map(async (asset) => {
    byId[asset.id] = await healAsset(asset);
  }));

  const healedNew = newFormat.map((tag) => {
    const assets = {};
    for (const [group, ids] of Object.entries(tag.assetIds)) {
      assets[group] = ids.map((id) => byId[id]).filter(Boolean);
    }
    return { ...tag, assets };
  });

  // ── Old embedded format: heal in place ────────────────────────────────────
  const healedOld = await Promise.all(oldFormat.map(async (tag) => {
    const assets = {};
    for (const group of Object.keys(tag.assets || {})) {
      const originals = Array.isArray(tag.assets[group]) ? tag.assets[group] : [];
      assets[group] = (await Promise.all(originals.map(healAsset))).filter(Boolean);
    }
    return { ...tag, assets };
  }));

  // Restore original order
  const newByKey = Object.fromEntries(healedNew.map((t) => [t.key, t]));
  const oldByKey = Object.fromEntries(healedOld.map((t) => [t.key, t]));
  return tags.map((t) => (t.assetIds ? newByKey[t.key] : oldByKey[t.key]));
}

/**
 * Heal a list of reference items `{ url, purpose }`.
 *
 * Assets are only created on explicit upload. This function only heals URLs
 * that already have an asset record. Unrecognized external URLs are returned
 * as-is (no new asset is created).
 *
 * - URL has a known asset record → heal it, return { id, url, purpose }.
 * - URL has no asset record      → return { url, purpose } unchanged.
 *
 * @param {Array<{ url: string, purpose: string }>} items
 * @returns {Promise<Array<{ id?: string, url: string, purpose: string }>>}
 */
async function healReferenceItems(items) {
  if (!items.length) return items;

  return Promise.all(items.map(async (item) => {
    const asset = await db.assets.getAssetByUrl(item.url);
    if (!asset) return { url: item.url, purpose: item.purpose };
    const healed = await healAsset(asset);
    if (healed) return { id: healed.id, url: healed.url, purpose: item.purpose };
    return { url: item.url, purpose: item.purpose };
  }));
}

module.exports = { saveAssetLocally, healAsset, healTagAssets, healReferenceItems };
