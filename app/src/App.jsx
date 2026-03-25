import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = "/api";
const TIMEOUT_MS = 5 * 60 * 1000;
const COST_PER_MEGAPIXEL = 0.06; // adjust if WaveSpeed pricing changes

function estimateCost(sizeStr) {
  return 0.04 + 0.001
}

const api = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    return r.json();
  },
  async post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return r.json();
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Request timed out after 5 minutes");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
  async patch(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  },
  async delete(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return r.json();
  },
};

const toBase64 = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

function extractImageUrl(wavespeed) {
    if (!wavespeed) return null;
    const d = wavespeed?.data || wavespeed;
    return d?.outputs?.[0] || d?.images?.[0] || d?.image_url || d?.url ||
        wavespeed?.outputs?.[0] || wavespeed?.images?.[0] || wavespeed?.image_url || wavespeed?.url || null;
}

// Separate helper for restoring a gallery entry as a synthetic result
function makeSyntheticResult(imageUrl) {
    return { images: [imageUrl] };
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  const remove = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, add, remove };
}

function Toast({ toasts, remove }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          background: t.type === "error" ? "#ff3b3b" : t.type === "success" ? "#00e87a" : "#1a1a1a",
          color: t.type === "success" ? "#000" : "#fff",
          padding: "10px 18px", borderRadius: 8, fontSize: 13,
          fontFamily: "'DM Mono', monospace", cursor: "pointer",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          animation: "fadeSlideIn 0.2s ease", maxWidth: 320,
        }}>{t.msg}</div>
      ))}
    </div>
  );
}

const TYPE_COLOR = { character: "#c084fc", prop: "#60a5fa", outfit: "#f472b6", location: "#34d399" };
const TYPE_ICON  = { character: "◈", prop: "⬡", outfit: "◇", location: "◎" };

const ASPECT_RATIOS = [
  { label: "1:1",  w: 1, h: 1 },
  { label: "3:4",  w: 3, h: 4 },
  { label: "4:3",  w: 4, h: 3 },
  { label: "9:16", w: 9, h: 16 },
  { label: "16:9", w: 16, h: 9 },
];

function computeSize(aspect, baseSize) {
  const ratio = aspect.w / aspect.h;
  let w, h;
  if (ratio >= 1) {
    w = Math.round(baseSize / 64) * 64;
    h = Math.round((baseSize / ratio) / 64) * 64;
  } else {
    h = Math.round(baseSize / 64) * 64;
    w = Math.round((baseSize * ratio) / 64) * 64;
  }
  return `${w}*${h}`;
}

function TagPill({ type }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 999, fontSize: 11,
      fontFamily: "'DM Mono', monospace",
      background: TYPE_COLOR[type] + "22", color: TYPE_COLOR[type],
      border: `1px solid ${TYPE_COLOR[type]}44`,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{type}</span>
  );
}

