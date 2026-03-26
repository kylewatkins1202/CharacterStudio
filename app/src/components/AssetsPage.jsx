import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { colors, font } from "../theme";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a fallback local URL for an asset in case the CDN URL has expired.
 * Uses the stored assetPath (relative to ASSETS_DIR) if available, so the
 * URL matches exactly where the binary was saved regardless of type.
 */
function localUrl(asset) {
  if (!asset.assetPath) return null;
  return "/api/assets/" + asset.assetPath.split("/").map(encodeURIComponent).join("/");
}

// ─── AssetThumb ───────────────────────────────────────────────────────────────

function AssetThumb({ asset, size = 150 }) {
  const fallback = localUrl(asset);
  return (
    <img
      src={asset.url}
      onError={(e) => { if (fallback && e.target.src !== fallback) e.target.src = fallback; }}
      alt={asset.filename}
      style={{
        width:        "100%",
        height:       size,
        objectFit:    "cover",
        borderRadius: "6px 6px 0 0",
        display:      "block",
        opacity:      asset.hidden ? 0.25 : 1,
        filter:       asset.hidden ? "blur(24px)" : "none",
        transition:   "opacity 0.2s",
        background:   colors.surface,
        border:       `1px solid ${colors.border}`,
      }}
    />
  );
}

// ─── AssetCard ────────────────────────────────────────────────────────────────

function AssetCard({ asset, label, useLabel, header, onUse, onToggleHidden }) {
  return (
    <div style={{
      background:    colors.surface,
      border:        `1px solid ${colors.border}`,
      borderRadius:  8,
      overflow:      "hidden",
      display:       "flex",
      flexDirection: "column",
      opacity:       asset.hidden ? 0.5 : 1,
      transition:    "opacity 0.2s",
    }}>
      <AssetThumb asset={asset} size={180} />

      {header && (
        <div style={{ fontFamily: font.mono, fontSize: 12, color: colors.textMid, padding: "6px 10px 0" }}>
          {"@" + header}
        </div>
      )}

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{
            fontSize:     10,
            fontFamily:   font.mono,
            color:        colors.textMuted,
            background:   colors.borderMid,
            borderRadius: 4,
            padding:      "2px 6px",
          }}>
            {label}
          </span>
          {asset.hidden && (
            <span style={{ fontSize: 10, fontFamily: font.mono, color: colors.textMuted }}>hidden</span>
          )}
        </div>

        {asset.timestamp && (
          <div style={{ fontSize: 10, fontFamily: font.mono, color: colors.textGhost }}>
            {new Date(asset.timestamp).toLocaleDateString()}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onUse(asset.url)}
            style={{
              flex:         1,
              padding:      "4px 0",
              background:   colors.borderMid,
              border:       `1px solid ${colors.borderStrong}`,
              borderRadius: 5,
              color:        colors.textMid,
              fontFamily:   font.mono,
              fontSize:     11,
              cursor:       "pointer",
            }}
          >
            {useLabel}
          </button>
          <button
            onClick={() => onToggleHidden(asset)}
            title={asset.hidden ? "Show" : "Hide"}
            style={{
              padding:      "4px 8px",
              background:   "transparent",
              border:       `1px solid ${colors.border}`,
              borderRadius: 5,
              color:        colors.textMuted,
              fontFamily:   font.mono,
              fontSize:     11,
              cursor:       "pointer",
            }}
          >
            {asset.hidden ? "Show" : "Hide"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AssetsPage ───────────────────────────────────────────────────────────────

export function AssetsPage({ toast, onAddReference }) {
  const [refs,       setRefs]       = useState([]);
  const [tagAssets,  setTagAssets]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const [refRes, tagRes] = await Promise.all([
        api.get("/assets?type=reference"),
        api.get("/assets?type=tag_asset"),
      ]);
      if (refRes.ok)  setRefs(refRes.assets);
      if (tagRes.ok)  setTagAssets(tagRes.assets);
    } catch {
      toast.add("Failed to load assets", "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggleHidden = async (asset) => {
    try {
      const res = await api.patch(`/assets/${asset.id}`, { hidden: !asset.hidden });
      if (!res.ok) { toast.add(res.error || "Update failed", "error"); return; }

      const update = (list) => list.map((a) => a.id === asset.id ? { ...a, hidden: !asset.hidden } : a);
      if (asset.type === "reference") setRefs(update);
      else setTagAssets(update);
    } catch {
      toast.add("Network error", "error");
    }
  };

  const visibleRefs      = refs.filter((a)      => showHidden || !a.hidden);
  const visibleTagAssets = tagAssets.filter((a) => showHidden || !a.hidden);

  // Group tag assets by tagKey for display
  const byTag = visibleTagAssets.reduce((acc, asset) => {
    const key = asset.tagKey || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(asset);
    return acc;
  }, {});

  const sectionHeader = (title, count) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <h2 style={{
        margin:        0,
        fontFamily:    font.mono,
        fontSize:      14,
        fontWeight:    600,
        color:         colors.textMid,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        {title}
      </h2>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>{count}</span>
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: 40, color: colors.textMuted, fontFamily: font.mono, fontSize: 13 }}>
        Loading assets…
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 28px", maxWidth: 1400, margin: "0 auto" }}>

      {/* ── References ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          {sectionHeader("References", visibleRefs.length)}
          <button
            onClick={() => setShowHidden((v) => !v)}
            style={{
              marginLeft:   "auto",
              padding:      "4px 12px",
              background:   showHidden ? colors.borderMid : "transparent",
              border:       `1px solid ${colors.border}`,
              borderRadius: 6,
              color:        colors.textMuted,
              fontFamily:   font.mono,
              fontSize:     11,
              cursor:       "pointer",
            }}
          >
            {showHidden ? "Hide hidden" : "Show hidden"}
          </button>
        </div>

        {visibleRefs.length === 0 ? (
          <p style={{ fontFamily: font.mono, fontSize: 12, color: colors.textGhost, margin: 0 }}>
            {refs.length === 0
              ? "No references yet. Generate images with reference photos to populate this section."
              : "No references to show."}
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {visibleRefs.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                label={asset.purpose || "composition"}
                useLabel="Use"
                onUse={onAddReference}
                onToggleHidden={handleToggleHidden}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Tag Assets ──────────────────────────────────────────────────────── */}
      <div>
        {sectionHeader("Tag Assets", visibleTagAssets.length)}

        {Object.keys(byTag).length === 0 ? (
          <p style={{ fontFamily: font.mono, fontSize: 12, color: colors.textGhost, margin: 0 }}>
            No tag assets yet.
          </p>
        ) : (
          <div style={{ marginBottom: 28 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {
                Object.entries(byTag).map(([tagKey, assets]) => (
                    assets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      label={asset.group}
                      useLabel="Use as ref"
                      header={tagKey}
                      onUse={onAddReference}
                      onToggleHidden={handleToggleHidden}
                    />
                  ))
                ))
              }
          </div>
            </div>
        )}
      </div>
    </div>
  );
}
