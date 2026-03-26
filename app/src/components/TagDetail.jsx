import { useState } from "react";
import { api } from "../lib/api";
import { TagPill } from "./TagPill";
import { ImageUploadGrid } from "./ImageUploadGrid";
import { AssetPickerModal } from "./AssetPickerModal";
import { colors, font, radius, fieldLabel as FL } from "../theme";

/**
 * TagDetail — slide-in modal showing a tag's images, lock descriptions,
 * and controls to add/delete images or delete the whole tag.
 */
export function TagDetail({ tag, onClose, onUpdated, onDeleted, toast }) {
  // The asset group currently expanded for adding new images (null when closed)
  const [addingGroup,  setAddingGroup]  = useState(null);
  // Staged base64 images before they are uploaded
  const [newImgs,      setNewImgs]      = useState([]);
  // Which group's AssetPickerModal is open (null = none)
  const [pickerGroup,  setPickerGroup]  = useState(null);
  // True while an upload or assign API call is in-flight
  const [saving,       setSaving]       = useState(false);
  // True when the delete-confirmation dialog is shown
  const [confirmDelete, setConfirmDelete] = useState(false);

  const groups =
    tag.type === "character" ? ["face", "body"] :
    tag.type === "prop"      ? ["prop"]          :
    tag.type === "outfit"    ? ["outfit"]        :
                               ["location"];

  const openAddPanel = (group) => {
    setAddingGroup(group);
    setNewImgs([]);
  };

  // ── Upload new images ──────────────────────────────────────────────────────

  const handleAddImages = async () => {
    if (!newImgs.length) return toast.add("Add some images first", "error");
    setSaving(true);
    try {
      const res = await api.post(`/tags/${tag.key}/images`, { [addingGroup]: newImgs });
      if (res.ok) {
        toast.add("Images added!", "success");
        onUpdated(res.tag);
        setAddingGroup(null);
        setNewImgs([]);
      } else {
        toast.add(res.error || "Failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
    setSaving(false);
  };

  // ── Assign existing assets from picker ────────────────────────────────────

  const handlePickAssets = async (assets) => {
    if (!assets.length) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        assets.map((a) => api.post(`/tags/${tag.key}/assets/${a.id}`, { group: addingGroup }))
      );
      const lastOk = results.filter((r) => r.ok).at(-1);
      if (lastOk) {
        toast.add("Assets assigned!", "success");
        onUpdated(lastOk.tag);
        setAddingGroup(null);
      } else {
        toast.add(results[0]?.error || "Failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
    setSaving(false);
  };

  // ── Delete image (unassigns the asset) ────────────────────────────────────

  const handleDeleteImage = async (group, id) => {
    try {
      const res = await api.delete(`/tags/${tag.key}/images`, { [group]: [id] });
      if (res.ok) { toast.add("Image removed", "success"); onUpdated(res.tag); }
      else toast.add(res.error || "Failed", "error");
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleDeleteTag = async () => {
    try {
      const res = await api.delete(`/tags/${tag.key}`);
      if (res.ok) { toast.add(`@${tag.key} deleted`, "success"); onDeleted(tag.key); }
      else toast.add(res.error || "Failed", "error");
    } catch {
      toast.add("Network error", "error");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
      {pickerGroup && (
        <AssetPickerModal
          title={`Pick ${pickerGroup} images`}
          excludeIds={(tag.assets[pickerGroup] || []).map((a) => a.id)}
          onClose={() => setPickerGroup(null)}
          onSelect={(assets) => { setPickerGroup(null); handlePickAssets(assets); }}
        />
      )}

      <div style={{
        background:    colors.surfaceModal,
        border:        `1px solid #1e1e1e`,
        borderRadius:  radius.xxl,
        width:         "100%",
        maxWidth:      720,
        maxHeight:     "90vh",
        overflow:      "auto",
        padding:       32,
        display:       "flex",
        flexDirection: "column",
        gap:           22,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: font.serif, fontSize: font.sizeSubhead, color: colors.textHigh, margin: 0 }}>
              @{tag.key}
            </h2>
            <TagPill type={tag.type} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ padding: "6px 14px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md - 2, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${colors.error}66`; e.currentTarget.style.color = colors.error; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderStrong; e.currentTarget.style.color = colors.textMuted; }}
            >
              Delete tag
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: colors.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
          </div>
        </div>

        {/* Lock descriptions */}
        {(tag.lock?.basicDescription || tag.lock?.appearanceDescription || tag.lock?.bodyDescription) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tag.lock?.basicDescription      && <div><div style={FL}>Description</div><p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, margin: 0, lineHeight: 1.7 }}>{tag.lock.basicDescription}</p></div>}
            {tag.lock?.appearanceDescription && <div><div style={FL}>Appearance</div> <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, margin: 0, lineHeight: 1.7 }}>{tag.lock.appearanceDescription}</p></div>}
            {tag.lock?.bodyDescription       && <div><div style={FL}>Body</div>       <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, margin: 0, lineHeight: 1.7 }}>{tag.lock.bodyDescription}</p></div>}
          </div>
        )}

        {/* Asset groups */}
        {groups.map((group) => {
          const assets = tag.assets[group] || [];
          return (
            <div key={group}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={FL}>{group} ({assets.length})</div>
                {addingGroup !== group && (
                  <button
                    onClick={() => openAddPanel(group)}
                    style={{ padding: "3px 10px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.sm, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer" }}
                  >
                    + Add
                  </button>
                )}
              </div>

              {assets.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, marginBottom: addingGroup === group ? 12 : 0 }}>
                  {assets.map((asset) => (
                    <div key={asset.id} style={{ position: "relative", aspectRatio: "1", borderRadius: radius.md, overflow: "hidden", border: `1px solid ${colors.borderMid}` }}>
                      <img src={asset.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        onClick={() => handleDeleteImage(group, asset.id)}
                        title="Remove from tag"
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "none", color: colors.error, fontSize: font.sizeMd, cursor: "pointer" }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {assets.length === 0 && addingGroup !== group && (
                <div style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, padding: "8px 0" }}>No images yet</div>
              )}

              {/* ── Add panel ────────────────────────────────────────────── */}
              {addingGroup === group && (
                <div style={{ background: colors.surfaceDeep, border: `1px solid ${colors.borderMid}`, borderRadius: radius.lg, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <ImageUploadGrid
                    label={`New ${group} images`}
                    files={newImgs}
                    onAdd={(a) => setNewImgs((p) => [...p, ...a])}
                    onRemove={(i) => setNewImgs((p) => p.filter((_, j) => j !== i))}
                  />
                  <button
                    onClick={() => setPickerGroup(group)}
                    style={{
                      padding:      "7px 14px",
                      background:   "none",
                      border:       `1px solid ${colors.borderStrong}`,
                      borderRadius: radius.md - 1,
                      color:        colors.textMuted,
                      fontFamily:   font.mono,
                      fontSize:     font.sizeMd,
                      cursor:       "pointer",
                      textAlign:    "left",
                    }}
                  >
                    + From assets
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => { setAddingGroup(null); setNewImgs([]); }}
                      style={{ padding: "7px 14px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md - 1, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddImages}
                      disabled={saving || !newImgs.length}
                      style={{ padding: "7px 18px", background: newImgs.length ? colors.primary : colors.borderMid, border: "none", borderRadius: radius.md - 1, color: newImgs.length ? colors.primaryText : colors.textGhost, fontFamily: font.mono, fontSize: font.sizeMd, fontWeight: 600, cursor: (saving || !newImgs.length) ? "not-allowed" : "pointer" }}
                    >
                      {saving ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Metadata footer */}
        <div style={{ color: colors.borderMid, fontFamily: font.mono, fontSize: font.sizeSm, paddingTop: 4 }}>
          Created {tag.meta?.createdAt ? new Date(tag.meta.createdAt).toLocaleDateString() : "—"} · Updated {tag.meta?.updatedAt ? new Date(tag.meta.updatedAt).toLocaleDateString() : "—"}
        </div>
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: colors.surfaceModal, border: `1px solid ${colors.borderStrong}`, borderRadius: radius.xl, padding: 28, maxWidth: 360, width: "100%" }}>
            <h3 style={{ fontFamily: font.serif, color: colors.textHigh, margin: "0 0 10px" }}>Delete @{tag.key}?</h3>
            <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, margin: "0 0 20px" }}>
              This permanently removes the tag. All its images will be unassigned (not deleted).
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: "8px 16px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeLg, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTag}
                style={{ padding: "8px 20px", background: colors.error, border: "none", borderRadius: radius.md, color: colors.text, fontFamily: font.mono, fontSize: font.sizeLg, fontWeight: 600, cursor: "pointer" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
