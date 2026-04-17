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

import { THEMES } from "../../shared/lib/theme.js";
export { THEMES };

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

  // Pre-computed alpha variants
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
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--cs-border-mid); border-radius: 3px; }
  select option { background: var(--cs-surface-modal); color: var(--cs-text); }
`;
