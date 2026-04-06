/**
 * theme.js
 *
 * Central design-token file for Character Studio.
 * Colors are exposed as CSS variable references so the active theme can be
 * switched at runtime by injecting a `:root { --cs-* }` block via getThemeCss().
 *
 * Usage:
 *   import { colors, font, getThemeCss, fieldLabel as FL, fieldInput as FI } from "../theme";
 */

// ─── Theme Palettes ───────────────────────────────────────────────────────────

export const THEMES = {
  dark: {
    bg:           "#080808",
    surface:      "#0a0a0a",
    surfaceModal: "#0e0e0e",
    surfaceDeep:  "#080808",
    surfaceSink:  "#111111",
    borderFaint:  "#111111",
    border:       "#141414",
    borderMid:    "#1a1a1a",
    borderStrong: "#2a2a2a",
    borderFocus:  "#555555",
    text:         "#e8e8e8",
    textHigh:     "#f0f0f0",
    textMid:      "#d0d0d0",
    textMuted:    "#555555",
    textDim:      "#444444",
    textGhost:    "#333333",
    textSubtle:   "#2a2a2a",
    textFaint:    "#1e1e1e",
    primary:      "#f0f0f0",
    primaryText:  "#000000",
    error:        "#ff3b3b",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#f0f0f014",
    primaryA40:   "#f0f0f066",
    primaryA44:   "#f0f0f070",
    errorA44:     "#ff3b3b70",
    errorA66:     "#ff3b3baa",
    tagLocationA: "#34d399aa",
  },

  slate: {
    bg:           "#090b10",
    surface:      "#0c0f16",
    surfaceModal: "#10141e",
    surfaceDeep:  "#090b10",
    surfaceSink:  "#131820",
    borderFaint:  "#131820",
    border:       "#181d28",
    borderMid:    "#1f2535",
    borderStrong: "#2c3548",
    borderFocus:  "#4a6070",
    text:         "#dde5f0",
    textHigh:     "#eaf0f8",
    textMid:      "#c8d4e0",
    textMuted:    "#4a6070",
    textDim:      "#3a4e60",
    textGhost:    "#2e3c4a",
    textSubtle:   "#222e38",
    textFaint:    "#1a2530",
    primary:      "#6ba3d0",
    primaryText:  "#04080e",
    error:        "#ff4444",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#6ba3d014",
    primaryA40:   "#6ba3d066",
    primaryA44:   "#6ba3d070",
    errorA44:     "#ff444470",
    errorA66:     "#ff4444aa",
    tagLocationA: "#34d399aa",
  },

  warm: {
    bg:           "#0a0805",
    surface:      "#0f0c07",
    surfaceModal: "#14100a",
    surfaceDeep:  "#0a0805",
    surfaceSink:  "#181410",
    borderFaint:  "#181410",
    border:       "#1e1a12",
    borderMid:    "#26201a",
    borderStrong: "#362d20",
    borderFocus:  "#706040",
    text:         "#f0e8d8",
    textHigh:     "#f8f0e0",
    textMid:      "#ddd0b8",
    textMuted:    "#6a5840",
    textDim:      "#544630",
    textGhost:    "#3c3020",
    textSubtle:   "#2a2018",
    textFaint:    "#201810",
    primary:      "#d4a853",
    primaryText:  "#100800",
    error:        "#ff4444",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#d4a85314",
    primaryA40:   "#d4a85366",
    primaryA44:   "#d4a85370",
    errorA44:     "#ff444470",
    errorA66:     "#ff4444aa",
    tagLocationA: "#34d399aa",
  },

  light: {
    bg:           "#f4f4f2",
    surface:      "#ffffff",
    surfaceModal: "#f8f8f6",
    surfaceDeep:  "#f0f0ee",
    surfaceSink:  "#e8e8e6",
    borderFaint:  "#ebebea",
    border:       "#e0e0de",
    borderMid:    "#d0d0ce",
    borderStrong: "#b0b0ae",
    borderFocus:  "#606060",
    text:         "#1c1c1c",
    textHigh:     "#0a0a0a",
    textMid:      "#2e2e2e",
    textMuted:    "#606060",
    textDim:      "#808080",
    textGhost:    "#a0a0a0",
    textSubtle:   "#c8c8c8",
    textFaint:    "#e0e0e0",
    primary:      "#1a1a1a",
    primaryText:  "#ffffff",
    error:        "#c8291e",
    success:      "#177a40",
    successText:  "#ffffff",
    tagCharacter: "#7c22cc",
    tagProp:      "#1a4db8",
    tagOutfit:    "#b01870",
    tagLocation:  "#0a7048",
    primaryA08:   "#1a1a1a14",
    primaryA40:   "#1a1a1a66",
    primaryA44:   "#1a1a1a70",
    errorA44:     "#c8291e70",
    errorA66:     "#c8291eaa",
    tagLocationA: "#0a704844",
  },

  forest: {
    bg:           "#060a07",
    surface:      "#080d09",
    surfaceModal: "#0c1210",
    surfaceDeep:  "#060a07",
    surfaceSink:  "#0f1610",
    borderFaint:  "#0f1610",
    border:       "#141e15",
    borderMid:    "#1c2c1e",
    borderStrong: "#2a3e2c",
    borderFocus:  "#4a7050",
    text:         "#d4ecd6",
    textHigh:     "#e4f4e6",
    textMid:      "#bcd8be",
    textMuted:    "#4a6850",
    textDim:      "#3a5040",
    textGhost:    "#2c3c2e",
    textSubtle:   "#1e2c20",
    textFaint:    "#141e16",
    primary:      "#5ab870",
    primaryText:  "#040a04",
    error:        "#ff4444",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#5ab87014",
    primaryA40:   "#5ab87066",
    primaryA44:   "#5ab87070",
    errorA44:     "#ff444470",
    errorA66:     "#ff4444aa",
    tagLocationA: "#34d399aa",
  },

  rose: {
    bg:           "#0e0809",
    surface:      "#120c0d",
    surfaceModal: "#181012",
    surfaceDeep:  "#0e0809",
    surfaceSink:  "#1c1416",
    borderFaint:  "#1c1416",
    border:       "#241a1c",
    borderMid:    "#302024",
    borderStrong: "#422c32",
    borderFocus:  "#7a5060",
    text:         "#f0dde0",
    textHigh:     "#f8e8ec",
    textMid:      "#ddc0c6",
    textMuted:    "#7a5060",
    textDim:      "#5e3c48",
    textGhost:    "#442a34",
    textSubtle:   "#301c24",
    textFaint:    "#201218",
    primary:      "#c87090",
    primaryText:  "#0a0406",
    error:        "#ff4444",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#c8709014",
    primaryA40:   "#c8709066",
    primaryA44:   "#c8709070",
    errorA44:     "#ff444470",
    errorA66:     "#ff4444aa",
    tagLocationA: "#34d399aa",
  },

  midnight: {
    bg:           "#06070f",
    surface:      "#090a14",
    surfaceModal: "#0d0f1c",
    surfaceDeep:  "#06070f",
    surfaceSink:  "#121420",
    borderFaint:  "#121420",
    border:       "#181a28",
    borderMid:    "#1e2034",
    borderStrong: "#282a42",
    borderFocus:  "#4a4c80",
    text:         "#d4d6f0",
    textHigh:     "#e4e6f8",
    textMid:      "#b8bae0",
    textMuted:    "#4a4c80",
    textDim:      "#3a3c68",
    textGhost:    "#2c2e52",
    textSubtle:   "#1e2038",
    textFaint:    "#14162a",
    primary:      "#7272d0",
    primaryText:  "#040408",
    error:        "#ff4444",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#7272d014",
    primaryA40:   "#7272d066",
    primaryA44:   "#7272d070",
    errorA44:     "#ff444470",
    errorA66:     "#ff4444aa",
    tagLocationA: "#34d399aa",
  },

  sand: {
    bg:           "#f5f0e8",
    surface:      "#faf8f2",
    surfaceModal: "#f0ece0",
    surfaceDeep:  "#ede8dc",
    surfaceSink:  "#e8e2d4",
    borderFaint:  "#ece6d8",
    border:       "#e0d8c8",
    borderMid:    "#d0c8b4",
    borderStrong: "#b8aa90",
    borderFocus:  "#90785a",
    text:         "#2c2418",
    textHigh:     "#1a1408",
    textMid:      "#3c3228",
    textMuted:    "#7a6a54",
    textDim:      "#9a8868",
    textGhost:    "#b8a888",
    textSubtle:   "#d4c8a8",
    textFaint:    "#e8e0cc",
    primary:      "#8b6840",
    primaryText:  "#faf8f2",
    error:        "#c0301c",
    success:      "#1a7040",
    successText:  "#ffffff",
    tagCharacter: "#7c22cc",
    tagProp:      "#1a4db8",
    tagOutfit:    "#b01870",
    tagLocation:  "#0a7048",
    primaryA08:   "#8b684014",
    primaryA40:   "#8b684066",
    primaryA44:   "#8b684070",
    errorA44:     "#c0301c70",
    errorA66:     "#c0301caa",
    tagLocationA: "#0a704844",
  },

  mist: {
    bg:           "#edf0f5",
    surface:      "#f4f6fa",
    surfaceModal: "#e8ecf2",
    surfaceDeep:  "#e2e6ee",
    surfaceSink:  "#dce0ea",
    borderFaint:  "#e0e4ec",
    border:       "#d4d8e4",
    borderMid:    "#c4c8d8",
    borderStrong: "#a4a8c0",
    borderFocus:  "#5860a0",
    text:         "#1c2030",
    textHigh:     "#0e1420",
    textMid:      "#2c3248",
    textMuted:    "#5860a0",
    textDim:      "#7880b8",
    textGhost:    "#a0a8c8",
    textSubtle:   "#c8ccde",
    textFaint:    "#dde0ec",
    primary:      "#4858a8",
    primaryText:  "#f4f6fa",
    error:        "#c0281c",
    success:      "#1a7040",
    successText:  "#ffffff",
    tagCharacter: "#7c22cc",
    tagProp:      "#1a4db8",
    tagOutfit:    "#b01870",
    tagLocation:  "#0a7048",
    primaryA08:   "#4858a814",
    primaryA40:   "#4858a866",
    primaryA44:   "#4858a870",
    errorA44:     "#c0281c70",
    errorA66:     "#c0281caa",
    tagLocationA: "#0a704844",
  },

  sage: {
    bg:           "#ecf2ec",
    surface:      "#f4f8f4",
    surfaceModal: "#e6ede6",
    surfaceDeep:  "#e0e8e0",
    surfaceSink:  "#d8e2d8",
    borderFaint:  "#dce6dc",
    border:       "#ccd8cc",
    borderMid:    "#b8c8b8",
    borderStrong: "#98aa98",
    borderFocus:  "#4a7050",
    text:         "#1a2c1a",
    textHigh:     "#0c1c0c",
    textMid:      "#2a3e2a",
    textMuted:    "#4a7050",
    textDim:      "#6a9070",
    textGhost:    "#90b098",
    textSubtle:   "#c0d4c4",
    textFaint:    "#d8e6da",
    primary:      "#3a6e3a",
    primaryText:  "#f4f8f4",
    error:        "#c0281c",
    success:      "#1a7040",
    successText:  "#ffffff",
    tagCharacter: "#7c22cc",
    tagProp:      "#1a4db8",
    tagOutfit:    "#b01870",
    tagLocation:  "#0a7048",
    primaryA08:   "#3a6e3a14",
    primaryA40:   "#3a6e3a66",
    primaryA44:   "#3a6e3a70",
    errorA44:     "#c0281c70",
    errorA66:     "#c0281caa",
    tagLocationA: "#0a704844",
  },

  // Cyberpunk terminal — phosphor green on near-black
  neon: {
    bg:           "#03090a",
    surface:      "#05100c",
    surfaceModal: "#071510",
    surfaceDeep:  "#03090a",
    surfaceSink:  "#0a1a14",
    borderFaint:  "#0a1a14",
    border:       "#0e2418",
    borderMid:    "#143020",
    borderStrong: "#1e4830",
    borderFocus:  "#00d870",
    text:         "#b8fcd8",
    textHigh:     "#d8ffe8",
    textMid:      "#90e0b8",
    textMuted:    "#309060",
    textDim:      "#246850",
    textGhost:    "#1a4c38",
    textSubtle:   "#0e3028",
    textFaint:    "#082018",
    primary:      "#00e87a",
    primaryText:  "#020a06",
    error:        "#ff4040",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#00e87a14",
    primaryA40:   "#00e87a66",
    primaryA44:   "#00e87a70",
    errorA44:     "#ff404070",
    errorA66:     "#ff4040aa",
    tagLocationA: "#34d399aa",
  },

  // Twilight sky — deep purple with a burning sunset primary
  dusk: {
    bg:           "#100818",
    surface:      "#160b20",
    surfaceModal: "#1e1030",
    surfaceDeep:  "#100818",
    surfaceSink:  "#1c1028",
    borderFaint:  "#1c1028",
    border:       "#281840",
    borderMid:    "#342054",
    borderStrong: "#4a2e70",
    borderFocus:  "#e07838",
    text:         "#ead8f8",
    textHigh:     "#f4e8ff",
    textMid:      "#d0b8e8",
    textMuted:    "#7050a0",
    textDim:      "#583880",
    textGhost:    "#3e2860",
    textSubtle:   "#2a1840",
    textFaint:    "#1a0e2c",
    primary:      "#e07838",
    primaryText:  "#100408",
    error:        "#ff4444",
    success:      "#00e87a",
    successText:  "#000000",
    tagCharacter: "#c084fc",
    tagProp:      "#60a5fa",
    tagOutfit:    "#f472b6",
    tagLocation:  "#34d399",
    primaryA08:   "#e0783814",
    primaryA40:   "#e0783866",
    primaryA44:   "#e0783870",
    errorA44:     "#ff444470",
    errorA66:     "#ff4444aa",
    tagLocationA: "#34d399aa",
  },
};

