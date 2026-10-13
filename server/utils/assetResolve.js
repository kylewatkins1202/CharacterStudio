const wavespeed = require('../api/wavespeed')
const db = require('../db');
const { parseBase64Image } = require('./imageCollage');
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
  "image/avif": "avif",
};

// Work out which of the three cases a ref is
function classifyRef(item) {
  if (item == null) return null;

  if (typeof item === "string") {
    const s = item.trim();
    if (!s) return null;
    if (s.startsWith("data:")) return { kind: "base64", data: s, purpose: "" };
    if (s.startsWith("/api") || /^https?:\/\//i.test(s)) return { kind: "url", url: s, purpose: "" };
    return { kind: "assetId", id: s, purpose: "" };
  }

  if (typeof item === "object") {
    const purpose = item.purpose ?? "";
    if (item.id)   return { kind: "assetId", id: item.id, purpose };
    if (item.url)  return { kind: "url", url: String(item.url).trim(), purpose };
    if (item.data) return { kind: "base64", data: item.data, purpose };
  }
  return null;
}

// Upload a buffer to WaveSpeed, save it locally and create an asset record
async function createAssetFromBuffer({ buffer, mimeType, ext, purpose, index }) {
  const filename = `ref-${Date.now()}-${index}.${ext}`;
  const uploaded = await wavespeed.uploadBufferToWaveSpeed(buffer, filename, mimeType);
  const { localPath, assetPath } = await saveToFolder("assets", filename, buffer);
  const asset = await db.assets.createAsset({
    id:        crypto.randomUUID(),
    url:       uploaded.url,
    localPath,
    assetPath,
    filename,
    mimeType,
    purpose,
    hidden:    false,
    timestamp: new Date().toISOString(),
  });
  return { id: asset.id, url: uploaded.url, purpose };
}

// If the URL points at one of our own /api asset routes, return that asset
async function findKnownAssetFromUrl(url) {
  let pathname;
  try {
    pathname = new URL(url, "http://local").pathname; // base handles relative /api paths
  } catch {
    return null;
  }
  if (!pathname.startsWith("/api")) return null;
  const uuid = pathname.match(UUID_REGEX)?.[0];
  return uuid ? await db.assets.getAsset(uuid) : null;
}

// Download a third-party image into a buffer
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error(`Reference URL is not an image (${mimeType || "unknown type"}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = MIME_EXT[mimeType] || mimeType.split("/")[1] || "bin";
  return { buffer, mimeType, ext };
}

// Resolve every reference image into { id, url, purpose }, keeping the user's order
async function resolveReferenceImages(referenceImages) {
  const rawRefs = Array.isArray(referenceImages) ? referenceImages : [];
  const allReferenceItems = [];
  let uploadIndex = 0;

  for (const item of rawRefs) {
    const ref = classifyRef(item);
    if (!ref) continue;

    switch (ref.kind) {
      // 1. Existing asset id: look up and heal
      case "assetId": {
        const asset = await db.assets.getAsset(ref.id);
        if (!asset) break;
        const healed = await healAsset(asset);
        allReferenceItems.push({ id: healed.id, url: healed.url, purpose: ref.purpose });
        break;
      }

      // 2. Base64 upload: create a new asset
      case "base64": {
        const parsed = parseBase64Image(ref.data);
        allReferenceItems.push(await createAssetFromBuffer({
          buffer:   parsed.buffer,
          mimeType: parsed.mimeType,
          ext:      parsed.ext,
          purpose:  ref.purpose,
          index:    uploadIndex++,
        }));
        break;
      }

      // 3. Pasted URL: our own /api asset, or a third-party image to import
      case "url": {
        const known = await findKnownAssetFromUrl(ref.url);
        if (known) {
          allReferenceItems.push({ id: known.id, url: known.localPath, purpose: ref.purpose });
          break;
        }

        // A relative path that didn't resolve to an asset can't be downloaded
        if (!/^https?:\/\//i.test(ref.url)) break;

        const downloaded = await downloadImage(ref.url);
        allReferenceItems.push(await createAssetFromBuffer({
          ...downloaded,
          purpose: ref.purpose,
          index:   uploadIndex++,
        }));
        break;
      }
    }
  }

  return allReferenceItems;
}

module.exports = resolveReferenceImages