function PromptInput({ value, onChange, tags }) {
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(null);
  const [activeSug, setActiveSug] = useState(0);
  const taRef = useRef(null);

  const filtered = mentionQuery !== null
    ? tags.filter((t) => t.key.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => { setActiveSug(0); }, [mentionQuery]);

  const handleChange = (e) => {
    const val = e.target.value;
    const cur = e.target.selectionStart;
    onChange(val);
    const before = val.slice(0, cur);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1) {
      const seg = before.slice(atIdx + 1);
      if (!seg.includes(" ")) { setMentionStart(atIdx); setMentionQuery(seg); return; }
    }
    setMentionQuery(null); setMentionStart(null);
  };

  const insertTag = (tag) => {
    const cur = taRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cur);
    onChange(before + "@" + tag.key + " " + after);
    setMentionQuery(null); setMentionStart(null);
    setTimeout(() => {
      taRef.current?.focus();
      const pos = (before + "@" + tag.key + " ").length;
      taRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!filtered.length || mentionQuery === null) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveSug((p) => Math.min(p + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveSug((p) => Math.max(p - 1, 0)); }
    else if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); insertTag(filtered[activeSug]); }
    else if (e.key === "Escape") { setMentionQuery(null); }
  };

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={taRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
        placeholder="Describe your scene… use @tag to reference characters, outfits, props & locations"
        rows={4}
        style={{
          width: "100%", background: "#0d0d0d", border: "1px solid #2a2a2a",
          borderRadius: 10, color: "#e8e8e8", fontFamily: "'DM Mono', monospace",
          fontSize: 14, padding: "14px 16px", resize: "vertical", outline: "none",
          boxSizing: "border-box", lineHeight: 1.6, transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#555")}
      />
      {filtered.length > 0 && mentionQuery !== null && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 10,
          overflow: "hidden", zIndex: 100, boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        }}>
          {filtered.map((tag, i) => (
            <div key={tag.key} onMouseDown={() => insertTag(tag)} onMouseEnter={() => setActiveSug(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                cursor: "pointer", background: i === activeSug ? "#1e1e1e" : "transparent",
                borderBottom: i < filtered.length - 1 ? "1px solid #1a1a1a" : "none",
              }}>
              <span style={{ color: TYPE_COLOR[tag.type], fontFamily: "'DM Mono', monospace", fontSize: 13 }}>@{tag.key}</span>
              <TagPill type={tag.type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageUploadGrid({ label, files, onAdd, onRemove }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const addFiles = async (fileList) => {
    const b64s = await Promise.all(Array.from(fileList).map(toBase64));
    onAdd(b64s);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => {
        // Only clear if leaving the whole grid, not a child element
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={handleDrop}
      style={{
        border: `1px solid ${dragging ? "#555" : "transparent"}`,
        borderRadius: 10,
        padding: dragging ? 6 : 0,
        transition: "all 0.15s",
        background: dragging ? "#0d0d0d" : "transparent",
      }}
    >
      <label style={{ display: "block", color: dragging ? "#888" : "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", transition: "color 0.15s" }}>
        {label}{dragging ? " — drop to add" : ""}
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
        {files.map((src, i) => (
          <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "1px solid #1a1a1a" }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button onClick={() => onRemove(i)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "none", color: "#fff", fontSize: 12, cursor: "pointer" }}>×</button>
          </div>
        ))}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            aspectRatio: "1", borderRadius: 8,
            border: `1px dashed ${dragging ? "#555" : "#2a2a2a"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: dragging ? "#555" : "#333", fontSize: 22, transition: "all 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#555")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = dragging ? "#555" : "#2a2a2a")}
        >
          +
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)} />
        </div>
      </div>
    </div>
  );
}

const FL = { display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" };
const FI = { width: "100%", background: "#080808", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box" };

function TagFormModal({ existingTag, onClose, onSave, toast }) {
  const isEdit = !!existingTag;
  const [type, setType] = useState(existingTag?.type || null);
  const [key, setKey]   = useState(existingTag?.key || "");
  const [basicDesc,  setBasicDesc]  = useState(existingTag?.lock?.basicDescription || "");
  const [appearDesc, setAppearDesc] = useState(existingTag?.lock?.appearanceDescription || "");
  const [bodyDesc,   setBodyDesc]   = useState(existingTag?.lock?.bodyDescription || "");
  const [imgs, setImgs] = useState({ face: [], body: [], prop: [], outfit: [], location: [] });
  const [saving, setSaving] = useState(false);

  const addImgs   = (g, a) => setImgs((p) => ({ ...p, [g]: [...p[g], ...a] }));
  const removeImg = (g, i) => setImgs((p) => ({ ...p, [g]: p[g].filter((_, j) => j !== i) }));

  const save = async () => {
    if (!key.trim()) return toast.add("Key is required", "error");
    if (!type) return toast.add("Select a type", "error");
    setSaving(true);
    try {
      const res = await api.post("/tag", { key: key.trim(), type, basicDescription: basicDesc, appearanceDescription: appearDesc, bodyDescription: bodyDesc, ...imgs });
      if (res.ok) { toast.add(isEdit ? "Tag updated!" : "Tag created!", "success"); onSave(res.tag); }
      else toast.add(res.error || "Save failed", "error");
    } catch { toast.add("Network error", "error"); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#f0f0f0", margin: 0 }}>{isEdit ? `Edit — ${existingTag.key}` : "New Tag"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {!isEdit && (
          <div>
            <label style={FL}>Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {["character","prop","location","outfit"].map((t) => (
                <button key={t} onClick={() => setType(t)} style={{
                  padding: "12px 8px", borderRadius: 8,
                  border: `1px solid ${type === t ? TYPE_COLOR[t] : "#1e1e1e"}`,
                  background: type === t ? TYPE_COLOR[t] + "11" : "#0a0a0a",
                  color: type === t ? TYPE_COLOR[t] : "#444",
                  fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: 18 }}>{TYPE_ICON[t]}</span>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label style={FL}>Key</label>
          <input value={key} onChange={(e) => setKey(e.target.value.replace(/\s/g, "_").toLowerCase())} disabled={isEdit} placeholder="e.g. aria_chen" style={{ ...FI, color: isEdit ? "#444" : "#e8e8e8" }} />
          <div style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 4 }}>Referenced as <span style={{ color: "#444" }}>@{key || "key"}</span></div>
        </div>

        {type === "character" && (<>
          <div><label style={FL}>Appearance Description</label><textarea value={appearDesc} onChange={(e) => setAppearDesc(e.target.value)} rows={2} placeholder="Face, hair, skin… (auto-generated by vision if blank)" style={{ ...FI, resize: "vertical" }} /></div>
          <div><label style={FL}>Body Description</label><textarea value={bodyDesc} onChange={(e) => setBodyDesc(e.target.value)} rows={2} placeholder="Physique, proportions… (auto-generated by vision if blank)" style={{ ...FI, resize: "vertical" }} /></div>
          <ImageUploadGrid label="Face Images"  files={imgs.face}  onAdd={(a) => addImgs("face", a)}  onRemove={(i) => removeImg("face", i)} />
          <ImageUploadGrid label="Body Images"  files={imgs.body}  onAdd={(a) => addImgs("body", a)}  onRemove={(i) => removeImg("body", i)} />
        </>)}
        {type === "prop" && (<>
          <div><label style={FL}>Description</label><textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2} placeholder="Describe the prop… (auto-generated by vision if blank)" style={{ ...FI, resize: "vertical" }} /></div>
          <ImageUploadGrid label="Images" files={imgs.prop} onAdd={(a) => addImgs("prop", a)} onRemove={(i) => removeImg("prop", i)} />
        </>)}
        {type === "outfit" && (<>
          <div><label style={FL}>Description</label><textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2} placeholder="Describe the outfit… (auto-generated by vision if blank)" style={{ ...FI, resize: "vertical" }} /></div>
          <ImageUploadGrid label="Images" files={imgs.outfit} onAdd={(a) => addImgs("outfit", a)} onRemove={(i) => removeImg("outfit", i)} />
        </>)}
        {type === "location" && (<>
          <div><label style={FL}>Description</label><textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2} placeholder="Describe the location… (auto-generated by vision if blank)" style={{ ...FI, resize: "vertical" }} /></div>
          <ImageUploadGrid label="Images" files={imgs.location} onAdd={(a) => addImgs("location", a)} onRemove={(i) => removeImg("location", i)} />
        </>)}
        {!type && <div style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 12, textAlign: "center", padding: "8px 0" }}>Select a type above to continue</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving || !type} style={{ padding: "10px 24px", background: (!type || saving) ? "#111" : "#f0f0f0", border: "none", borderRadius: 8, color: (!type || saving) ? "#333" : "#000", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: (saving || !type) ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
            {saving ? "Saving…" : isEdit ? "Update" : "Create Tag"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagDetail({ tag, onClose, onUpdated, onDeleted, toast }) {
  const [addingGroup, setAddingGroup] = useState(null);
  const [newImgs, setNewImgs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const groups = tag.type === "character" ? ["face","body"] : tag.type === "prop" ? ["prop"] : tag.type === "outfit" ? ["outfit"] : ["location"];

  const handleAddImages = async () => {
    if (!newImgs.length) return toast.add("Add some images first", "error");
    setSaving(true);
    try {
      const res = await api.post(`/tags/${tag.key}/images`, { [addingGroup]: newImgs });
      if (res.ok) { toast.add("Images added!", "success"); onUpdated(res.tag); setAddingGroup(null); setNewImgs([]); }
      else toast.add(res.error || "Failed", "error");
    } catch { toast.add("Network error", "error"); }
    setSaving(false);
  };

  const handleDeleteImage = async (group, id) => {
    try {
      const res = await api.delete(`/tags/${tag.key}/images`, { [group]: [id] });
      if (res.ok) { toast.add("Image removed", "success"); onUpdated(res.tag); }
      else toast.add(res.error || "Failed", "error");
    } catch { toast.add("Network error", "error"); }
  };

  const handleDeleteTag = async () => {
    try {
      const res = await api.delete(`/tags/${tag.key}`);
      if (res.ok) { toast.add(`@${tag.key} deleted`, "success"); onDeleted(tag.key); }
      else toast.add(res.error || "Failed", "error");
    } catch { toast.add("Network error", "error"); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#f0f0f0", margin: 0 }}>@{tag.key}</h2>
            <TagPill type={tag.type} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setConfirmDelete(true)}
              style={{ padding: "6px 14px", background: "none", border: "1px solid #2a2a2a", borderRadius: 6, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff3b3b66"; e.currentTarget.style.color = "#ff3b3b"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}>
              Delete tag
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer" }}>×</button>
          </div>
        </div>

        {(tag.lock?.basicDescription || tag.lock?.appearanceDescription || tag.lock?.bodyDescription) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tag.lock?.basicDescription    && <div><div style={FL}>Description</div> <p style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, lineHeight: 1.7 }}>{tag.lock.basicDescription}</p></div>}
            {tag.lock?.appearanceDescription && <div><div style={FL}>Appearance</div>  <p style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, lineHeight: 1.7 }}>{tag.lock.appearanceDescription}</p></div>}
            {tag.lock?.bodyDescription     && <div><div style={FL}>Body</div>         <p style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, lineHeight: 1.7 }}>{tag.lock.bodyDescription}</p></div>}
          </div>
        )}

        {groups.map((group) => {
          const assets = tag.assets[group] || [];
          return (
            <div key={group}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={FL}>{group} ({assets.length})</div>
                {addingGroup !== group && (
                  <button onClick={() => { setAddingGroup(group); setNewImgs([]); }}
                    style={{ padding: "3px 10px", background: "none", border: "1px solid #2a2a2a", borderRadius: 5, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>
                    + Add
                  </button>
                )}
              </div>
              {assets.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, marginBottom: addingGroup === group ? 12 : 0 }}>
                  {assets.map((asset) => (
                    <div key={asset.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "1px solid #1a1a1a" }}>
                      <img src={asset.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => handleDeleteImage(group, asset.id)}
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "none", color: "#ff3b3b", fontSize: 12, cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {assets.length === 0 && addingGroup !== group && (
                <div style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 11, padding: "8px 0" }}>No images yet</div>
              )}
              {addingGroup === group && (
                <div style={{ background: "#080808", border: "1px solid #1a1a1a", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <ImageUploadGrid label={`New ${group} images`} files={newImgs}
                    onAdd={(a) => setNewImgs((p) => [...p, ...a])}
                    onRemove={(i) => setNewImgs((p) => p.filter((_, j) => j !== i))} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setAddingGroup(null); setNewImgs([]); }}
                      style={{ padding: "7px 14px", background: "none", border: "1px solid #2a2a2a", borderRadius: 7, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                    <button onClick={handleAddImages} disabled={saving}
                      style={{ padding: "7px 18px", background: "#f0f0f0", border: "none", borderRadius: 7, color: "#000", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
                      {saving ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ color: "#1e1e1e", fontFamily: "'DM Mono', monospace", fontSize: 11, paddingTop: 4 }}>
          Created {tag.meta?.createdAt ? new Date(tag.meta.createdAt).toLocaleDateString() : "—"} · Updated {tag.meta?.updatedAt ? new Date(tag.meta.updatedAt).toLocaleDateString() : "—"}
        </div>
      </div>

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#0e0e0e", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, maxWidth: 360, width: "100%" }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", color: "#f0f0f0", margin: "0 0 10px" }}>Delete @{tag.key}?</h3>
            <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: "0 0 20px" }}>This permanently removes the tag and all its data.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "8px 16px", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDeleteTag} style={{ padding: "8px 20px", background: "#ff3b3b", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadButton({ entry, onDownloaded }) {
  const [downloading, setDownloading] = useState(false);

  if (entry.localUrl) {
    return (
      <div style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1a1a1a", color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 11, userSelect: "none" }}>
        ✓ Saved
      </div>
    );
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.post(`/gallery/${entry.id}/download`);
      if (res.ok) {
        onDownloaded(entry.id, res.localUrl);
      } else {
        console.error("Download failed:", res.error);
      }
    } catch (err) {
      console.error("Download error:", err);
    }
    setDownloading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      style={{ padding: "4px 10px", background: "none", border: "1px solid #1e1e1e", borderRadius: 6, color: downloading ? "#2a2a2a" : "#555", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: downloading ? "not-allowed" : "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
      onMouseEnter={(e) => { if (!downloading) { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#e0e0e0"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = downloading ? "#2a2a2a" : "#555"; }}
    >
      {downloading ? "…" : "↓ Save"}
    </button>
  );
}

// ─── Generate Page ─────────────────────────────────────────────────────────────
// State is owned by App so it survives tab switches
function GeneratePage({ tags, toast, prompt, setPrompt, aspect, setAspect, baseSize, setBaseSize, loading, setLoading, result, setResult, compiled, setCompiled, onGenerated, referenceImages, setReferenceImages, resetCache, setResetCache }) {
  const computedSize = computeSize(aspect, baseSize);
  const cost = estimateCost(computedSize);
  const imageUrl = result ? extractImageUrl(result) : null;

  const generate = async () => {
    if (!prompt.trim()) return toast.add("Please enter a prompt", "error");
    setLoading(true); setResult(null); setCompiled(null);
    try {
      const res = await api.post("/generate", {
        prompt,
        size: computedSize,
        referenceImages: referenceImages
            .filter(item => !item.isUrl)
            .map(item => ({ data: item.src, purpose: item.purpose })),
        referenceImageUrls: referenceImages
            .filter(item => item.isUrl)
            .map(item => ({ url: item.src, purpose: item.purpose })),
        resetCache,
      });

      
      if (res.ok) {
        setResult(res.wavespeed);
        setCompiled(res.compiled);
        toast.add("Image generated!", "success");
        setResetCache(false); // auto-uncheck after use
        onGenerated();
      } else {
        toast.add(res.error || "Generation failed", "error");
      }
    } catch (err) { toast.add(err.message || "Network error", "error"); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: "#f0f0f0", margin: 0, letterSpacing: "-0.02em" }}>Generate</h1>
        <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, marginTop: 6 }}>Craft your scene — type <span style={{ color: "#888" }}>@</span> to reference tags</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PromptInput value={prompt} onChange={setPrompt} tags={tags} />
        {/* Reference Images */}
        <div>
          <label style={FL}>Reference Images <span style={{ color: "#2a2a2a", fontWeight: 400 }}>— passed directly to the model alongside tag images</span></label>
          <ReferenceImageInput
              images={referenceImages}
              onChange={setReferenceImages}
          />
        </div>
        <div>
          <label style={FL}>Aspect Ratio</label>
          <div style={{ display: "flex", gap: 6 }}>
            {ASPECT_RATIOS.map((r) => (
              <button key={r.label} onClick={() => setAspect(r)} style={{
                padding: "6px 14px", borderRadius: 7,
                border: `1px solid ${aspect.label === r.label ? "#f0f0f0" : "#1e1e1e"}`,
                background: aspect.label === r.label ? "#f0f0f0" : "transparent",
                color: aspect.label === r.label ? "#000" : "#555",
                fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              }}>{r.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={FL}>
            Resolution — <span style={{ color: "#888" }}>{computedSize.replace("*", " × ")}</span>
          </label>
          <input
            type="range" min={512} max={8192} step={64} value={baseSize}
            onChange={(e) => setBaseSize(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#f0f0f0", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 4 }}>
            <span>512</span><span>2048</span><span>4096</span><span>6144</span><span>8192</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14 }}>
          {cost && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#333" }}>
              est. <span style={{ color: "#666" }}>${cost}</span>
            </span>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={resetCache}
              onChange={(e) => setResetCache(e.target.checked)}
              style={{ accentColor: "#f0f0f0", cursor: "pointer", width: 13, height: 13 }}
            />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: resetCache ? "#888" : "#333", transition: "color 0.15s" }}>
              Reset cache
            </span>
          </label>
          <button onClick={generate} disabled={loading} style={{ padding: "10px 32px", background: loading ? "#111" : "#f0f0f0", color: loading ? "#333" : "#000", border: "none", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {loading ? "Generating…" : "Generate →"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, border: "2px solid #1e1e1e", borderTop: "2px solid #666", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>Dreaming…</span>
        </div>
      )}

      {imageUrl && (
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
          <img src={imageUrl} alt="Generated" style={{ width: "100%", borderRadius: 12, border: "1px solid #1a1a1a", display: "block" }} />
          {compiled && (
            <div style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 10, padding: 16 }}>
              <div style={{ ...FL, marginBottom: 8 }}>Compiled Prompt</div>
              <pre style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{compiled.rawPrompt}</pre>
              {compiled.images?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...FL, marginBottom: 6 }}>Reference Images ({compiled.images.length})</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {compiled.images.map((url, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        <img src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 5, border: "1px solid #1a1a1a" }} />
                        <span style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,0.8)", color: "#888", fontFamily: "'DM Mono', monospace", fontSize: 9, padding: "1px 3px", borderRadius: 3 }}>{i+1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!imageUrl && result && (
        <div style={{ marginTop: 24, background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10, padding: 16 }}>
          <div style={{ ...FL, marginBottom: 8 }}>Raw Response</div>
          <pre style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 11, margin: 0, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Gallery Page ──────────────────────────────────────────────────────────────
function GalleryPage({ toast, onUsePrompt, onAddReference }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [revealed, setRevealed] = useState(new Set()); // ids temporarily revealed

  const load = useCallback(async () => {
    try {
      const res = await api.get("/gallery");
      if (res.ok) setEntries(res.entries);
    } catch { toast.add("Failed to load gallery", "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/gallery/${id}`);
      if (res.ok) { setEntries((p) => p.filter((e) => e.id !== id)); toast.add("Deleted", "success"); }
      else toast.add(res.error || "Delete failed", "error");
    } catch { toast.add("Network error", "error"); }
  };

  const handleToggleHidden = async (entry) => {
    const next = !entry.hidden;
    try {
      const res = await api.patch(`/gallery/${entry.id}`, { hidden: next });
      if (res.ok) {
        setEntries((p) => p.map((e) => e.id === entry.id ? { ...e, hidden: next } : e));
        // If hiding, remove from revealed set
        if (next) setRevealed((p) => { const s = new Set(p); s.delete(entry.id); return s; });
        toast.add(next ? "Image hidden" : "Image visible", "success");
      }
    } catch { toast.add("Network error", "error"); }
  };

  const toggleReveal = (id) => {
    setRevealed((p) => {
      const s = new Set(p);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const totalCost = entries.reduce((sum, e) => sum + parseFloat(e.cost || 0), 0);
  const hiddenCount = entries.filter((e) => e.hidden).length;
  const visibleEntries = entries.filter((e) => showHidden ? true : !e.hidden);

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: "#f0f0f0", margin: 0, letterSpacing: "-0.02em" }}>Gallery</h1>
          <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, marginTop: 6 }}>
            {loading ? "Loading…" : `${entries.length} image${entries.length !== 1 ? "s" : ""}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden((p) => !p)}
              style={{
                padding: "6px 14px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${showHidden ? "#888" : "#2a2a2a"}`,
                background: showHidden ? "#1a1a1a" : "transparent",
                color: showHidden ? "#e0e0e0" : "#555",
                fontFamily: "'DM Mono', monospace", fontSize: 12, transition: "all 0.15s",
              }}
            >
              {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
            </button>
          )}
          {entries.length > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total cost</div>
              <div style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 20 }}>${totalCost.toFixed(4)}</div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
          <div style={{ width: 32, height: 32, border: "2px solid #1e1e1e", borderTop: "2px solid #555", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>
      ) : visibleEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
          {entries.length === 0 ? "No images yet — generate one to get started" : "All images are hidden"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 12 }}>
          {visibleEntries.map((entry) => {
            const isRevealed = revealed.has(entry.id);
            const isHidden = entry.hidden;

            return (
              <div key={entry.id} style={{ background: "#0a0a0a", border: `1px solid ${isHidden ? "#1e1e1e" : "#141414"}`, borderRadius: 12, overflow: "hidden" }}>
                {/* Image with blur overlay for hidden entries */}
                <div style={{ position: "relative" }}>
                  <img
                    src={entry.localUrl || entry.imageUrl}
                    alt=""
                    style={{
                      width: "100%", display: "block",
                      filter: isHidden && !isRevealed ? "blur(24px)" : "none",
                      transition: "filter 0.3s",
                    }}
                  />
                  {isHidden && !isRevealed && (
                    <div
                      onClick={() => toggleReveal(entry.id)}
                      style={{
                        position: "absolute", inset: 0,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", gap: 6,
                      }}
                    >
                      <div style={{ color: "#888", fontFamily: "'DM Mono', monospace", fontSize: 11, background: "rgba(0,0,0,0.6)", padding: "6px 12px", borderRadius: 6 }}>
                        Hidden — click to reveal
                      </div>
                    </div>
                  )}
                  {isHidden && isRevealed && (
                    <div
                      onClick={() => toggleReveal(entry.id)}
                      style={{
                        position: "absolute", top: 8, right: 8, cursor: "pointer",
                        background: "rgba(0,0,0,0.7)", borderRadius: 5,
                        padding: "3px 8px", color: "#888",
                        fontFamily: "'DM Mono', monospace", fontSize: 10,
                      }}
                    >
                      re-hide
                    </div>
                  )}
                </div>

                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{
                    color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11,
                    margin: 0, lineHeight: 1.5,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {entry.userPrompt}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {entry.size && (
                        <span style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                          {entry.size.replace("*", " × ")}
                        </span>
                      )}
                      {entry.cost && (
                        <span style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                          ${entry.cost}
                        </span>
                      )}
                      <span style={{ color: "#1e1e1e", fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                        {new Date(entry.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => onUsePrompt(entry)}
                        style={{ padding: "4px 10px", background: "none", border: "1px solid #2a2a2a", borderRadius: 6, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#e0e0e0"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}
                      >
                        ↑ Use
                      </button>
                      <button
                        onClick={() => { onAddReference(entry.imageUrl); toast.add("Added as reference", "success"); }}
                        style={{ padding: "4px 10px", background: "none", border: "1px solid #1e1e1e", borderRadius: 6, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#34d399aa"; e.currentTarget.style.color = "#34d399"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#555"; }}
                      >
                        + Ref
                      </button>
                      <button
                        onClick={() => handleToggleHidden(entry)}
                        style={{ padding: "4px 10px", background: "none", border: "1px solid #1e1e1e", borderRadius: 6, color: isHidden ? "#888" : "#333", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#e0e0e0"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = isHidden ? "#888" : "#333"; }}
                      >
                        {isHidden ? "○ Show" : "● Hide"}
                      </button>
                      <DownloadButton
                        entry={entry}
                        onDownloaded={(id, localUrl) =>
                          setEntries((p) => p.map((e) => e.id === id ? { ...e, localUrl } : e))
                        }
                      />
                      <button
                        onClick={() => handleDelete(entry.id)}
                        style={{ padding: "4px 10px", background: "none", border: "1px solid #1e1e1e", borderRadius: 6, color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", transition: "all 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff3b3b44"; e.currentTarget.style.color = "#ff3b3b"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#333"; }}
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
      )}
    </div>
  );
}

// ─── Tags Page ─────────────────────────────────────────────────────────────────
function TagsPage({ tags, onTagsChange, toast }) {
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);

  const filtered = tags.filter((t) =>
    t.key.toLowerCase().includes(search.toLowerCase()) &&
    (!typeFilter || t.type === typeFilter)
  );

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: "#f0f0f0", margin: 0, letterSpacing: "-0.02em" }}>Tags</h1>
          <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, marginTop: 6 }}>{tags.length} tag{tags.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ padding: "10px 20px", background: "#f0f0f0", border: "none", borderRadius: 8, color: "#000", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}>
          + New Tag
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tags…" style={{ flex: 1, ...FI }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["character","prop","outfit","location"].map((t) => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} style={{
              padding: "8px 12px", borderRadius: 7,
              border: `1px solid ${typeFilter === t ? TYPE_COLOR[t] : "#1e1e1e"}`,
              background: typeFilter === t ? TYPE_COLOR[t] + "11" : "transparent",
              color: typeFilter === t ? TYPE_COLOR[t] : "#444",
              fontFamily: "'DM Mono', monospace", fontSize: 14, cursor: "pointer", transition: "all 0.15s",
            }}>{TYPE_ICON[t]}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
          {search || typeFilter ? "No tags match your filters" : "No tags yet — create one to get started"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {filtered.map((tag) => {
            const allAssets = Object.values(tag.assets).flat();
            const preview = allAssets[0]?.url;
            return (
              <div key={tag.key} onClick={() => setSelectedTag(tag)}
                style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#141414"; e.currentTarget.style.transform = "translateY(0)"; }}>
                {preview
                  ? <div style={{ height: 130, overflow: "hidden" }}><img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                  : <div style={{ height: 72, background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: TYPE_COLOR[tag.type] + "44", fontSize: 28 }}>{TYPE_ICON[tag.type]}</span></div>
                }
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#d0d0d0" }}>@{tag.key}</span>
                    <TagPill type={tag.type} />
                  </div>
                  {(tag.lock?.basicDescription || tag.lock?.appearanceDescription) && (
                    <p style={{ color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 11, margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tag.lock.basicDescription || tag.lock.appearanceDescription}
                    </p>
                  )}
                  <div style={{ color: "#2a2a2a", fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 6 }}>
                    {allAssets.length} image{allAssets.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showCreate && <TagFormModal onClose={() => setShowCreate(false)} onSave={() => { onTagsChange(); setShowCreate(false); }} toast={toast} />}
      {selectedTag && <TagDetail tag={selectedTag} onClose={() => setSelectedTag(null)} onUpdated={(u) => { onTagsChange(); setSelectedTag(u); }} onDeleted={() => { onTagsChange(); setSelectedTag(null); }} toast={toast} />}
    </div>
  );
}

// ─── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("generate");
  const [tags, setTags] = useState([]);
  const [galleryCount, setGalleryCount] = useState(0);
  const toast = useToast();

  // Generate page state lives here so it survives tab switches
  const [prompt,   setPrompt]   = useState("");
  const [aspect,   setAspect]   = useState(ASPECT_RATIOS[0]);
  const [baseSize, setBaseSize] = useState(2048);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [compiled, setCompiled] = useState(null);

  const [resetCache, setResetCache] = useState(false);

  const [referenceImages, setReferenceImages] = useState([]); // base64 strings

  const loadTags = useCallback(async () => {
    try { const res = await api.get("/tags"); if (res.ok) setTags(res.tags); } catch {}
  }, []);

  // Load gallery count on mount so the tab badge is accurate from the start
  const loadGalleryCount = useCallback(async () => {
    try { const res = await api.get("/gallery"); if (res.ok) setGalleryCount(res.count); } catch {}
  }, []);

  useEffect(() => { loadTags(); loadGalleryCount(); }, [loadTags, loadGalleryCount]);

  const handleAddReference = useCallback((imageUrl) => {
  setReferenceImages((p) => [...p, { src: imageUrl, isUrl: true, purpose: "composition" }]);
  setPage("generate");
}, [setReferenceImages]);
  // Called after a successful generation — bumps the badge and
  // if gallery is open it will re-fetch on its own via its useEffect
  const handleGenerated = useCallback(() => {
    setGalleryCount((p) => p + 1);
  }, []);

  // "Use prompt" from gallery — prefill and switch to generate tab
  const handleUsePrompt = useCallback((entry) => {
    setPrompt(entry.userPrompt);

    // Restore reference images that were used
    setReferenceImages(
        entry.referenceImageUrls?.length
            ? entry.referenceImageUrls.map(url => ({ src: url, isUrl: true, purpose: "composition" }))
            : []
    );

    // Restore size — parse "2048*1536" back into baseSize + aspect
    if (entry.size) {
        const [w, h] = entry.size.split("*").map(Number);
        if (w && h) {
            // Match aspect ratio
            const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
            const d = gcd(w, h);
            const rw = w / d;
            const rh = h / d;
            const matched = ASPECT_RATIOS.find(r => r.w === rw && r.h === rh);
            if (matched) setAspect(matched);
            // baseSize is the longer edge
            setBaseSize(Math.max(w, h));
        }
    }

    // Restore compiled state
    setResult(makeSyntheticResult(entry.imageUrl));
    setCompiled(
        entry.compiledPrompt || entry.compiledImages?.length
            ? {
                rawPrompt: entry.compiledPrompt || "",
                images: entry.compiledImages || [],
              }
            : null
    );
    setPage("generate");
  }, [setPrompt, setResult, setCompiled, setAspect, setBaseSize, setReferenceImages]);

  const NAV_TABS = [
    ["generate", "Generate"],
    ["gallery",  galleryCount > 0 ? `Gallery (${galleryCount})` : "Gallery"],
    ["tags",     "Tags"],
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #080808; color: #e8e8e8; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 3px; }
        select option { background: #0e0e0e; color: #e8e8e8; }
      `}</style>

      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,8,8,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid #111", display: "flex", alignItems: "center", padding: "0 28px", height: 54, gap: 32 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: "#e0e0e0", fontWeight: 700, letterSpacing: "-0.02em" }}>Character Studio</div>
        <div style={{ display: "flex", gap: 2 }}>
          {NAV_TABS.map(([id, label]) => (
            <button key={id} onClick={() => setPage(id)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: page === id ? "#161616" : "transparent", color: page === id ? "#e0e0e0" : "#3a3a3a", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ color: "#1e1e1e", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{tags.length} tag{tags.length !== 1 ? "s" : ""}</div>
      </nav>

      {/*
        Generate and Tags stay mounted (display:none) to preserve state across tab switches.
        Gallery re-fetches from the API each time it mounts, so it's always fresh —
        no need to keep it mounted.
      */}
      <div style={{ display: page === "generate" ? "block" : "none" }}>
        <GeneratePage
          tags={tags} toast={toast}
          prompt={prompt} setPrompt={setPrompt}
          aspect={aspect} setAspect={setAspect}
          baseSize={baseSize} setBaseSize={setBaseSize}
          loading={loading} setLoading={setLoading}
          result={result} setResult={setResult}
          compiled={compiled} setCompiled={setCompiled}
          referenceImages={referenceImages}
          setReferenceImages={setReferenceImages}
          resetCache={resetCache}
          setResetCache={setResetCache}
          onGenerated={handleGenerated}
        />
      </div>

      {page === "gallery" && (
        <GalleryPage
          toast={toast}
          onUsePrompt={handleUsePrompt}
          onAddReference={handleAddReference}
        />
      )}

      <div style={{ display: page === "tags" ? "block" : "none" }}>
        <TagsPage tags={tags} onTagsChange={loadTags} toast={toast} />
      </div>

      <Toast toasts={toast.toasts} remove={toast.remove} />
    </>
  );
}

function UrlReferenceInput({ onAdd }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed); // validates it's a real URL
      onAdd(trimmed);
      setUrl("");
      setError(null);
    } catch {
      setError("Invalid URL");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    if (e.key === "Escape") { setUrl(""); setError(null); }
  };

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <div style={{ flex: 1, position: "relative" }}>
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Paste image URL…"
          style={{
            ...FI,
            borderColor: error ? "#ff3b3b44" : "#1e1e1e",
            fontSize: 12,
            padding: "8px 12px",
          }}
        />
        {error && (
          <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, color: "#ff3b3b", fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
            {error}
          </div>
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={!url.trim()}
        style={{
          padding: "8px 14px", borderRadius: 7, border: "1px solid #1e1e1e",
          background: url.trim() ? "#f0f0f0" : "transparent",
          color: url.trim() ? "#000" : "#333",
          fontFamily: "'DM Mono', monospace", fontSize: 12,
          cursor: url.trim() ? "pointer" : "not-allowed",
          transition: "all 0.15s", whiteSpace: "nowrap",
        }}
      >
        + Add URL
      </button>
    </div>
  );
}

const REFERENCE_PURPOSES = [
  { value: "composition", label: "Composition", hint: "Framing, layout, subject placement" },
  { value: "style",       label: "Style",       hint: "Lighting, color grade, film aesthetic" },
  { value: "pose",        label: "Pose",        hint: "Body position, gesture, stance" },
  { value: "scene",       label: "Scene",       hint: "Background, environment, setting" },
  // { value: "wardrobe",    label: "Wardrobe",    hint: "Clothing, styling, accessories" },
  // { value: "face",        label: "Face",        hint: "Facial features, makeup" },
];

function ReferenceImageInput({ images, onChange }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const addFiles = async (fileList) => {
    const srcs = await Promise.all(Array.from(fileList).map(toBase64));
    onChange((p) => [...p, ...srcs.map(src => ({ src, isUrl: false, purpose: "composition" }))]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const updatePurpose = (i, purpose) => {
    onChange((p) => p.map((item, j) => j === i ? { ...item, purpose } : item));
  };

  const remove = (i) => {
    onChange((p) => p.filter((_, j) => j !== i));
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragging ? "#888" : "#2a2a2a"}`,
          borderRadius: 8, padding: "12px 16px", cursor: "pointer",
          background: dragging ? "#111" : "transparent",
          transition: "all 0.15s", display: "flex", alignItems: "center",
          gap: 10, color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 12,
          marginBottom: images.length > 0 ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 18 }}>+</span>
        <span>{dragging ? "Drop to add reference" : "Drop images or click to add reference photos"}</span>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)} />
      </div>
      <UrlReferenceInput onAdd={(url) => onChange((p) => [...p, { src: url, isUrl: true, purpose: "composition" }])} />

      {/* Image list with purpose dropdowns */}
      {images.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {images.map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#0a0a0a", border: "1px solid #1a1a1a",
              borderRadius: 8, padding: "8px 10px",
            }}>
              {/* Thumbnail */}
              <div style={{ width: 52, height: 52, borderRadius: 6, overflow: "hidden", flexShrink: 0, border: "1px solid #1e1e1e", position: "relative" }}>
                <img src={item.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {item.isUrl && (
                  <div style={{ position: "absolute", bottom: 1, left: 1, background: "rgba(0,0,0,0.75)", borderRadius: 2, padding: "1px 3px", color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 8 }}>ref</div>
                )}
              </div>

              {/* Purpose selector */}
              <div style={{ flex: 1 }}>
                <div style={{ color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Purpose
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {REFERENCE_PURPOSES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => updatePurpose(i, p.value)}
                      title={p.hint}
                      style={{
                        padding: "3px 10px", borderRadius: 5, fontSize: 11,
                        fontFamily: "'DM Mono', monospace", cursor: "pointer",
                        border: `1px solid ${item.purpose === p.value ? "#f0f0f0" : "#1e1e1e"}`,
                        background: item.purpose === p.value ? "#f0f0f0" : "transparent",
                        color: item.purpose === p.value ? "#000" : "#444",
                        transition: "all 0.12s",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remove */}
              <button
                onClick={() => remove(i)}
                style={{ width: 22, height: 22, borderRadius: "50%", background: "none", border: "1px solid #1e1e1e", color: "#333", fontSize: 12, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff3b3b44"; e.currentTarget.style.color = "#ff3b3b"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#333"; }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}