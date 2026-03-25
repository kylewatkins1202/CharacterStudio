import { useRef, useState } from "react";
import { toBase64 } from "../lib/api";
import { colors, font, radius } from "../theme";

/**
 * ImageUploadGrid — displays a grid of uploaded image thumbnails with
 * a drag-and-drop drop zone and a click-to-browse "+" button.
 *
 * @param {{
 *   label: string,
 *   files: string[],
 *   onAdd: (base64s: string[]) => void,
 *   onRemove: (index: number) => void
 * }} props
 */
export function ImageUploadGrid({ label, files, onAdd, onRemove }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const addFiles = async (fileList) => {
    const b64s = await Promise.all(Array.from(fileList).map(toBase64));
    onAdd(b64s);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => {
        // Only clear dragging state when leaving the entire grid, not a child element
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={handleDrop}
      style={{
        border:     `1px solid ${dragging ? colors.borderFocus : "transparent"}`,
        borderRadius: radius.lg,
        padding:    dragging ? 6 : 0,
        transition: "all 0.15s",
        background: dragging ? colors.surfaceDeep : "transparent",
      }}
    >
      <label style={{
        display:       "block",
        color:         dragging ? colors.textMuted : colors.textDim,
        fontFamily:    font.mono,
        fontSize:      font.sizeSm,
        marginBottom:  8,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        transition:    "color 0.15s",
      }}>
        {label}{dragging ? " — drop to add" : ""}
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
        {files.map((src, i) => (
          <div key={i} style={{
            position:    "relative",
            aspectRatio: "1",
            borderRadius: radius.md,
            overflow:    "hidden",
            border:      `1px solid ${colors.borderMid}`,
          }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button
              onClick={() => onRemove(i)}
              style={{
                position: "absolute", top: 4, right: 4,
                width: 20, height: 20, borderRadius: "50%",
                background: "rgba(0,0,0,0.8)", border: "none",
                color: colors.text, fontSize: font.sizeMd, cursor: "pointer",
              }}
            >×</button>
          </div>
        ))}

        {/* Add button */}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            aspectRatio:    "1",
            borderRadius:   radius.md,
            border:         `1px dashed ${dragging ? colors.borderFocus : colors.borderStrong}`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         "pointer",
            color:          dragging ? colors.borderFocus : colors.textGhost,
            fontSize:       22,
            transition:     "all 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.borderFocus)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = dragging ? colors.borderFocus : colors.borderStrong)}
        >
          +
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>
      </div>
    </div>
  );
}
