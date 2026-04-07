/**
 * scripts/convert-icon.js
 *
 * One-time script to convert build/icon.svg → build/icon.png (512×512).
 * Run once before `npm run dev` or `npm run dist`:
 *   node scripts/convert-icon.js
 */

const sharp = require("sharp");
const path  = require("path");
const fs    = require("fs");

const src  = path.join(__dirname, "..", "build", "icon.svg");
const dest = path.join(__dirname, "..", "build", "icon.png");

if (!fs.existsSync(src)) {
  console.error("build/icon.svg not found.");
  process.exit(1);
}

sharp(src)
  .resize(512, 512)
  .png()
  .toFile(dest)
  .then(() => console.log("✓  build/icon.png created (512×512)"))
  .catch((err) => {
    console.error("Conversion failed:", err.message);
    console.error("Try an online converter: https://svgtopng.com");
  });
