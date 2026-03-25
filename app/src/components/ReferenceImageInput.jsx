import { useRef, useState } from "react";
import { toBase64 } from "../lib/api";
import { REFERENCE_PURPOSES } from "../lib/constants";
import { colors, font, radius, fieldInput as FI } from "../theme";

/**
 * UrlReferenceInput — a small input + button for adding an image by URL.
 * Internal sub-component; only used inside ReferenceImageInput.
 *
 * @param {{ onAdd: (url: string) => void }} props
 */
function UrlReferenceInput({ onAdd }) {
  const [url,   setUrl]   = useState("");
  const [error, setError] = useState(null);

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
      onAdd(trimmed);
      setUrl("");
      setError(null);
    } catch {
      setError("Invalid URL");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter")  { e.preventDefault(); handleAdd(); }
    if (e.key === "Escape") { setUrl(""); setError(null); }
  };

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <div style={{ flex: 1, position: "relative" }}>
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Paste image URL…"
          style={{
            ...FI,
            borderColor: error ? `${colors.error}44` : "#1e1e1e",
            fontSize:    font.sizeMd,
            padding:     "8px 12px",
          }}
        />
        {error && (
          <div style={{
            position:   "absolute",
            top:        "calc(100% + 3px)",
            left:       0,
            color:      colors.error,
            fontFamily: font.mono,
            fontSize:   font.sizeXs,
          }}>
            {error}
          </div>
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={!url.trim()}
        style={{
          padding:      "8px 14px",
          borderRadius: radius.md,
          border:       `1px solid #1e1e1e`,
          background:   url.trim() ? colors.primary : "transparent",
          color:        url.trim() ? colors.primaryText : colors.textGhost,
          fontFamily:   font.mono,
          fontSize:     font.sizeMd,
          cursor:       url.trim() ? "pointer" : "not-allowed",
          transition:   "all 0.15s",
          whiteSpace:   "nowrap",
        }}
      >
        + Add URL
      </button>
    </div>
  );
}

/**
 * ReferenceImageInput — drag-and-drop + URL + file-browser reference image picker.
 *
 * Each image can have a purpose (composition, style, pose, scene) selected
 * via pill buttons after it is added.
 *
 * @param {{
 *   images: Array<{ src: string, isUrl: boolean, purpose: string }>,
 *   onChange: (updater: Function) => void
 * }} props
 */
export function ReferenceImageInput({ images, onChange }) {
  const inputRef   = useRef();
  const [dragging, setDragging] = useState(false);

  const addFiles = async (fileList) => {
    const srcs = await Promise.all(Array.from(fileList).map(toBase64));
    onChange((p) => [...p, ...srcs.map((src) => ({ src, isUrl: false, purpose: "composition" }))]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const updatePurpose = (i, purpose) => {
    onChange((p) => p.map((item, j) => (j === i ? { ...item, purpose } : item)));
  };

  const remove = (i) => {
    onChange((p) => p.filter((_, j) => j !== i));
  };

  return (
    <div>
      {/* Drop zone / file browser trigger */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border:         `1px dashed ${dragging ? colors.textMuted : colors.borderStrong}`,
          borderRadius:   radius.md,
          padding:        "12px 16px",
          cursor:         "pointer",
          background:     dragging ? colors.surfaceSink : "transparent",
          transition:     "all 0.15s",
          display:        "flex",
          alignItems:     "center",
          gap:            10,
          color:          colors.textGhost,
          fontFamily:     font.mono,
          fontSize:       font.sizeMd,
          marginBottom:   images.length > 0 ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 18 }}>+</span>
        <span>{dragging ? "Drop to add reference" : "Drop images or click to add reference photos"}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      <UrlReferenceInput
        onAdd={(url) => onChange((p) => [...p, { src: url, isUrl: true, purpose: "composition" }])}
      />

      {/* Image list with purpose selectors */}
      {images.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {images.map((item, i) => (
            <div key={i} style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              background:   colors.surface,
              border:       `1px solid ${colors.borderMid}`,
              borderRadius: radius.md,
              padding:      "8px 10px",
            }}>
              {/* Thumbnail */}
              <div style={{
                width:        52,
                height:       52,
                borderRadius: radius.md - 2,
                overflow:     "hidden",
                flexShrink:   0,
                border:       `1px solid #1e1e1e`,
                position:     "relative",
              }}>
                <img src={item.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {item.isUrl && (
                  <div style={{
                    position:   "absolute",
                    bottom:     1,
                    left:       1,
                    background: "rgba(0,0,0,0.75)",
                    borderRadius: 2,
                    padding:    "1px 3px",
                    color:      colors.textMuted,
                    fontFamily: font.mono,
                    fontSize:   8,
                  }}>ref</div>
                )}
              </div>

              {/* Purpose selector */}
              <div style={{ flex: 1 }}>
                <div style={{
                  color:         colors.textGhost,
                  fontFamily:    font.mono,
                  fontSize:      font.sizeXs,
                  marginBottom:  4,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}>
                  Purpose
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {REFERENCE_PURPOSES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => updatePurpose(i, p.value)}
                      title={p.hint}
                      style={{
                        padding:      "3px 10px",
                        borderRadius: radius.sm,
                        fontSize:     font.sizeSm,
                        fontFamily:   font.mono,
                        cursor:       "pointer",
                        border:       `1px solid ${item.purpose === p.value ? colors.primary : "#1e1e1e"}`,
                        background:   item.purpose === p.value ? colors.primary : "transparent",
                        color:        item.purpose === p.value ? colors.primaryText : colors.textDim,
                        transition:   "all 0.12s",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remove */}
              <button
                onClick={() => remove(i)}
                style={{
                  width:          22,
                  height:         22,
                  borderRadius:   "50%",
                  background:     "none",
                  border:         `1px solid #1e1e1e`,
                  color:          colors.textGhost,
                  fontSize:       font.sizeMd,
                  cursor:         "pointer",
                  flexShrink:     0,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  transition:     "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${colors.error}44`; e.currentTarget.style.color = colors.error; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = colors.textGhost; }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
