import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { Pagination } from "./Pagination";
import { colors, font, radius } from "../theme";
import { AssetStore } from "../../../shared/stores/AssetStore";

// ─── AssetPickerModal ─────────────────────────────────────────────────────────

export function AssetPickerModal({ onClose, onSelect, title = "Pick from assets", excludeIds = [] }) {

  const [selected,     setSelected]     = useState(new Set());
  const [showAll,      setShowAll]      = useState(false);
  const state = AssetStore.useState()

  const {
    folders,
    assets,
    total,
    page,
    loading,
    showHidden,
    selectedFolder
  } = state

  // Calculate total pages
  const totalPages = Math.ceil(total / 40) || 1;

  // Pagination
  const [pageSize]                  = useState(40);

  const load = useCallback((p = 1, hidden = showHidden, folder = selectedFolder) => {
    console.log(p)
    const hiddenParam  = hidden ? "" : "&hidden=false";
    const folderParam  = folder ? `&folder=${encodeURIComponent(folder)}` : "";
    AssetStore.actions.LOAD_ASSETS({ page: p, showHidden: hidden, folder })
  }, [pageSize, showHidden, selectedFolder]);

  // Load folder list once on mount
  useEffect(() => {
    AssetStore.actions.LOAD_FOLDERS()
  }, []);

  useEffect(() => { load(1); }, [load]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleHidden = async (asset) => {
    try {
      const res = await AssetStore.actions.TOGGLE_HIDDEN(asset)
      if (!res?.ok) { toast.add(res.error || "Update failed", "error"); return; }
      AssetStore.actions.UPDATE_ASSET({ id: asset.id, hidden: !asset.hidden });
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleToggleShowHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    if (!next) setShowAll(false);
    load(1, next);
  };

  const handleConfirm = () => {
    const picked = assets.filter((a) => selected.has(a.id));
    onSelect(picked);
    onClose();
  };

  const handleFolderSwitch = (name) => {
    setSelected(new Set());
    setShowAll(false);
    AssetStore.actions.SET_FOLDER(name);
    AssetStore.actions.LOAD_ASSETS({ folder: name, showHidden: false, page: 1 });
  }
  const hiddenCount = assets.filter((a) => a.hidden && !excludeIds.includes(a.id)).length;
  const visible     = assets.filter((a) => !excludeIds.includes(a.id));

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(0,0,0,0.9)",
        zIndex:         1100,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "flex-start",
        paddingTop:     40,
        overflowY:      "auto",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background:    colors.surfaceModal,
        border:        `1px solid ${colors.borderMid}`,
        borderRadius:  radius.xxl,
        width:         "100%",
        maxWidth:      860,
        maxHeight:     "82vh",
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        margin:        "0 24px 40px",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${colors.border}` }}>
          <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: colors.textMid, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {title}
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {showHidden && (
              <button
                onClick={() => setShowAll((v) => !v)}
                style={{
                  padding:      "4px 10px",
                  background:   showAll ? colors.borderMid : "transparent",
                  border:       `1px solid ${colors.borderStrong}`,
                  borderRadius: radius.md,
                  color:        colors.textMuted,
                  fontFamily:   font.mono,
                  fontSize:     font.sizeSm,
                  cursor:       "pointer",
                  transition:   "all 0.15s",
                }}
              >
                {showAll ? "Hide all" : "Show all"}
              </button>
            )}
            {(
              <button
                onClick={handleToggleShowHidden}
                style={{
                  padding:      "4px 10px",
                  background:   showHidden ? colors.borderMid : "transparent",
                  border:       `1px solid ${showHidden ? colors.borderStrong : colors.border}`,
                  borderRadius: radius.md,
                  color:        showHidden ? colors.textMuted : colors.borderStrong,
                  fontFamily:   font.mono,
                  fontSize:     font.sizeSm,
                  cursor:       "pointer",
                  transition:   "all 0.15s",
                }}
              >
                {showHidden ? "Hide hidden" : `Show hidden`}
              </button>
            )}
            {selected.size > 0 && (
              <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>
                {selected.size} selected
              </span>
            )}
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              style={{
                padding:      "6px 16px",
                background:   selected.size > 0 ? colors.primary : colors.borderMid,
                border:       "none",
                borderRadius: radius.md,
                color:        selected.size > 0 ? colors.primaryText : colors.textGhost,
                fontFamily:   font.mono,
                fontSize:     font.sizeMd,
                fontWeight:   600,
                cursor:       selected.size > 0 ? "pointer" : "not-allowed",
              }}
            >
              {selected.size > 0 ? `Add ${selected.size}` : "Add"}
            </button>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: colors.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
            >×</button>
          </div>
        </div>

        {/* Folder tabs */}
        {folders.length > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: `1px solid ${colors.border}`, overflowX: "auto", flexShrink: 0 }}>
            <button
              onClick={() => { handleFolderSwitch('') }}
              style={{
                padding:      "4px 12px",
                background:   selectedFolder === null ? colors.borderMid : "transparent",
                border:       `1px solid ${selectedFolder === null ? colors.borderStrong : colors.border}`,
                borderRadius: radius.md,
                color:        selectedFolder === null ? colors.textMid : colors.textMuted,
                fontFamily:   font.mono,
                fontSize:     font.sizeSm,
                cursor:       "pointer",
                whiteSpace:   "nowrap",
                transition:   "all 0.15s",
              }}
            >All</button>
            {folders.map((f) => (
              <button
                key={f.name}
                onClick={() => { handleFolderSwitch(f.name)}}
                style={{
                  padding:      "4px 12px",
                  background:   selectedFolder === f.name ? colors.borderMid : "transparent",
                  border:       `1px solid ${selectedFolder === f.name ? colors.borderStrong : colors.border}`,
                  borderRadius: radius.md,
                  color:        selectedFolder === f.name ? colors.textMid : colors.textMuted,
                  fontFamily:   font.mono,
                  fontSize:     font.sizeSm,
                  cursor:       "pointer",
                  whiteSpace:   "nowrap",
                  transition:   "all 0.15s",
                }}
              >
                {f.name} <span style={{ color: colors.textGhost, fontSize: 10 }}>({f.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>
          {loading ? (
            <div style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: 12, textAlign: "center", padding: 40 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: 12, textAlign: "center", padding: 40 }}>
              {total === 0
                ? "No assets yet. Upload images in the Assets page first."
                : "All assets are hidden — use the button above to show them."}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                {visible.map((asset) => {
                  const isSelected = selected.has(asset.id);
                  const isHidden   = Boolean(asset.hidden);
                  const isRevealed = showAll && isHidden;
                  const blurred    = isHidden && !isRevealed;
                  const primary    = asset.assetPath ? `/api/assets/${asset.id}/thumb` : asset.url;
                  const fallback   = asset.assetPath
                    ? "/api/assets/" + asset.assetPath.split("/").map(encodeURIComponent).join("/")
                    : asset.url;
                  return (
                    <div
                      key={asset.id}
                      onClick={() => toggle(asset.id)}
                      style={{
                        position:     "relative",
                        aspectRatio:  "1",
                        borderRadius: radius.md,
                        overflow:     "hidden",
                        border:       `2px solid ${isSelected ? colors.primary : colors.borderMid}`,
                        cursor:       "pointer",
                        transition:   "border-color 0.15s",
                        opacity:      isHidden && !showAll ? 0.5 : 1,
                      }}
                    >
                      <img
                        src={primary}
                        onError={(e) => { if (e.target.src !== fallback) e.target.src = fallback; }}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", filter: blurred ? "blur(12px)" : "none", transition: "filter 0.2s" }}
                      />
                      {isSelected && (
                        <div style={{
                          position:       "absolute",
                          inset:          0,
                          background:     colors.primaryA40,
                          display:        "flex",
                          alignItems:     "center",
                          justifyContent: "center",
                        }}>
                          <span style={{ color: "#fff", fontSize: 22, lineHeight: 1, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>✓</span>
                        </div>
                      )}
                      {/* Hide / unhide toggle */}
                      <button
                        onClick={(e) => handleToggleHidden(e, asset)}
                        style={{
                          position:     "absolute",
                          top:          4,
                          right:        4,
                          padding:      "2px 6px",
                          background:   "rgba(0,0,0,0.75)",
                          border:       `1px solid ${colors.borderStrong}`,
                          borderRadius: radius.sm,
                          color:        colors.textMuted,
                          fontFamily:   font.mono,
                          fontSize:     9,
                          cursor:       "pointer",
                        }}
                      >
                        {isHidden && !showAll ? "unhide" : "hide"}
                      </button>
                      {/* Label */}
                      {(asset.purpose || asset.filename) && (
                        <div style={{
                          position:     "absolute",
                          bottom:       0,
                          left:         0,
                          right:        0,
                          background:   "rgba(0,0,0,0.7)",
                          color:        colors.textMuted,
                          fontFamily:   font.mono,
                          fontSize:     9,
                          padding:      "2px 5px",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}>
                          {asset.purpose || asset.filename?.split(".")[0]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Pagination page={page} totalPages={totalPages} onPage={(p) => load(p)} compact />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
