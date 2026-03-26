import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { colors, font } from "../theme";

// ─── Icons ────────────────────────────────────────────────────────────────────

function EyeIcon({ open }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localUrl(asset) {
  if (!asset.assetPath) return null;
  return "/api/assets/" + asset.assetPath.split("/").map(encodeURIComponent).join("/");
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ─── AssetThumb ───────────────────────────────────────────────────────────────

function AssetThumb({ asset, size = 180 }) {
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

function AssetCard({ asset, onUse, onToggleHidden, onDelete }) {
  const iconBtn = {
    padding:        "4px 7px",
    background:     "transparent",
    border:         `1px solid ${colors.border}`,
    borderRadius:   5,
    color:          colors.textMuted,
    cursor:         "pointer",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
  };

  // Build a human-readable label from whatever context fields exist
  const label = asset.purpose || asset.group || asset.filename?.split("-")[0] || "asset";

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
      <AssetThumb asset={asset} />

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{
            fontSize:     10,
            fontFamily:   font.mono,
            color:        colors.textMuted,
            background:   colors.borderMid,
            borderRadius: 4,
            padding:      "2px 6px",
            maxWidth:     "100%",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
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

        <div style={{ display: "flex", gap: 5 }}>
          <button
            onClick={() => onUse(asset)}
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
            Use as ref
          </button>
          <button onClick={() => onToggleHidden(asset)} title={asset.hidden ? "Show" : "Hide"} style={iconBtn}>
            <EyeIcon open={!asset.hidden} />
          </button>
          <button onClick={() => onDelete(asset)} title="Delete" style={{ ...iconBtn, color: "#c04040" }}>
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UploadZone ───────────────────────────────────────────────────────────────

function UploadZone({ onFiles, uploading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length) onFiles(images);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      style={{
        border:       `2px dashed ${dragging ? colors.primary : colors.border}`,
        borderRadius: 8,
        padding:      "20px 16px",
        textAlign:    "center",
        cursor:       uploading ? "not-allowed" : "pointer",
        color:        dragging ? colors.primary : colors.textGhost,
        fontFamily:   font.mono,
        fontSize:     12,
        transition:   "all 0.2s",
        background:   dragging ? `${colors.primary}08` : "transparent",
        marginBottom: 20,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading ? "Uploading…" : "Click or drag images to upload new assets"}
    </div>
  );
}

// ─── AssetsPage ───────────────────────────────────────────────────────────────

export function AssetsPage({ toast, onAddReference }) {
  const [assets,     setAssets]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/assets");
      if (res.ok) setAssets(res.assets);
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
      setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, hidden: !asset.hidden } : a));
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleDelete = async (asset) => {
    try {
      const res = await api.delete(`/assets/${asset.id}`);
      if (!res.ok) { toast.add(res.error || "Delete failed", "error"); return; }
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast.add("Asset deleted", "success");
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      const images = await Promise.all(files.map(fileToBase64));
      const res = await api.post("/assets", { images });
      if (res.ok) {
        setAssets((prev) => [...res.assets, ...prev]);
        toast.add(`${res.assets.length} asset${res.assets.length !== 1 ? "s" : ""} uploaded`, "success");
      } else {
        toast.add(res.error || "Upload failed", "error");
      }
    } catch {
      toast.add("Upload failed", "error");
    }
    setUploading(false);
  };

  const visible = assets.filter((a) => showHidden || !a.hidden);

  if (loading) {
    return (
      <div style={{ padding: 40, color: colors.textMuted, fontFamily: font.mono, fontSize: 13 }}>
        Loading assets…
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 28px", maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h2 style={{
          margin:        0,
          fontFamily:    font.mono,
          fontSize:      14,
          fontWeight:    600,
          color:         colors.textMid,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          Assets
        </h2>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>{visible.length}</span>
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

      <UploadZone onFiles={handleUpload} uploading={uploading} />

      {visible.length === 0 ? (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: colors.textGhost, margin: 0 }}>
          {assets.length === 0
            ? "No assets yet. Upload images above or generate images to populate this page."
            : "No assets to show."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {visible.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onUse={onAddReference}
              onToggleHidden={handleToggleHidden}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
