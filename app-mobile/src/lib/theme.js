/**
 * theme.js — React Native edition.
 *
 * All values are plain hex strings / numbers. No CSS variables needed.
 * Use getTheme(name) to get the active palette; store the selected name
 * in AppStore.
 */

import { THEMES } from "../../../shared/lib/theme.js";
export { THEMES };

export function getTheme(name) {
  return THEMES[name] || THEMES.dark;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, page: 20 };
export const radius  = { sm: 5, md: 8, lg: 10, xl: 12, pill: 999 };

export const TYPE_COLOR = {
  character: "#c084fc",
  prop:      "#60a5fa",
  outfit:    "#f472b6",
  location:  "#34d399",
};

export const TYPE_ICON = {
  character: "◈",
  prop:      "⬡",
  outfit:    "◇",
  location:  "◎",
};
