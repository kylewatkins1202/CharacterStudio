import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { ImageLightbox } from "./ImageLightbox";
import { Pagination } from "./Pagination";
import { colors, font, radius } from "../theme";

// ─── Icons ────────────────────────────────────────────────────────────────────

function EyeIcon({ open }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUILTIN_FOLDERS = ["assets", "generated", "upscaled"];

function thumbUrl(asset) {
  if (asset.assetPath) return `/api/assets/${asset.id}/thumb`;
  return asset.url;
}

function fallbackUrl(asset) {
  if (!asset.assetPath) return asset.url;
  return "/api/assets/" + asset.assetPath.split("/").map(encodeURIComponent).join("/");
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
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
        border:       `2px dashed ${dragging ? colors.borderFocus : colors.border}`,
        borderRadius: 8,
        padding:      "16px",
        textAlign:    "center",
        cursor:       uploading ? "not-allowed" : "pointer",
        color:        dragging ? colors.textMid : colors.textGhost,
        fontFamily:   font.mono,
        fontSize:     12,
        transition:   "all 0.2s",
        background:   dragging ? colors.borderMid : "transparent",
        marginBottom: 16,
      }}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)} />
      {uploading ? "Uploading…" : "Click or drag images to upload"}
    </div>
  );
}

// ─── AssetCard ────────────────────────────────────────────────────────────────

