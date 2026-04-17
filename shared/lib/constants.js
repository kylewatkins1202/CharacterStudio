export const ASPECT_RATIOS = [
  { label: "1:1",  w: 1,  h: 1  },
  { label: "3:4",  w: 3,  h: 4  },
  { label: "4:3",  w: 4,  h: 3  },
  { label: "9:16", w: 9,  h: 16 },
  { label: "16:9", w: 16, h: 9  },
];

export const REFERENCE_PURPOSES = [
  { value: "",            label: "None" },
  { value: "composition", label: "Composition", hint: "Framing, layout, subject placement" },
  { value: "style",       label: "Style",        hint: "Lighting, color grade, film aesthetic" },
  { value: "pose",        label: "Pose",         hint: "Body position, gesture, stance" },
  { value: "scene",       label: "Scene",        hint: "Background, environment, setting" },
];
