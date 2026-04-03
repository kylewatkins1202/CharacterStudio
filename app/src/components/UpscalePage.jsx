import { useState } from "react";
import { api } from "../lib/api";
import { ReferenceImageInput } from "./ReferenceImageInput";
import { colors, font, radius, fieldLabel as FL } from "../theme";

const RESOLUTIONS = ["2k", "4k", "8k"];

export function UpscalePage({ toast, images, onImagesChange }) {
  const [resolution, setResolution] = useState("4k");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { url, localUrl }

  const upscale = async () => {
    if (images.length === 0) return toast.add("Select an image to upscale", "error");
    setLoading(true);
    setResult(null);
    try {
      const img = images[0];
      const res = await api.post("/image/upscale", {
        image: img,
        targetResolution: resolution,
      });
      if (res.ok) {
        setResult(res);
        toast.add("Upscale complete!", "success");
      } else {
        toast.add(res.error || "Upscale failed", "error");
      }
    } catch (err) {
      toast.add(err.message || "Network error", "error");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: font.serif, fontSize: font.sizeHeading, fontWeight: 700, color: colors.textHigh, margin: 0, letterSpacing: "-0.02em" }}>
          Upscale
        </h1>
        <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeLg, marginTop: 6 }}>
          Enhance image resolution via WaveSpeed AI
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Image picker */}
        <div>
          <label style={FL}>
            Source Image{" "}
            <span style={{ color: colors.borderStrong, fontWeight: 400 }}>— select one image to upscale</span>
          </label>
          <ReferenceImageInput images={images} onChange={onImagesChange} maxImages={1} />
        </div>

        {/* Resolution */}
        <div>
          <label style={FL}>Target Resolution</label>
          <div style={{ display: "flex", gap: 6 }}>
            {RESOLUTIONS.map((r) => {
              const active = resolution === r;
              return (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  disabled={loading}
                  style={{
                    padding:      "6px 20px",
                    borderRadius: radius.md,
                    border:       `1px solid ${active ? colors.primary : "#1e1e1e"}`,
                    background:   active ? colors.primary : "transparent",
                    color:        active ? colors.primaryText : colors.textMuted,
                    fontFamily:   font.mono,
                    fontSize:     font.sizeMd,
                    cursor:       loading ? "not-allowed" : "pointer",
                    transition:   "all 0.15s",
                    textTransform: "uppercase",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Upscale button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={upscale}
            disabled={loading || images.length === 0}
            style={{
              padding:      "10px 32px",
              background:   (loading || images.length === 0) ? "#111" : colors.primary,
              color:        (loading || images.length === 0) ? colors.textGhost : colors.primaryText,
              border:       "none",
              borderRadius: radius.md,
              fontFamily:   font.mono,
              fontSize:     font.sizeLg,
              fontWeight:   600,
              cursor:       (loading || images.length === 0) ? "not-allowed" : "pointer",
              transition:   "all 0.2s",
              whiteSpace:   "nowrap",
            }}
          >
            {loading ? "Upscaling\u2026" : "Upscale \u2192"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 0" }}>
            <div style={{ width: 40, height: 40, border: "2px solid #1e1e1e", borderTop: "2px solid #666", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <span style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: font.sizeMd }}>Upscaling\u2026</span>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...FL, marginBottom: 8 }}>Result \u2014 {resolution.toUpperCase()}</div>
            <img
              src={result.localUrl || result.url}
              alt="Upscaled"
              style={{ width: "100%", borderRadius: radius.xl, border: `1px solid ${colors.borderMid}`, display: "block" }}
            />
            <a
              href={result.localUrl || result.url}
              download
              style={{
                display:      "inline-block",
                marginTop:    12,
                padding:      "7px 18px",
                background:   "transparent",
                border:       `1px solid ${colors.borderStrong}`,
                borderRadius: radius.md,
                color:        colors.textMuted,
                fontFamily:   font.mono,
                fontSize:     font.sizeMd,
                textDecoration: "none",
                transition:   "all 0.15s",
              }}
            >
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
