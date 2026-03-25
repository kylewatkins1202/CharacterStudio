import { useState } from "react";
import { api } from "../lib/api";
import { ImageUploadGrid } from "./ImageUploadGrid";
import { TYPE_COLOR, TYPE_ICON, colors, font, radius, fieldLabel as FL, fieldInput as FI } from "../theme";

/**
 * TagFormModal — modal for creating a new tag.
 *
 * Collects tag type, key, lock descriptions, and optional images,
 * then POSTs to /api/tag.
 *
 * @param {{
 *   existingTag?: object,
 *   onClose: () => void,
 *   onSave: (tag: object) => void,
 *   toast: { add: Function }
 * }} props
 */
export function TagFormModal({ existingTag, onClose, onSave, toast }) {
  // True when editing an existing tag, false when creating a new one
  const isEdit = !!existingTag;

  // Tag type — one of "character" | "prop" | "outfit" | "location"
  const [type,       setType]       = useState(existingTag?.type || null);
  // Tag key — unique identifier used in @-mentions
  const [key,        setKey]        = useState(existingTag?.key || "");
  // General description (props, outfits, locations)
  const [basicDesc,  setBasicDesc]  = useState(existingTag?.lock?.basicDescription || "");
  // Visual appearance description (characters)
  const [appearDesc, setAppearDesc] = useState(existingTag?.lock?.appearanceDescription || "");
  // Body / physique description (characters)
  const [bodyDesc,   setBodyDesc]   = useState(existingTag?.lock?.bodyDescription || "");
  // Staged base64 images keyed by asset group, pending upload on save
  const [imgs,       setImgs]       = useState({ face: [], body: [], prop: [], outfit: [], location: [] });
  // True while the save API call is in-flight
  const [saving,     setSaving]     = useState(false);

  // Append base64 strings to an asset group's staging array
  const addImgs   = (g, a) => setImgs((p) => ({ ...p, [g]: [...p[g], ...a] }));
  // Remove the image at index i from an asset group's staging array
  const removeImg = (g, i) => setImgs((p) => ({ ...p, [g]: p[g].filter((_, j) => j !== i) }));

  const save = async () => {
    // Guard: key and type are required before submitting
    if (!key.trim()) return toast.add("Key is required", "error");
    if (!type)       return toast.add("Select a type", "error");
    // Set in-flight state
    setSaving(true);
    try {
      // POST to /tag with all form fields and staged images
      const res = await api.post("/tag", {
        key: key.trim(),
        type,
        basicDescription:    basicDesc,
        appearanceDescription: appearDesc,
        bodyDescription:     bodyDesc,
        ...imgs,
      });
      if (res.ok) {
        // Show success and pass the saved tag to the parent
        toast.add(isEdit ? "Tag updated!" : "Tag created!", "success");
        onSave(res.tag);
      } else {
        toast.add(res.error || "Save failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
    setSaving(false);
  };

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(0,0,0,0.85)",
        zIndex:         1000,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background:    colors.surfaceModal,
        border:        `1px solid #1e1e1e`,
        borderRadius:  radius.xxl,
        width:         "100%",
        maxWidth:      640,
        maxHeight:     "90vh",
        overflow:      "auto",
        padding:       32,
        display:       "flex",
        flexDirection: "column",
        gap:           22,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: font.serif, fontSize: font.sizeSubhead, color: colors.textHigh, margin: 0 }}>
            {isEdit ? `Edit — ${existingTag.key}` : "New Tag"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: colors.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Type picker (create only) */}
        {!isEdit && (
          <div>
            <label style={FL}>Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {["character", "prop", "location", "outfit"].map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    padding:        "12px 8px",
                    borderRadius:   radius.md,
                    border:         `1px solid ${type === t ? TYPE_COLOR[t] : "#1e1e1e"}`,
                    background:     type === t ? TYPE_COLOR[t] + "11" : "#0a0a0a",
                    color:          type === t ? TYPE_COLOR[t] : colors.textDim,
                    fontFamily:     font.mono,
                    fontSize:       font.sizeMd,
                    cursor:         "pointer",
                    display:        "flex",
                    flexDirection:  "column",
                    alignItems:     "center",
                    gap:            4,
                    transition:     "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{TYPE_ICON[t]}</span>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Key */}
        <div>
          <label style={FL}>Key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.replace(/\s/g, "_").toLowerCase())}
            disabled={isEdit}
            placeholder="e.g. aria_chen"
            style={{ ...FI, color: isEdit ? colors.textDim : colors.text }}
          />
          <div style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, marginTop: 4 }}>
            Referenced as <span style={{ color: colors.textDim }}>@{key || "key"}</span>
          </div>
        </div>

        {/* Type-specific fields */}
        {type === "character" && (<>
          <div>
            <label style={FL}>Appearance Description</label>
            <textarea value={appearDesc} onChange={(e) => setAppearDesc(e.target.value)} rows={2}
              placeholder="Face, hair, skin… (auto-generated by vision if blank)"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          <div>
            <label style={FL}>Body Description</label>
            <textarea value={bodyDesc} onChange={(e) => setBodyDesc(e.target.value)} rows={2}
              placeholder="Physique, proportions… (auto-generated by vision if blank)"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          <ImageUploadGrid label="Face Images" files={imgs.face} onAdd={(a) => addImgs("face", a)} onRemove={(i) => removeImg("face", i)} />
          <ImageUploadGrid label="Body Images" files={imgs.body} onAdd={(a) => addImgs("body", a)} onRemove={(i) => removeImg("body", i)} />
        </>)}

        {type === "prop" && (<>
          <div>
            <label style={FL}>Description</label>
            <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2}
              placeholder="Describe the prop… (auto-generated by vision if blank)"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          <ImageUploadGrid label="Images" files={imgs.prop} onAdd={(a) => addImgs("prop", a)} onRemove={(i) => removeImg("prop", i)} />
        </>)}

        {type === "outfit" && (<>
          <div>
            <label style={FL}>Description</label>
            <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2}
              placeholder="Describe the outfit… (auto-generated by vision if blank)"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          <ImageUploadGrid label="Images" files={imgs.outfit} onAdd={(a) => addImgs("outfit", a)} onRemove={(i) => removeImg("outfit", i)} />
        </>)}

        {type === "location" && (<>
          <div>
            <label style={FL}>Description</label>
            <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2}
              placeholder="Describe the location… (auto-generated by vision if blank)"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          <ImageUploadGrid label="Images" files={imgs.location} onAdd={(a) => addImgs("location", a)} onRemove={(i) => removeImg("location", i)} />
        </>)}

        {!type && (
          <div style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeMd, textAlign: "center", padding: "8px 0" }}>
            Select a type above to continue
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeLg, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !type}
            style={{
              padding:      "10px 24px",
              background:   (!type || saving) ? "#111" : colors.primary,
              border:       "none",
              borderRadius: radius.md,
              color:        (!type || saving) ? colors.textGhost : colors.primaryText,
              fontFamily:   font.mono,
              fontSize:     font.sizeLg,
              fontWeight:   600,
              cursor:       (saving || !type) ? "not-allowed" : "pointer",
              transition:   "all 0.15s",
            }}
          >
            {saving ? "Saving…" : isEdit ? "Update" : "Create Tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