/**
 * Generates a `:root { --cs-* }` CSS block for the given theme name.
 * Inject this before globalCss in App.jsx.
 */
export function getThemeCss(name) {
  const t = THEMES[name] || THEMES.dark;
  return `:root {
  --cs-bg: ${t.bg};
  --cs-surface: ${t.surface};
  --cs-surface-modal: ${t.surfaceModal};
  --cs-surface-deep: ${t.surfaceDeep};
  --cs-surface-sink: ${t.surfaceSink};
  --cs-border-faint: ${t.borderFaint};
  --cs-border: ${t.border};
  --cs-border-mid: ${t.borderMid};
  --cs-border-strong: ${t.borderStrong};
  --cs-border-focus: ${t.borderFocus};
  --cs-text: ${t.text};
  --cs-text-high: ${t.textHigh};
  --cs-text-mid: ${t.textMid};
  --cs-text-muted: ${t.textMuted};
  --cs-text-dim: ${t.textDim};
  --cs-text-ghost: ${t.textGhost};
  --cs-text-subtle: ${t.textSubtle};
  --cs-text-faint: ${t.textFaint};
  --cs-primary: ${t.primary};
  --cs-primary-text: ${t.primaryText};
  --cs-error: ${t.error};
  --cs-success: ${t.success};
  --cs-success-text: ${t.successText};
  --cs-tag-character: ${t.tagCharacter};
  --cs-tag-prop: ${t.tagProp};
  --cs-tag-outfit: ${t.tagOutfit};
  --cs-tag-location: ${t.tagLocation};
  --cs-primary-a08: ${t.primaryA08};
  --cs-primary-a40: ${t.primaryA40};
  --cs-primary-a44: ${t.primaryA44};
  --cs-error-a44: ${t.errorA44};
  --cs-error-a66: ${t.errorA66};
  --cs-tag-location-a: ${t.tagLocationA};
}`;
}