function AssetCard({ asset, selected, onToggleSelect, onUse, onToggleHidden, onDelete, onExpand, anySelected, show }) {
  const isHidden = Boolean(asset.hidden);

  const handleClick = (e) => {
    // Clicking the image tile: if any selections active → toggle; otherwise → lightbox
    if (anySelected) {
      onToggleSelect(asset.id);
    } else {
      if (!isHidden) onExpand(fallbackUrl(asset));
    }
  };

  return (
    <div style={{
      background:    colors.surface,
      border:        `2px solid ${selected ? colors.borderFocus : colors.border}`,
      borderRadius:  8,
      overflow:      "hidden",
      display:       "flex",
      flexDirection: "column",
      transition:    "border-color 0.15s",
    }}>
      {/* Image area */}
      <div style={{ position: "relative", cursor: anySelected ? "pointer" : (isHidden ? "default" : "zoom-in") }}
        onClick={handleClick}>
        <img
          src={thumbUrl(asset)}
          onError={(e) => { if (e.target.src !== fallbackUrl(asset)) e.target.src = fallbackUrl(asset); }}
          alt={asset.filename}
          style={{
            width:      "100%",
            height:     160,
            objectFit:  "cover",
            display:    "block",
            opacity:    isHidden && !show ? 0.3 : 1,
            filter:     isHidden && !show ? "blur(8px)" : "none",
            background: colors.surface,
            transition: "opacity 0.2s",
          }}
        />
        {/* Checkbox overlay */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id); }}
          style={{
            position:      "absolute",
            top:           6,
            left:          6,
            width:         20,
            height:        20,
            borderRadius:  4,
            border:        `2px solid ${selected ? colors.borderFocus : colors.borderStrong}`,
            background:    selected ? colors.borderFocus : "rgba(0,0,0,0.5)",
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            cursor:        "pointer",
            transition:    "all 0.15s",
          }}
        >
          {selected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 8px", display: "flex", gap: 4, alignItems: "center" }}>
        <button
          onClick={() => onUse(asset)}
          style={{ flex: 1, padding: "3px 0", background: colors.borderMid, border: `1px solid ${colors.borderStrong}`, borderRadius: 4, color: colors.textMid, fontFamily: font.mono, fontSize: 10, cursor: "pointer" }}
        >Use as ref</button>
        <button onClick={() => onToggleHidden(asset)} title={isHidden ? "Show" : "Hide"}
          style={{ padding: "3px 6px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 4, color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center" }}>
          <EyeIcon open={!isHidden} />
        </button>
        <button onClick={() => onDelete(asset)}
          style={{ padding: "3px 6px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 4, color: colors.error || "#c04040", cursor: "pointer", fontFamily: font.mono, fontSize: 11 }}>
          ×
        </button>
      </div>
    </div>
  );
}

// ─── AssetsPage ───────────────────────────────────────────────────────────────

export function AssetsPage({ toast, onAddReference }) {
  // Navigation
  const [view,          setView]          = useState("folder");   // "folders" | "folder"
  const [currentFolder, setCurrentFolder] = useState("assets");
  const [folders,       setFolders]       = useState([]);

  // Asset list
  const [assets,      setAssets]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [showHidden,  setShowHidden]  = useState(false);
  const [showAll,     setShowAll]     = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Pagination
  const [page,       setPage]       = useState(1);
  const [pageSize]                  = useState(30);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Multi-select + move
  const [selected,      setSelected]      = useState(new Set());
  const [moveOpen,      setMoveOpen]      = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/assets/folders");
      if (res.ok) setFolders(res.folders);
    } catch {
      toast.add("Failed to load folders", "error");
    }
    setLoading(false);
  }, [toast]);

  const loadAssets = useCallback(async (p = 1, folder = currentFolder, hidden = showHidden) => {
    setLoading(true);
    try {
      const hiddenParam = hidden ? "" : "&hidden=false";
      const res = await api.get(`/assets?page=${p}&pageSize=${pageSize}&folder=${encodeURIComponent(folder)}${hiddenParam}`);
      if (res.ok) {
        setAssets(res.assets);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
        setPage(p);
      }
    } catch {
      toast.add("Failed to load assets", "error");
    }
    setLoading(false);
  }, [toast, pageSize, currentFolder, showHidden]);

  // Initial load
  useEffect(() => { loadAssets(1); }, [loadAssets]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const openFolders = () => {
    setView("folders");
    setSelected(new Set());
    setMoveOpen(false);
    loadFolders();
  };

  const openFolder = (name) => {
    setCurrentFolder(name);
    setView("folder");
    setSelected(new Set());
    setPage(1);
    setShowHidden(false);
    loadAssets(1, name, false);
  };

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(assets.map((a) => a.id)));
  const clearSelection = () => { setSelected(new Set()); setMoveOpen(false); };

  // ── Move ───────────────────────────────────────────────────────────────────

  const handleMove = async (targetFolder) => {
    setMoveOpen(false);
    if (!selected.size) return;
    try {
      const res = await api.post("/assets/move", { ids: [...selected], folder: targetFolder });
      if (res.ok) {
        toast.add(`Moved ${res.moved} asset${res.moved !== 1 ? "s" : ""} to "${targetFolder}"`, "success");
        clearSelection();
        loadAssets(1, currentFolder, showHidden);
        loadFolders();
      } else {
        toast.add(res.error || "Move failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  // ── Asset actions ──────────────────────────────────────────────────────────

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
      toast.add("Asset deleted", "success");
      setSelected((prev) => { const next = new Set(prev); next.delete(asset.id); return next; });
      const nextPage = assets.length === 1 && page > 1 ? page - 1 : page;
      loadAssets(nextPage, currentFolder, showHidden);
      loadFolders();
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      const images = await Promise.all(files.map(fileToBase64));
      const res = await api.post("/assets", { images, folder: currentFolder });
      if (res.ok) {
        toast.add(`${res.assets.length} asset${res.assets.length !== 1 ? "s" : ""} uploaded`, "success");
        loadAssets(1, currentFolder, showHidden);
        loadFolders();
      } else {
        toast.add(res.error || "Upload failed", "error");
      }
    } catch {
      toast.add("Upload failed", "error");
    }
    setUploading(false);
  };

  // ── Folder management ──────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim().toLowerCase();
    if (!name) return;
    try {
      const res = await api.post("/assets/folders", { name });
      if (res.ok) {
        toast.add(`Folder "${name}" created`, "success");
        setNewFolderMode(false);
        setNewFolderName("");
        loadFolders();
      } else {
        toast.add(res.error || "Failed to create folder", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleDeleteFolder = async (name) => {
    try {
      const res = await api.delete(`/assets/folders/${encodeURIComponent(name)}`);
      if (res.ok) {
        toast.add(`Folder "${name}" deleted`, "success");
        loadFolders();
      } else {
        toast.add(res.error || "Failed to delete folder", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  // ── Render: folders view ───────────────────────────────────────────────────

  const sharedHeader = {
    display:    "flex",
    alignItems: "center",
    gap:        12,
    marginBottom: 20,
  };

  const headerBtn = {
    padding:      "4px 12px",
    background:   "transparent",
    border:       `1px solid ${colors.border}`,
    borderRadius: 6,
    color:        colors.textMuted,
    fontFamily:   font.mono,
    fontSize:     11,
    cursor:       "pointer",
  };

  if (view === "folders") {
    return (
      <div style={{ padding: "32px 28px", maxWidth: 1400, margin: "0 auto" }}>
        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

        <div style={sharedHeader}>
          <h2 style={{ margin: 0, fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: colors.textMid, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Assets
          </h2>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>
            {folders.reduce((s, f) => s + f.count, 0)} total
          </span>
          <div style={{ flex: 1 }} />
          {newFolderMode ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setNewFolderMode(false); setNewFolderName(""); } }}
                placeholder="folder-name"
                style={{ padding: "4px 8px", background: colors.surface, border: `1px solid ${colors.borderFocus}`, borderRadius: 5, color: colors.textMid, fontFamily: font.mono, fontSize: 11, width: 160 }}
              />
              <button onClick={handleCreateFolder} style={{ ...headerBtn, borderColor: colors.borderFocus, color: colors.textMid }}>Create</button>
              <button onClick={() => { setNewFolderMode(false); setNewFolderName(""); }} style={headerBtn}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setNewFolderMode(true)} style={headerBtn}>+ New Folder</button>
          )}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div style={{ width: 24, height: 24, border: `2px solid ${colors.borderMid}`, borderTop: `2px solid ${colors.borderStrong}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {folders.map((folder) => (
              <div
                key={folder.name}
                onClick={() => openFolder(folder.name)}
                style={{
                  background:    colors.surface,
                  border:        `1px solid ${colors.border}`,
                  borderRadius:  10,
                  padding:       "20px 16px",
                  cursor:        "pointer",
                  display:       "flex",
                  flexDirection: "column",
                  gap:           10,
                  transition:    "border-color 0.15s",
                  position:      "relative",
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = colors.borderStrong}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = colors.border}
              >
                <div style={{ color: colors.textMuted }}><FolderIcon /></div>
                <div>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: colors.textMid, fontWeight: 600 }}>{folder.name}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: colors.textGhost, marginTop: 3 }}>
                    {folder.count} image{folder.count !== 1 ? "s" : ""}
                    {folder.builtin ? "" : " · custom"}
                  </div>
                </div>
                {!folder.builtin && folder.count === 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.name); }}
                    style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: colors.textGhost, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                    title="Delete empty folder"
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: folder contents view ───────────────────────────────────────────

  const showUpload = !["generated", "upscaled"].includes(currentFolder);
  const otherFolders = folders.filter((f) => f.name !== currentFolder);

  return (
    <div style={{ padding: "32px 28px", maxWidth: 1400, margin: "0 auto" }}>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Header */}
      <div style={{ ...sharedHeader, flexWrap: "wrap" }}>
        <button onClick={openFolders} style={{ ...headerBtn, display: "flex", alignItems: "center", gap: 4 }}>
          ← Back
        </button>
        <h2 style={{ margin: 0, fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: colors.textMid, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {currentFolder}
        </h2>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>{total}</span>
        <div style={{ flex: 1 }} />

        {/* Selection toolbar */}
        {selected.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>{selected.size} selected</span>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMoveOpen((v) => !v)}
                style={{ ...headerBtn, borderColor: colors.borderStrong, color: colors.textMid }}
              >
                Move to ▾
              </button>
              {moveOpen && (
                <div style={{
                  position:   "absolute",
                  top:        "calc(100% + 4px)",
                  right:      0,
                  background: colors.surface,
                  border:     `1px solid ${colors.borderMid}`,
                  borderRadius: 6,
                  zIndex:     200,
                  minWidth:   140,
                  overflow:   "hidden",
                }}>
                  {otherFolders.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => handleMove(f.name)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: colors.textMuted, fontFamily: font.mono, fontSize: 11, cursor: "pointer" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = colors.borderMid}
                      onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                    >
                      {f.name}
                    </button>
                  ))}
                  {otherFolders.length === 0 && (
                    <div style={{ padding: "8px 12px", color: colors.textGhost, fontFamily: font.mono, fontSize: 11 }}>No other folders</div>
                  )}
                </div>
              )}
            </div>
            <button onClick={selectAll}  style={headerBtn}>Select all</button>
            <button onClick={clearSelection} style={headerBtn}>Clear</button>
          </div>
        )}

        {selected.size === 0 && (
          <>
            {
              showHidden === true && 
                <button
                  onClick={() => {setShowAll((v) => !v);}}
                  style={{
                    float: "right",
                    padding:      "4px 12px",
                    background:   showAll ? colors.borderMid : "transparent",
                    border:       `1px solid ${colors.border}`,
                    borderRadius: 6,
                    color:        colors.textMuted,
                    fontFamily:   font.mono,
                    fontSize:     11,
                    cursor:       "pointer",
                  }}
                >
                  {showAll ? "Hide all" : "Show all"}
                </button>
            }
            <button
              onClick={() => { const next = !showHidden; setShowHidden(next); loadAssets(1, currentFolder, next); }}
              style={{ ...headerBtn, background: showHidden ? colors.borderMid : "transparent" }}
            >
              {showHidden ? "Hide hidden" : "Show hidden"}
            </button>
          </>
        )}
      </div>

      {showUpload && <UploadZone onFiles={handleUpload} uploading={uploading} />}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <div style={{ width: 24, height: 24, border: `2px solid ${colors.borderMid}`, borderTop: `2px solid ${colors.borderStrong}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>
      ) : assets.length === 0 ? (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: colors.textGhost, margin: 0 }}>
          {total === 0 ? "No assets in this folder." : "No assets to show."}
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selected.has(asset.id)}
                anySelected={selected.size > 0}
                onToggleSelect={toggleSelect}
                onUse={onAddReference}
                onToggleHidden={handleToggleHidden}
                onDelete={handleDelete}
                onExpand={(src) => setLightboxSrc(src)}
                show={showAll}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={(p) => loadAssets(p, currentFolder, showHidden)} />
        </>
      )}
    </div>
  );
}
