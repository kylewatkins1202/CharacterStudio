import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { DownloadButton } from "./DownloadButton";
import { ImageLightbox } from "./ImageLightbox";
import { Pagination } from "./Pagination";
import { colors, font, radius } from "../theme";
import { GalleryStore } from "../../../shared/stores/GalleryStore.js";

export function GalleryPage({ toast, onUsePrompt, onAddReference, onUpscale }) {
  const { entries, loading, page, total, totalPages, showHidden } = GalleryStore.useState();

  const [showAll,     setShowAll]     = useState(false);
  const [revealed,    setRevealed]    = useState(new Set());
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    if (entries.length === 0) {
      GalleryStore.actions.LOAD_PAGE({ page: 1, showHidden });
    } else {
      GalleryStore.actions.SET_LOADING(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (p, hidden = showHidden) => {
    GalleryStore.actions.LOAD_PAGE({ page: p, showHidden: hidden });
  };

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/gallery/${id}`);
      if (res.ok) {
        toast.add("Deleted", "success");
        GalleryStore.actions.REMOVE_ENTRY(id);
        const remaining = entries.filter((e) => e.id !== id);
        if (remaining.length === 0 && page > 1) load(page - 1);
        else if (remaining.length === 0) load(page);
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
        GalleryStore.actions.UPDATE_ENTRY({ id: entry.id, hidden: next });
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
    setShowAll(false);
    load(1, next);
  };

  const totalCost      = entries.reduce((sum, e) => sum + parseFloat(e.cost || 0), 0);
  const hiddenCount    = entries.filter((e) => e.hidden).length;
  const visibleEntries = entries.filter((e) => showHidden ? true : !e.hidden);

  return (
    <div style={{ margin: "0 auto", padding: "40px 8px" }}>
      {lightboxSrc && <ImageLightbox {...lightboxSrc} upscale={onUpscale} onClose={() => setLightboxSrc(null)} />}

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
              style={{ padding: "6px 14px", borderRadius: radius.md - 1, cursor: "pointer", border: `1px solid ${colors.textMuted}`, background: colors.borderMid, color: colors.textMid, fontFamily: font.mono, fontSize: font.sizeMd, transition: "all 0.15s" }}
            >
              {showAll ? "Hide all hidden" : "Show all hidden"}
            </button>
          )}
          <button
            onClick={handleToggleShowHidden}
            style={{ padding: "6px 14px", borderRadius: radius.md - 1, cursor: "pointer", border: `1px solid ${showHidden ? colors.textMuted : colors.borderStrong}`, background: showHidden ? colors.borderMid : "transparent", color: showHidden ? colors.textMid : colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, transition: "all 0.15s" }}
          >
            {showHidden ? "Hide hidden" : "Show hidden"}
          </button>
          {total > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total cost</div>
              <div style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: 20 }}>${totalCost.toFixed(4)}</div>
            </div>
          )}
        </div>
      </div>

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 6, marginTop: 90 }}>
            {visibleEntries.map((entry) => {
              if (entry.loading) {
                return (
                  <div key={entry.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.xl, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ width: "100%", paddingTop: "100%", position: "relative", background: `linear-gradient(90deg, ${colors.border} 25%, ${colors.borderMid} 50%, ${colors.border} 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }}>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 28, height: 28, border: `2px solid ${colors.borderStrong}`, borderTop: `2px solid ${colors.borderFocus}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <p style={{ color: colors.textDim, fontFamily: font.mono, fontSize: font.sizeSm, margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {entry.userPrompt}
                      </p>
                      <span style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: font.sizeXs }}>Generating…</span>
                    </div>
                  </div>
                );
              }

              if (entry.error) {
                return (
                  <div key={entry.id} style={{ background: colors.surface, border: `1px solid ${colors.errorA44}`, borderRadius: radius.xl, overflow: "hidden", padding: "14px" }}>
                    <p style={{ color: colors.error, fontFamily: font.mono, fontSize: font.sizeSm, margin: "0 0 6px" }}>Generation failed</p>
                    <p style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: font.sizeXs, margin: "0 0 10px", lineHeight: 1.5 }}>{entry.error}</p>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.errorA44}`, borderRadius: radius.md - 2, color: colors.error, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer" }}
                    >
                      Dismiss
                    </button>
                  </div>
                );
              }

              const isRevealed = revealed.has(entry.id);
              const isHidden   = entry.hidden;

              return (
                <div key={entry.id} style={{ background: colors.surface, border: `1px solid ${isHidden ? colors.borderMid : colors.border}`, borderRadius: radius.xl, overflow: "hidden" }}>
                  <div style={{ position: "relative" }}>
                    <img
                      src={entry.localUrl || entry.imageUrl}
                      alt=""
                      onClick={() => { if (!isHidden || isRevealed || showAll) setLightboxSrc({ src: entry.localUrl || entry.imageUrl, entry }); }}
                      style={{ width: "100%", display: "block", filter: (!isHidden || isRevealed || showAll) ? "none" : "blur(24px)", transition: "filter 0.3s", cursor: (!isHidden || isRevealed || showAll) ? "zoom-in" : "default" }}
                    />
                    {isHidden && !isRevealed && !showAll && (
                      <div onClick={() => toggleReveal(entry.id)} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 6 }}>
                        <div style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, background: "rgba(0,0,0,0.6)", padding: "6px 12px", borderRadius: radius.md - 2 }}>
                          Hidden — click to reveal
                        </div>
                      </div>
                    )}
                    {isHidden && isRevealed && (
                      <div onClick={() => toggleReveal(entry.id)} style={{ position: "absolute", top: 8, right: 8, cursor: "pointer", background: "rgba(0,0,0,0.7)", borderRadius: radius.sm, padding: "3px 8px", color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeXs }}>
                        re-hide
                      </div>
                    )}
                  </div>

                  <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ color: colors.textDim, fontFamily: font.mono, fontSize: font.sizeSm, margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {entry.userPrompt}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexDirection: "column" }}>
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
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-start", flexWrap: "wrap" }}>
                        <button
                          onClick={() => onUsePrompt(entry)}
                          style={{ padding: "4px 10px", background: "none", border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md - 2, color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.borderFocus; e.currentTarget.style.color = colors.textHigh; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderStrong; e.currentTarget.style.color = colors.textMuted; }}
                        >
                          ↑ Use
                        </button>
                        <button
                          onClick={() => { onAddReference({ id: entry.imageAssetId, url: entry.imageUrl, purpose: "" }); toast.add("Added as reference", "success"); }}
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
                          onOpened={(localUrl) => window.electronAPI?.openFileLocation(localUrl)}
                          onDownloaded={(id, localUrl) =>
                            GalleryStore.actions.UPDATE_ENTRY({ id, localUrl })
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
