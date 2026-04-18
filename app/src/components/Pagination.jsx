import { useCallback } from "react";
import { colors, font, radius } from "../theme";

/**
 * Builds the ordered list of page numbers/ellipses to render.
 * Always includes page 1, totalPages, and a ±2 window around current.
 * Inserts "…" wherever there is a gap > 1 between shown page numbers.
 */
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total]);
  for (let d = 0; d <= 2; d++) {
    if (current - d >= 1)     pages.add(current - d);
    if (current + d <= total) pages.add(current + d);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

/**
 * Pagination — prev/next arrows with clickable page numbers.
 *
 * @param {{
 *   page: number,
 *   totalPages: number,
 *   onPage: (n: number) => void,
 *   compact?: boolean
 * }} props
 */
export function Pagination({ page, totalPages, onPage, compact = false }) {
  if (totalPages <= 1) return null;

  const sz      = compact ? font.sizeSm  : font.sizeMd;
  const pad     = compact ? "3px 8px"   : "4px 12px";
  const wrapPad = compact ? "14px 0 2px" : "24px 0 8px";

  const btnStyle = (active, disabled) => ({
    padding:      pad,
    fontFamily:   font.mono,
    fontSize:     sz,
    background:   active ? colors.borderStrong : "transparent",
    border:       `1px solid ${active ? colors.borderFocus : colors.borderStrong}`,
    borderRadius: radius.md,
    color:        disabled ? colors.textGhost : active ? colors.textHigh : colors.textMuted,
    cursor:       disabled ? "default" : "pointer",
    minWidth:     compact ? 28 : 34,
    textAlign:    "center",
    fontWeight:   active ? 600 : 400,
    transition:   "all 0.1s",
  });

  const pages = getPageNumbers(page, totalPages);
  const handleClick = useCallback((p) => {
    console.log(p)
    p !== page && onPage(p)
  }, [pages])
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: compact ? 4 : 6, padding: wrapPad }}>
      {/* Prev arrow */}
      <button
        onClick={() => page > 1 && onPage(page - 1)}
        disabled={page <= 1}
        style={btnStyle(false, page <= 1)}
      >
        ←
      </button>

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`ellipsis-${i}`}
            style={{ fontFamily: font.mono, fontSize: sz, color: colors.textGhost, padding: `0 2px` }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => handleClick(p)}
            style={btnStyle(p === page, false)}
          >
            {p}
          </button>
        )
      )}

      {/* Next arrow */}
      <button
        onClick={() => page < totalPages && onPage(page + 1)}
        disabled={page >= totalPages}
        style={btnStyle(false, page >= totalPages)}
      >
        →
      </button>
    </div>
  );
}
