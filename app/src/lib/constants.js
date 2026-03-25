/**
 * lib/constants.js
 *
 * Domain constants shared across multiple components.
 */

/** Available aspect ratios for image generation. */
export const ASPECT_RATIOS = [
  { label: "1:1",  w: 1,  h: 1  },
  { label: "3:4",  w: 3,  h: 4  },
  { label: "4:3",  w: 4,  h: 3  },
  { label: "9:16", w: 9,  h: 16 },
  { label: "16:9", w: 16, h: 9  },
];

/**
 * Purpose options for reference images.
 * Each entry describes how the reference image will influence generation.
 */
export const REFERENCE_PURPOSES = [
  { value: "composition", label: "Composition", hint: "Framing, layout, subject placement" },
  { value: "style",       label: "Style",       hint: "Lighting, color grade, film aesthetic" },
  { value: "pose",        label: "Pose",        hint: "Body position, gesture, stance" },
  { value: "scene",       label: "Scene",       hint: "Background, environment, setting" },
  // { value: "wardrobe",    label: "Wardrobe",    hint: "Clothing, styling, accessories" },
  // { value: "face",        label: "Face",        hint: "Facial features, makeup" },
];
