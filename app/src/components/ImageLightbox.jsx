import { useEffect } from "react";
import { colors, font, radius  } from "../theme";

/**
 * ImageLightbox — full-screen image viewer overlay.
 * Click the backdrop or press Escape to close.
 *
 * @param {{ src: string, upscale: (entry) => void, onClose: () => void, entry: object }} props
 */
export function ImageLightbox({ src, upscale, onClose, entry, onUpscale }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         2000,
        background:     "rgba(0,0,0,0.93)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        cursor:         "zoom-out",
        gap:           16,
        flexDirection: "column",
      }}
    >
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth:   "90vw",
          maxHeight:  "90vh",
          objectFit:  "contain",
          borderRadius: 8,
          cursor:     "default",
          boxShadow:  "0 24px 80px rgba(0,0,0,0.8)",
        }}
      />
      <div>
        {
          upscale && 
            <button
              onClick={() => upscale(entry)}
              style={{ padding: "4px 10px", background: colors.bg, border: `1px solid ${colors.borderMid}`, borderRadius: radius.md - 2, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.borderFocus; e.currentTarget.style.color = colors.textHigh; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderMid; e.currentTarget.style.color = colors.textMuted; }}
            >
              Upscale
            </button>
        }
      </div>
    </div>
  );
}
