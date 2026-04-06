import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { DownloadButton } from "./DownloadButton";
import { ImageLightbox } from "./ImageLightbox";
import { Pagination } from "./Pagination";
import { colors, font, radius } from "../theme";

// ─── GalleryPage ──────────────────────────────────────────────────────────────

export function GalleryPage({ toast, onUsePrompt, onAddReference, onUpscale }) {
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showAll,    setShowAll]    = useState(false);
  const [revealed,   setRevealed]   = useState(new Set());
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Pagination
  const [page,       setPage]       = useState(1);
  const [pageSize]                  = useState(20);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async (p = 1, hidden = showHidden) => {
    setLoading(true);
    try {
      const hiddenParam = hidden ? "" : "&hidden=false";
      const res = await api.get(`/gallery?page=${p}&pageSize=${pageSize}${hiddenParam}`);
      if (res.ok) {
        setEntries(res.entries);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
        setPage(p);
      }
    } catch {
      toast.add("Failed to load gallery", "error");
    }
    setLoading(false);
  }, [toast, pageSize, showHidden]);

  useEffect(() => { load(1); }, [load]);

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/gallery/${id}`);
      if (res.ok) {
        toast.add("Deleted", "success");
        // Reload current page; if it's now empty and not page 1, go back
        const nextPage = entries.length === 1 && page > 1 ? page - 1 : page;
        load(nextPage);
      } else {
        toast.add(res.error || "Delete failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleToggleHidden = async (entry) => {
    const next = !entry.hidden;
    try {
      const endpoint = entry.imageAssetId
        ? `/assets/${entry.imageAssetId}`
        : `/gallery/${entry.id}`;
      const res = await api.patch(endpoint, { hidden: next });
      if (res.ok) {
        setEntries((p) => p.map((e) => e.id === entry.id ? { ...e, hidden: next } : e));
        if (next) setRevealed((p) => { const s = new Set(p); s.delete(entry.id); return s; });
        toast.add(next ? "Image hidden" : "Image visible", "success");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  const toggleReveal = (id) => {
    setRevealed((p) => {
      const s = new Set(p);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleToggleShowHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    setShowAll(false);
    load(1, next);
  };

  const totalCost   = entries.reduce((sum, e) => sum + parseFloat(e.cost || 0), 0);
  const hiddenCount = entries.filter((e) => e.hidden).length;
  const visibleEntries = entries.filter((e) => showHidden ? true : !e.hidden);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px" }}>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, position: "fixed", background: colors.surface, zIndex: 100, top: 54, left: 0, right: 0, padding: "24px", borderBottom: `1px solid ${colors.border}` }}>
        <div>
          <h1 style={{ fontFamily: font.serif, fontSize: font.sizeHeading, fontWeight: 700, color: colors.textHigh, margin: 0, letterSpacing: "-0.02em" }}>
            Gallery
          </h1>
          <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeLg, marginTop: 6 }}>
            {loading
              ? "Loading…"
              : `${total} image${total !== 1 ? "s" : ""}${hiddenCount > 0 ? ` · ${hiddenCount} hidden on this page` : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {showHidden && (
            <button
              onClick={() => setShowAll((p) => !p)}
              style={{
                padding:      "6px 14px",
                borderRadius: radius.md - 1,
                cursor:       "pointer",
                border:       `1px solid ${colors.textMuted}`,
                background:   colors.borderMid,
                color:        colors.textMid,
                fontFamily:   font.mono,
                fontSize:     font.sizeMd,
                transition:   "all 0.15s",
              }}
            >
              {showAll ? "Hide all hidden" : "Show all hidden"}
            </button>
          )}
          {(
            <button
              onClick={handleToggleShowHidden}
              style={{
                padding:      "6px 14px",
                borderRadius: radius.md - 1,
                cursor:       "pointer",
                border:       `1px solid ${showHidden ? colors.textMuted : colors.borderStrong}`,
                background:   showHidden ? colors.borderMid : "transparent",
                color:        showHidden ? colors.textMid : colors.textMuted,
                fontFamily:   font.mono,
                fontSize:     font.sizeMd,
                transition:   "all 0.15s",
              }}
            >
              {showHidden ? "Hide hidden" : `Show hidden`}
            </button>
          )}
          {total > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total cost</div>
              <div style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: 20 }}>${totalCost.toFixed(4)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", marginTop: 90 }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${colors.borderMid}`, borderTop: `2px solid ${colors.borderStrong}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>
      ) : visibleEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeLg, marginTop: 90 }}>
          {total === 0 ? "No images yet — generate one to get started" : "All images are hidden"}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 12, marginTop: 90 }}>
            {visibleEntries.map((entry) => {
              const isRevealed = revealed.has(entry.id);
              const isHidden   = entry.hidden;

              return (
                <div key={entry.id} style={{
                  background:   colors.surface,
                  border:       `1px solid ${isHidden ? colors.borderMid : colors.border}`,
                  borderRadius: radius.xl,
                  overflow:     "hidden",
                }}>
                  <div style={{ position: "relative" }}>
                    <img
                      src={entry.localUrl || entry.imageUrl}
                      alt=""
                      onClick={() => { if (!isHidden || isRevealed || showAll) setLightboxSrc(entry.localUrl || entry.imageUrl); }}
                      style={{
                        width:      "100%",
                        display:    "block",
                        filter:     (!isHidden || isRevealed || showAll) ? "none" : "blur(24px)",
                        transition: "filter 0.3s",
                        cursor:     (!isHidden || isRevealed || showAll) ? "zoom-in" : "default",
                      }}
                    />
                    {isHidden && !isRevealed && !showAll && (
                      <div
                        onClick={() => toggleReveal(entry.id)}
                        style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 6 }}
                      >
                        <div style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, background: "rgba(0,0,0,0.6)", padding: "6px 12px", borderRadius: radius.md - 2 }}>
                          Hidden — click to reveal
                        </div>
                      </div>
                    )}
                    {isHidden && isRevealed && (
                      <div
                        onClick={() => toggleReveal(entry.id)}
                        style={{ position: "absolute", top: 8, right: 8, cursor: "pointer", background: "rgba(0,0,0,0.7)", borderRadius: radius.sm, padding: "3px 8px", color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeXs }}
                      >
                        re-hide
                      </div>
                    )}
                  </div>

                  {/* Card footer */}
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ color: colors.textDim, fontFamily: font.mono, fontSize: font.sizeSm, margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {entry.userPrompt}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {entry.size && (
                          <span style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeXs }}>{entry.size.replace("*", " × ")}</span>
                        )}
                        {entry.cost && (
                          <span style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeXs }}>${entry.cost}</span>
                        )}
                        <span style={{ color: colors.borderMid, fontFamily: font.mono, fontSize: font.sizeXs }}>
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => onUsePrompt(entry)}
                          style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md - 2, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.borderFocus; e.currentTarget.style.color = colors.textHigh; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderStrong; e.currentTarget.style.color = colors.textMuted; }}
                        >
                          ↑ Use
                        </button>
                        <button
                          onClick={() => onUpscale(entry)}
                          style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.borderMid}`, borderRadius: radius.md - 2, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.borderFocus; e.currentTarget.style.color = colors.textHigh; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderMid; e.currentTarget.style.color = colors.textMuted; }}
                        >
                          Upscale
                        </button>
                        <button
                          onClick={() => { onAddReference({ id: entry.imageAssetId, url: entry.imageUrl, purpose: "composition" }); toast.add("Added as reference", "success"); }}
                          style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.borderMid}`, borderRadius: radius.md - 2, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.tagLocationA; e.currentTarget.style.color = colors.tagLocation; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderMid; e.currentTarget.style.color = colors.textMuted; }}
                        >
                          + Ref
                        </button>
                        <button
                          onClick={() => handleToggleHidden(entry)}
                          style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.borderMid}`, borderRadius: radius.md - 2, color: isHidden ? colors.textMuted : colors.textGhost, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.borderFocus; e.currentTarget.style.color = colors.textHigh; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderMid; e.currentTarget.style.color = isHidden ? colors.textMuted : colors.textGhost; }}
                        >
                          {isHidden ? "○ Show" : "● Hide"}
                        </button>
                        <DownloadButton
                          entry={entry}
                          onOpened={({ localUrl, imageAssetId }) => window.electronAPI?.openFileLocation({ localUrl, imageAssetId })}
                          onDownloaded={(id, localUrl) =>
                            setEntries((p) => p.map((e) => e.id === id ? { ...e, localUrl } : e))
                          }
                        />
                        <button
                          onClick={() => handleDelete(entry.id)}
                          style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.borderMid}`, borderRadius: radius.md - 2, color: colors.textGhost, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.errorA44; e.currentTarget.style.color = colors.error; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderMid; e.currentTarget.style.color = colors.textGhost; }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} onPage={(p) => load(p)} />
        </>
      )}
    </div>
  );
}