// ─── Color Palette (CSS variable references) ─────────────────────────────────
// All values are CSS var() references so they respond to the active theme.

export const colors = {
  // Backgrounds
  bg:           "var(--cs-bg)",
  surface:      "var(--cs-surface)",
  surfaceModal: "var(--cs-surface-modal)",
  surfaceDeep:  "var(--cs-surface-deep)",
  surfaceSink:  "var(--cs-surface-sink)",

  // Borders
  borderFaint:  "var(--cs-border-faint)",
  border:       "var(--cs-border)",
  borderMid:    "var(--cs-border-mid)",
  borderStrong: "var(--cs-border-strong)",
  borderFocus:  "var(--cs-border-focus)",

  // Text
  text:         "var(--cs-text)",
  textHigh:     "var(--cs-text-high)",
  textMid:      "var(--cs-text-mid)",
  textMuted:    "var(--cs-text-muted)",
  textDim:      "var(--cs-text-dim)",
  textGhost:    "var(--cs-text-ghost)",
  textSubtle:   "var(--cs-text-subtle)",
  textFaint:    "var(--cs-text-faint)",

  // Interactive
  primary:      "var(--cs-primary)",
  primaryText:  "var(--cs-primary-text)",

  // Semantic
  error:        "var(--cs-error)",
  success:      "var(--cs-success)",
  successText:  "var(--cs-success-text)",

  // Tag type accent colors
  tagCharacter: "var(--cs-tag-character)",
  tagProp:      "var(--cs-tag-prop)",
  tagOutfit:    "var(--cs-tag-outfit)",
  tagLocation:  "var(--cs-tag-location)",

  // Pre-computed alpha variants (replaces the `${colors.x}HH` hex-suffix pattern)
  primaryA08:   "var(--cs-primary-a08)",
  primaryA40:   "var(--cs-primary-a40)",
  primaryA44:   "var(--cs-primary-a44)",
  errorA44:     "var(--cs-error-a44)",
  errorA66:     "var(--cs-error-a66)",
  tagLocationA: "var(--cs-tag-location-a)",
};

