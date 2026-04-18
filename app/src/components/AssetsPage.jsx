import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { ImageLightbox } from "./ImageLightbox";
import { Pagination } from "./Pagination";
import { colors, font, radius } from "../theme";
import { AssetStore } from "../../../shared/stores/AssetStore.js";

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

  const handleFiles = (e, files) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    e.target.files = new DataTransfer().files; 
    e.target.value = ''; 
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
        onChange={(e) => handleFiles(e, e.target.files)} />
      {uploading ? "Uploading…" : "Click or drag images to upload"}
    </div>
  );
}

// ─── AssetCard ────────────────────────────────────────────────────────────────

function AssetCard({ asset, selected, onToggleSelect, onUse, onToggleHidden, onDelete, onExpand, anySelected, show }) {
  const isHidden = Boolean(asset.hidden);

  const handleClick = () => {
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
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id); }}
          style={{
            position:       "absolute",
            top:            6,
            left:           6,
            width:          20,
            height:         20,
            borderRadius:   4,
            border:         `2px solid ${selected ? colors.borderFocus : colors.borderStrong}`,
            background:     selected ? colors.borderFocus : "rgba(0,0,0,0.5)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         "pointer",
            transition:     "all 0.15s",
          }}
        >
          {selected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </div>
      </div>

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
  const { folders, selectedFolder, assets, loading, uploading, page, total, showHidden } =
    AssetStore.useState();

  const totalPages = Math.ceil(total / 40) || 1;

  // Local UI state only
  const [view,          setView]          = useState("folder");
  const [showAll,       setShowAll]       = useState(false);
  const [lightboxSrc,   setLightboxSrc]   = useState(null);
  const [selected,      setSelected]      = useState(new Set());
  const [moveOpen,      setMoveOpen]      = useState(false);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const currentFolder = selectedFolder ?? "assets";

  useEffect(() => {
    AssetStore.actions.LOAD_FOLDERS();
    if (!selectedFolder) AssetStore.actions.SET_FOLDER("assets");
    AssetStore.actions.LOAD_ASSETS({ folder: selectedFolder ?? "assets" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const openFolders = () => {
    setView("folders");
    setSelected(new Set());
    setMoveOpen(false);
    AssetStore.actions.LOAD_FOLDERS();
  };

  const openFolder = (name) => {
    setSelected(new Set());
    setShowAll(false);
    setView("folder");
    AssetStore.actions.SET_FOLDER(name);
    AssetStore.actions.LOAD_ASSETS({ folder: name, showHidden: false });
  };

  const reload = useCallback((p = 1) => {
    AssetStore.actions.LOAD_ASSETS({ folder: currentFolder, page: p, showHidden });
  }, [currentFolder, showHidden]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll     = () => setSelected(new Set(assets.map((a) => a.id)));
  const clearSelection = () => { setSelected(new Set()); setMoveOpen(false); };

  // ── Write operations (local api + sync store) ──────────────────────────────

  const handleMove = async (targetFolder) => {
    setMoveOpen(false);
    if (!selected.size) return;
    try {
      const res = await AssetStore.actions.MOVE_ASSETS({ ids: [...selected], folder: targetFolder });
      
      // If successfully moved assets
      if (res?.ok) {
        toast.add(`Moved asset to "${targetFolder}"`, "success");
        clearSelection();
      } else {
        toast.add(res.error || "Move failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
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

  const handleDelete = async (asset) => {
    try {
      const res = await AssetStore.actions.DELETE_ASSET(asset.id);
        if (!res?.ok) { 
          toast.add(res?.diffuse?.error || "Delete failed", "error"); 
          return; 
        } else {
        toast.add("Asset deleted", "success");
        setSelected((prev) => { const next = new Set(prev); next.delete(asset.id); return next; });
      }
    } catch (err) {
      console.log(err)
      toast.add("Network error", "error");
    }
  };

  const handleUpload = async (files) => {
    try {
      const images = await Promise.all(files.map(fileToBase64));
      const res = await AssetStore.actions.UPLOAD_ASSETS({ images, folder: currentFolder });
      
      if (res.ok) {
        toast.add(`Assets Uploaded`, "success");
      } else {
        toast.add(res.error || "Upload failed", "error");
      }
    } catch {
      toast.add("Upload failed", "error");
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim().toLowerCase();
    if (!name) return;
    
    try {
      // Create folder
      const res = await AssetStore.actions.CREATE_FOLDER({name})
      console.log(res)
      // If ok
      if (res.ok) {
        toast.add(`Folder "${name}" created`, "success");
        setNewFolderMode(false);
        setNewFolderName("");
      } else {
        toast.add(res.error || "Failed to create folder", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  const handleDeleteFolder = async (name) => {
    try {
      // Response
      const res = await AssetStore.actions.DELETE_FOLDER(name)
      
      // If ok
      if (res.ok) {
        toast.add(`Folder "${name}" deleted`, "success");
      } 
      else {
        toast.add(res.error || "Failed to delete folder", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const sharedHeader = { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 };
  const headerBtn    = { padding: "4px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontFamily: font.mono, fontSize: 11, cursor: "pointer" };

  // ── Render: folders view ───────────────────────────────────────────────────

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
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "20px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, transition: "border-color 0.15s", position: "relative" }}
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

  const showUpload   = !["generated", "upscaled"].includes(currentFolder);
  const otherFolders = folders.filter((f) => f.name !== currentFolder);

  return (
    <div style={{ padding: "32px 28px", maxWidth: 1400, margin: "0 auto" }}>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div style={{ ...sharedHeader, flexWrap: "wrap" }}>
        <button onClick={openFolders} style={{ ...headerBtn, display: "flex", alignItems: "center", gap: 4 }}>
          ← Back
        </button>
        <h2 style={{ margin: 0, fontFamily: font.mono, fontSize: 14, fontWeight: 600, color: colors.textMid, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {currentFolder}
        </h2>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textMuted }}>{total}</span>
        <div style={{ flex: 1 }} />

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
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: colors.surface, border: `1px solid ${colors.borderMid}`, borderRadius: 6, zIndex: 200, minWidth: 140, overflow: "hidden" }}>
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
            <button onClick={selectAll}    style={headerBtn}>Select all</button>
            <button onClick={clearSelection} style={headerBtn}>Clear</button>
          </div>
        )}

        {selected.size === 0 && (
          <>
            {showHidden && (
              <button
                onClick={() => setShowAll((v) => !v)}
                style={{ padding: "4px 12px", background: showAll ? colors.borderMid : "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontFamily: font.mono, fontSize: 11, cursor: "pointer" }}
              >
                {showAll ? "Hide all" : "Show all"}
              </button>
            )}
            <button
              onClick={() => {
                const next = !showHidden;
                AssetStore.actions.SET_SHOW_HIDDEN(next);
                AssetStore.actions.LOAD_ASSETS({ folder: currentFolder, showHidden: next });
              }}
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
          <Pagination page={page} totalPages={totalPages} onPage={(p) => AssetStore.actions.LOAD_ASSETS({ folder: currentFolder, page: p, showHidden })} />
        </>
      )}
    </div>
  );
}
