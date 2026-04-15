import { ASPECT_RATIOS } from "./constants";

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
  if (!size) return ASPECT_RATIOS[0];
  const [w, h] = size.split("*").map(Number);
  if (!w || !h) return ASPECT_RATIOS[0];
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return ASPECT_RATIOS.find((r) => r.w === w / d && r.h === h / d) || ASPECT_RATIOS[0];
}
