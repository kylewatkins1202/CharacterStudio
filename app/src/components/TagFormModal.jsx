import { useState } from "react";
import { api } from "../lib/api";
import { ImageUploadGrid } from "./ImageUploadGrid";
import { AssetPickerModal } from "./AssetPickerModal";
import { TYPE_COLOR, TYPE_ICON, colors, font, radius, fieldLabel as FL, fieldInput as FI } from "../theme";

/**
 * TagFormModal — modal for creating or editing a tag.
 *
 * Each asset group supports both uploading new images and picking existing assets
 * from the asset library.
 */
export function TagFormModal({ existingTag, onClose, onSave, toast }) {
  const isEdit = !!existingTag;

  const [type,       setType]       = useState(existingTag?.type || null);
  const [key,        setKey]        = useState(existingTag?.key || "");
  const [basicDesc,  setBasicDesc]  = useState(existingTag?.lock?.basicDescription || "");
  const [appearDesc, setAppearDesc] = useState(existingTag?.lock?.appearanceDescription || "");
  const [bodyDesc,   setBodyDesc]   = useState(existingTag?.lock?.bodyDescription || "");
  // Base64 images staged for upload, keyed by group
  const [imgs,       setImgs]       = useState({ face: [], body: [], prop: [], outfit: [], location: [] });
  // Existing assets selected from the library, keyed by group
  const [picked,     setPicked]     = useState({ face: [], body: [], prop: [], outfit: [], location: [] });
  // Which group's asset picker is open (null = none)
  const [pickerGroup, setPickerGroup] = useState(null);
  const [saving,     setSaving]     = useState(false);

  const addImgs   = (g, a) => setImgs((p)   => ({ ...p, [g]: [...p[g],   ...a] }));
  const removeImg = (g, i) => setImgs((p)   => ({ ...p, [g]: p[g].filter((_, j) => j !== i) }));
  const removePicked = (g, id) => setPicked((p) => ({ ...p, [g]: p[g].filter((a) => a.id !== id) }));

  const handlePickAssets = (assets) => {
    setPicked((p) => ({ ...p, [pickerGroup]: [...p[pickerGroup], ...assets] }));
  };

  const save = async () => {
    if (!key.trim()) return toast.add("Key is required", "error");
    if (!type)       return toast.add("Select a type", "error");
    setSaving(true);
    try {
      // 1. Create/update the tag with base64 uploads
      const res = await api.post("/tag", {
        key: key.trim(),
        type,
        basicDescription:      basicDesc,
        appearanceDescription: appearDesc,
        bodyDescription:       bodyDesc,
        ...imgs,
      });
      if (!res.ok) { toast.add(res.error || "Save failed", "error"); setSaving(false); return; }

      const tagKey = res.tag.key;

      // 2. Assign any picked existing assets to the tag
      for (const [group, assets] of Object.entries(picked)) {
        for (const asset of assets) {
          await api.post(`/tags/${tagKey}/assets/${asset.id}`, { group });
        }
      }

      // 3. Fetch the final tag with all assets populated
      const finalRes = await api.get(`/tags/${tagKey}`);
      toast.add(isEdit ? "Tag updated!" : "Tag created!", "success");
      onSave(finalRes.ok ? finalRes.tag : res.tag);
    } catch {
      toast.add("Network error", "error");
    }
    setSaving(false);
  };

  // ── Shared image section renderer ────────────────────────────────────────

  const renderGroupSection = (group, label) => {
    const groupPicked = picked[group] || [];
    const alreadyPickedIds = groupPicked.map((a) => a.id);

    return (
      <div key={group}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={FL}>{label}</label>
          <button
            onClick={() => setPickerGroup(group)}
            style={{
              padding:      "3px 10px",
              background:   "none",
              border:       `1px solid ${colors.borderStrong}`,
              borderRadius: radius.sm,
              color:        colors.textMuted,
              fontFamily:   font.mono,
              fontSize:     font.sizeSm,
              cursor:       "pointer",
            }}
          >
            From assets
          </button>
        </div>

        <ImageUploadGrid
          label=""
          files={imgs[group]}
          onAdd={(a) => addImgs(group, a)}
          onRemove={(i) => removeImg(group, i)}
        />

        {/* Picked existing assets */}
        {groupPicked.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8, marginTop: 8 }}>
            {groupPicked.map((asset) => {
              const fallback = asset.assetPath
                ? "/api/assets/" + asset.assetPath.split("/").map(encodeURIComponent).join("/")
                : null;
              return (
                <div key={asset.id} style={{ position: "relative", aspectRatio: "1", borderRadius: radius.md, overflow: "hidden", border: `1px solid ${colors.primary}44` }}>
                  <img
                    src={asset.url}
                    onError={(e) => { if (fallback && e.target.src !== fallback) e.target.src = fallback; }}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div style={{ position: "absolute", top: 2, left: 3, background: "rgba(0,0,0,0.7)", borderRadius: 2, padding: "1px 4px", color: colors.primary, fontFamily: font.mono, fontSize: 8 }}>asset</div>
                  <button
                    onClick={() => removePicked(group, asset.id)}
                    style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "none", color: colors.error, fontSize: font.sizeMd, cursor: "pointer" }}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {pickerGroup && (
        <AssetPickerModal
          title={`Pick ${pickerGroup} images`}
          excludeIds={(picked[pickerGroup] || []).map((a) => a.id)}
          onClose={() => setPickerGroup(null)}
          onSelect={handlePickAssets}
        />
      )}

      <div style={{ background: colors.surfaceModal, border: `1px solid #1e1e1e`, borderRadius: radius.xxl, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 22 }}>
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
                    padding: "12px 8px", borderRadius: radius.md,
                    border: `1px solid ${type === t ? TYPE_COLOR[t] : "#1e1e1e"}`,
                    background: type === t ? TYPE_COLOR[t] + "11" : "#0a0a0a",
                    color: type === t ? TYPE_COLOR[t] : colors.textDim,
                    fontFamily: font.mono, fontSize: font.sizeMd, cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    transition: "all 0.15s",
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
          {renderGroupSection("face", "Face Images")}
          {renderGroupSection("body", "Body Images")}
        </>)}

        {type === "prop" && (<>
          <div>
            <label style={FL}>Description</label>
            <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2}
              placeholder="Describe the prop…"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          {renderGroupSection("prop", "Images")}
        </>)}

        {type === "outfit" && (<>
          <div>
            <label style={FL}>Description</label>
            <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2}
              placeholder="Describe the outfit…"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          {renderGroupSection("outfit", "Images")}
        </>)}

        {type === "location" && (<>
          <div>
            <label style={FL}>Description</label>
            <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2}
              placeholder="Describe the location…"
              style={{ ...FI, resize: "vertical" }} />
          </div>
          {renderGroupSection("location", "Images")}
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
              padding: "10px 24px",
              background: (!type || saving) ? "#111" : colors.primary,
              border: "none", borderRadius: radius.md,
              color: (!type || saving) ? colors.textGhost : colors.primaryText,
              fontFamily: font.mono, fontSize: font.sizeLg, fontWeight: 600,
              cursor: (saving || !type) ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {saving ? "Saving…" : isEdit ? "Update" : "Create Tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
