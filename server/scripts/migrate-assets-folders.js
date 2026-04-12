/**
 * scripts/migrate-assets-folders.js
 *
 * One-time migration: flatten all asset paths to top-level folders.
 *
 * Mapping:
 *   generated/**  → generated/{filename}
 *   upscaled/**   → upscaled/{filename}
 *   everything else (unassigned/, refs/, riley/, alba/, etc.) → assets/{filename}
 *
 * For each asset:
 *   1. Move the file on disk
 *   2. Update assetPath + localPath in assets.json
 *
 * Gated by migrationVersion in assets.json — runs exactly once.
 * Called automatically from db/index.js at server startup.
 */

const path = require("path");
const fsp  = require("fs").promises;

const MIGRATION_VERSION = 1;

const KEEP_FIRST_SEGMENT = new Set(["generated", "upscaled"]);

function targetFolder(assetPath) {
  const first = assetPath.split("/")[0];
  return KEEP_FIRST_SEGMENT.has(first) ? first : "assets";
}

/** Return a non-colliding absolute path inside targetDir/filename. */
async function resolveDestPath(targetDir, filename) {
  const ext  = path.extname(filename);
  const base = path.basename(filename, ext);
  let   dest = path.join(targetDir, filename);
  let   n    = 1;
  while (true) {
    try {
      await fsp.access(dest);
      n++;
      dest = path.join(targetDir, `${base}-${n}${ext}`);
    } catch {
      return dest; // path does not exist → safe to use
    }
  }
}

async function migrateAssetsFolders(db) {
  const data = await db.assets.read();

  // Already migrated?
  if ((data.migrationVersion || 0) >= MIGRATION_VERSION) return;

  console.log("[migration] Starting assets folder migration…");

  const assets = Object.values(data.assets);
  let moved = 0, skipped = 0, errors = 0;

  for (const asset of assets) {
    if (!asset.assetPath) { skipped++; continue; } // CDN-only, no local file

    const folder   = targetFolder(asset.assetPath);
    const filename = asset.assetPath.split("/").pop();

    // Already in the right top-level folder (single level path)?
    const segments = asset.assetPath.split("/").filter(Boolean);
    if (segments.length === 2 && segments[0] === folder) { skipped++; continue; }

    const srcAbs  = path.join(db.ASSETS_DIR, ...asset.assetPath.split("/"));
    const destDir = path.join(db.ASSETS_DIR, folder);

    try {
      await fsp.mkdir(destDir, { recursive: true });
      const destAbs    = await resolveDestPath(destDir, filename);
      const destFile   = path.basename(destAbs);
      const newAssetPath = `${folder}/${destFile}`;

      // Move the file
      try {
        await fsp.rename(srcAbs, destAbs);
      } catch {
        // Cross-device rename — fall back to copy + delete
        await fsp.copyFile(srcAbs, destAbs);
        await fsp.unlink(srcAbs).catch(() => {});
      }

      // Patch in-memory record (we'll write the whole DB at the end)
      data.assets[asset.id] = {
        ...data.assets[asset.id],
        assetPath: newAssetPath,
        localPath: destAbs,
      };
      moved++;
    } catch (err) {
      console.warn(`[migration] Failed to move ${asset.assetPath}: ${err.message}`);
      errors++;
    }
  }

  // Stamp the migration version and persist
  data.migrationVersion = MIGRATION_VERSION;
  if (!Array.isArray(data.userFolders)) data.userFolders = [];
  await db.assets.write(data);

  console.log(`[migration] Done — moved: ${moved}, skipped: ${skipped}, errors: ${errors}`);
}

module.exports = { migrateAssetsFolders };
