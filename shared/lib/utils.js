import { ASPECT_RATIOS } from "./constants.js";

export function extractImageUrl(result) {
  if (!result) return null;
  const d = result?.data || result;
  return (
    d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
    result?.outputs?.[0] || result?.images?.[0] || result?.image_url || result?.url ||
    null
  );
}

export function makeSyntheticResult(imageUrl) {
  return { images: [imageUrl] };
}

export function computeSize(aspect, baseSize) {
  if (!aspect) return `${baseSize}*${baseSize}`;
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

export function sizeToRatio(size) {
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
