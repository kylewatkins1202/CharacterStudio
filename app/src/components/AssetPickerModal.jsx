import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { Pagination } from "./Pagination";
import { colors, font, radius } from "../theme";

// ─── AssetPickerModal ─────────────────────────────────────────────────────────

export function AssetPickerModal({ onClose, onSelect, title = "Pick from assets", excludeIds = [] }) {
  const [assets,      setAssets]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(new Set());
  const [showHidden,  setShowHidden]  = useState(false);
  const [showAll,     setShowAll]     = useState(false);

  // Pagination
  const [page,       setPage]       = useState(1);
  const [pageSize]                  = useState(40);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback((p = 1, hidden = showHidden) => {
    setLoading(true);
    const hiddenParam = hidden ? "" : "&hidden=false";
    api.get(`/assets?page=${p}&pageSize=${pageSize}${hiddenParam}`)
      .then((res) => {
        if (res.ok) {
          setAssets(res.assets);
          setTotal(res.total ?? 0);
          setTotalPages(res.totalPages ?? 1);
          setPage(p);
        }
      })
      .finally(() => setLoading(false));
  }, [pageSize, showHidden]);

  useEffect(() => { load(1); }, [load]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleHidden = async (e, asset) => {
    e.stopPropagation();
    const res = await api.patch(`/assets/${asset.id}`, { hidden: !asset.hidden });
    if (res.ok) setAssets((p) => p.map((a) => a.id === asset.id ? { ...a, hidden: !asset.hidden } : a));
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
