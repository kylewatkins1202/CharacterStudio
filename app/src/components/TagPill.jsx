import { TYPE_COLOR, font, radius } from "../theme";

/**
 * TagPill — small colored badge displaying a tag's type.
 *
 * @param {{ type: "character"|"prop"|"outfit"|"location" }} props
 */
export function TagPill({ type }) {
  const color = TYPE_COLOR[type];
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      padding:       "2px 8px",
      borderRadius:  radius.pill,
      fontSize:      font.sizeXs + 1,
      fontFamily:    font.mono,
      background:    color + "22",
      color:         color,
      border:        `1px solid ${color}44`,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    }}>
      {type}
    </span>
  );
}