// ─── Tag Type Maps ────────────────────────────────────────────────────────────

export const TYPE_COLOR = {
  character: colors.tagCharacter,
  prop:      colors.tagProp,
  outfit:    colors.tagOutfit,
  location:  colors.tagLocation,
};

export const TYPE_ICON = {
  character: "◈",
  prop:      "⬡",
  outfit:    "◇",
  location:  "◎",
};

// ─── Spacing ──────────────────────────────────────────────────────────────────

export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  xxl:  32,
  page: 40,
};

// ─── Border Radius ────────────────────────────────────────────────────────────

export const radius = {
  sm:   5,
  md:   8,
  lg:   10,
  xl:   12,
  xxl:  16,
  pill: 999,
};

// ─── Typography ───────────────────────────────────────────────────────────────

export const font = {
  mono:         "'DM Mono', monospace",
  serif:        "'Playfair Display', serif",

  sizeXs:       10,
  sizeSm:       11,
  sizeMd:       12,
  sizeLg:       13,
  sizeXl:       14,
  sizeHeading:  36,
  sizeSubhead:  24,
  sizeNav:      16,
};

// ─── Reusable Inline Style Objects ───────────────────────────────────────────

export const fieldLabel = {
  display:       "block",
  color:         colors.textDim,
  fontFamily:    font.mono,
  fontSize:      font.sizeSm,
  marginBottom:  6,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const fieldInput = {
  width:        "100%",
  background:   colors.surfaceDeep,
  border:       `1px solid ${colors.border}`,
  borderRadius: radius.md,
  color:        colors.text,
  fontFamily:   font.mono,
  fontSize:     font.sizeLg,
  padding:      "10px 12px",
  outline:      "none",
  boxSizing:    "border-box",
};

/**
 * Global CSS injected once by App (after the theme :root block).
 */
export const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--cs-bg); color: var(--cs-text); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--cs-border-mid); border-radius: 3px; }
  select option { background: var(--cs-surface-modal); color: var(--cs-text); }
`;
