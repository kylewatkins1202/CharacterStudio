/**
 * lib/utils.js
 *
 * Pure utility functions with no React dependencies.
 */

import { ASPECT_RATIOS } from "./constants";

/**
 * Extract the final image URL from a WaveSpeed generation response.
 * Tries several known response shapes and returns the first non-null value.
 *
 * @param {unknown} wavespeed - Raw API response body.
 * @returns {string|null}
 */
export function extractImageUrl(wavespeed) {
  if (!wavespeed) return null;
  const d = wavespeed?.data || wavespeed;
  return (
    d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
    wavespeed?.outputs?.[0] || wavespeed?.images?.[0] || wavespeed?.image_url || wavespeed?.url ||
    null
  );
}

/**
 * Build a minimal synthetic result object from a single image URL.
 * Used when restoring a gallery entry to the generate page.
 *
 * @param {string} imageUrl
 * @returns {{ images: string[] }}
 */
export function makeSyntheticResult(imageUrl) {
  return { images: [imageUrl] };
}

/**
 * Compute an output resolution string (e.g. "2048*1536") for the given
 * aspect ratio and base size. Both dimensions are snapped to the nearest
 * 64-pixel boundary.
 *
 * @param {{ w: number, h: number }} aspect
 * @param {number} baseSize - Long-edge size in pixels.
 * @returns {string} e.g. "2048*1536"
 */
export function computeSize(aspect = { w: 1, h: 1 }, baseSize) {
  const ratio = aspect.w / aspect.h;
  let w, h;
  if (ratio >= 1) {
    w = Math.round(baseSize / 64) * 64;
    h = Math.round((baseSize / ratio) / 64) * 64;
  } else {
    h = Math.round(baseSize / 64) * 64;
    w = Math.round((baseSize * ratio) / 64) * 64;
  }
  return `${w}*${h}`;
}

export const sizeToRatio = (size) => {
  const [w, h] = size.split('*').map(Number);
  const actualRatio = w / h;

  let bestMatch = null;
  let smallestDiff = Infinity;

  for (const ratio of ASPECT_RATIOS) {
    const diff = Math.abs(actualRatio - ratio.w / ratio.h);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestMatch = ratio;
    }
  }

  return bestMatch;
}

/**
 * Estimate the generation cost for a given size string.
 *
 * @param {string} _sizeStr - e.g. "2048*1536" (currently unused; adjust formula as needed).
 * @returns {number} Estimated cost in USD.
 */
export function estimateCost(_sizeStr) {
  return 0.04 + 0.001;
}
