/**
 * scripts/migrate-assets.js
 *
 * One-time migration: moves embedded tag assets and _refs into the new
 * assets.json table and rewrites tags.json to use assetIds.
 *
 * For each asset:
 *   - If localPath exists and the file is on disk → use as-is.
 *   - Otherwise → download from the CDN URL and save locally.
 *
 * Run once from the project root:
 *   node server/scripts/migrate-assets.js
 */

const fs   = require("fs/promises");
const path = require("path");
const http = require("https"); // all URLs are https

// ─── Paths ───────────────────────────────────────────────────────────────────

const DATA_DIR    = path.join(__dirname, "..", "data");
const ASSETS_DIR  = path.join(DATA_DIR, "assets");
const TAGS_PATH   = path.join(DATA_DIR, "tags.json");
const ASSETS_PATH = path.join(DATA_DIR, "assets.json");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Download a URL and return the response body as a Buffer. */
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow one redirect
        return resolve(downloadUrl(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/** Check if a file exists on disk. */
async function fileExists(filePath) {
  try { await fs.access(filePath); return true; }
  catch { return false; }
}

/**
 * Ensure the binary for an asset is saved locally.
 * Returns { localPath, assetPath } where assetPath is relative to ASSETS_DIR
 * using forward slashes (used to build the /api/assets/… fallback URL).
 */
async function ensureLocalFile(asset, tagKey, group) {
  // 1. Existing localPath that's still on disk → use it
  if (asset.localPath && await fileExists(asset.localPath)) {
    const rel = path.relative(ASSETS_DIR, asset.localPath).replace(/\\/g, "/");
    return { localPath: asset.localPath, assetPath: rel };
  }

  // 2. Need to download
  console.log(`  ↓ downloading ${asset.filename} from CDN…`);
  let buffer;
  try {
    buffer = await downloadUrl(asset.url);
  } catch (err) {
    console.warn(`  ✗ download failed: ${err.message}`);
    return { localPath: null, assetPath: null };
  }

  const dir       = path.join(ASSETS_DIR, tagKey, group);
  await fs.mkdir(dir, { recursive: true });
  const localPath = path.join(dir, asset.filename);
  await fs.writeFile(localPath, buffer);
  const assetPath = `${tagKey}/${group}/${asset.filename}`;
  console.log(`  ✓ saved to ${assetPath}`);
  return { localPath, assetPath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Asset migration ===\n");

  const tagsDb  = JSON.parse(await fs.readFile(TAGS_PATH,   "utf8"));
  let assetsDb;
  try {
    assetsDb = JSON.parse(await fs.readFile(ASSETS_PATH, "utf8"));
  } catch {
    assetsDb = { assets: {} };
  }

  const newAssetsDb = { assets: { ...assetsDb.assets } };
  const newTagsDb   = { tags: {} };

  for (const [tagKey, tag] of Object.entries(tagsDb.tags)) {
    // _refs becomes type:"reference" assets — handled inline, not kept as a tag
    if (tagKey === "_refs") {
      console.log(`[_refs] migrating reference assets…`);
      const refAssets = tag.assets?.reference || [];
      for (const asset of refAssets) {
        if (newAssetsDb.assets[asset.id]) {
          console.log(`  skip (already migrated): ${asset.filename}`);
          continue;
        }
        console.log(`  • ${asset.filename}`);
        const { localPath, assetPath } = await ensureLocalFile(asset, "_refs", "reference");
        newAssetsDb.assets[asset.id] = {
          id:        asset.id,
          type:      "reference",
          url:       asset.url,
          localPath: localPath || asset.localPath || null,
          assetPath: assetPath || null,
          filename:  asset.filename,
          mimeType:  asset.mimeType,
          purpose:   asset.purpose || "composition",
          hidden:    asset.hidden  || false,
          timestamp: asset.timestamp || new Date().toISOString(),
        };
      }
      // Don't carry _refs forward as a tag
      continue;
    }

    console.log(`[${tagKey}] migrating…`);
    const assetIds = {};

    for (const [group, items] of Object.entries(tag.assets || {})) {
      assetIds[group] = [];
      for (const asset of items) {
        if (newAssetsDb.assets[asset.id]) {
          console.log(`  skip (already migrated): ${asset.filename}`);
          assetIds[group].push(asset.id);
          continue;
        }
        console.log(`  • ${group}/${asset.filename}`);
        const { localPath, assetPath } = await ensureLocalFile(asset, tagKey, group);
        newAssetsDb.assets[asset.id] = {
          id:        asset.id,
          type:      "tag_asset",
          tagKey,
          group,
          url:       asset.url,
          localPath: localPath || asset.localPath || null,
          assetPath: assetPath || null,
          filename:  asset.filename,
          mimeType:  asset.mimeType,
          hidden:    asset.hidden  || false,
          timestamp: asset.timestamp || tag.meta?.updatedAt || new Date().toISOString(),
        };
        assetIds[group].push(asset.id);
      }
    }

    // Build new tag record: assetIds replaces assets
    const { assets: _dropped, ...tagWithoutAssets } = tag;
    newTagsDb.tags[tagKey] = { ...tagWithoutAssets, assetIds };
  }

  // Write both files
  await fs.writeFile(TAGS_PATH,   JSON.stringify(newTagsDb,   null, 2), "utf8");
  await fs.writeFile(ASSETS_PATH, JSON.stringify(newAssetsDb, null, 2), "utf8");

  const count = Object.keys(newAssetsDb.assets).length;
  console.log(`\n✓ Done. ${count} asset record(s) written to assets.json`);
  console.log(`✓ tags.json updated to use assetIds`);
}

main().catch((err) => { console.error(err); process.exit(1); });
