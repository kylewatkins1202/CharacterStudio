/**
 * theme.js
 *
 * Central design-token file for Character Studio.
 * All colors, spacing, radius, typography, and reusable inline style objects
 * live here so that visual changes can be made in one place.
 *
 * Usage:
 *   import { colors, font, fieldLabel as FL, fieldInput as FI } from "../theme";
 */

// ─── Color Palette ────────────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg:           "#080808",   // root page background
  surface:      "#0a0a0a",   // card / gallery item surface
  surfaceModal: "#0e0e0e",   // modal panel background
  surfaceDeep:  "#080808",   // deep inset (input background)
  surfaceSink:  "#111111",   // slightly lighter inset

  // Borders (lightest → darkest visual weight)
  borderFaint:  "#111111",
  border:       "#141414",
  borderMid:    "#1a1a1a",
  borderStrong: "#2a2a2a",
  borderFocus:  "#555555",

  // Text
  text:         "#e8e8e8",   // primary content
  textHigh:     "#f0f0f0",   // headings / strong emphasis
  textMid:      "#d0d0d0",   // secondary labels
  textMuted:    "#555555",   // de-emphasized / placeholders
  textDim:      "#444444",   // field labels
  textGhost:    "#333333",   // very quiet text
  textSubtle:   "#2a2a2a",   // nearly invisible helper text
  textFaint:    "#1e1e1e",   // decoration / metadata

  // Interactive
  primary:      "#f0f0f0",   // primary button background
  primaryText:  "#000000",   // text on primary button

  // Semantic
  error:        "#ff3b3b",
  success:      "#00e87a",
  successText:  "#000000",

  // Tag type accent colors
  tagCharacter: "#c084fc",
  tagProp:      "#60a5fa",
  tagOutfit:    "#f472b6",
  tagLocation:  "#34d399",
};

// ─── Tag Type Maps ────────────────────────────────────────────────────────────
// Used by TagPill, TagFormModal, TagsPage, PromptInput, etc.

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

  // Size scale
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
// These cover the most frequently repeated patterns in the codebase.

/**
 * Standard form field label style.
 * Alias as `FL` in components for brevity:
 *   import { fieldLabel as FL } from "../theme";
 */
export const fieldLabel = {
  display:       "block",
  color:         colors.textDim,
  fontFamily:    font.mono,
  fontSize:      font.sizeSm,
  marginBottom:  6,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

/**
 * Standard form field input style.
 * Alias as `FI` in components for brevity:
 *   import { fieldInput as FI } from "../theme";
 */
export const fieldInput = {
  width:      "100%",
  background: colors.surfaceDeep,
  border:     `1px solid #1e1e1e`,
  borderRadius: radius.md,
  color:      colors.text,
  fontFamily: font.mono,
  fontSize:   font.sizeLg,
  padding:    "10px 12px",
  outline:    "none",
  boxSizing:  "border-box",
};

/**
 * Global CSS injected once by App.
 * Includes Google Fonts import, resets, scrollbar styles, and keyframe animations.
 */
export const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${colors.bg}; color: ${colors.text}; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 3px; }
  select option { background: ${colors.surfaceModal}; color: ${colors.text}; }
`;
