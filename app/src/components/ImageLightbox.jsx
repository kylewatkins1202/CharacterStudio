import { useEffect } from "react";

/**
 * ImageLightbox — full-screen image viewer overlay.
 * Click the backdrop or press Escape to close.
 *
 * @param {{ src: string, onClose: () => void }} props
 */
export function ImageLightbox({ src, onClose }) {
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
    </div>
  );
}
