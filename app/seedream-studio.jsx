import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:4989";

// ─── API Helpers ──────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  },
  async delete(path, body) {
    const r = await fetch(API_BASE + path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  },
};

// ─── Image helpers ────────────────────────────────────────────────────────────
const toBase64 = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          style={{
            background: t.type === "error" ? "#ff3b3b" : t.type === "success" ? "#00e87a" : "#1a1a1a",
            color: t.type === "success" ? "#000" : "#fff",
            padding: "10px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "'DM Mono', monospace",
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            animation: "fadeSlideIn 0.25s ease",
            maxWidth: 320,
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  const remove = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, add, remove };
}

// ─── Tag Pill ─────────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  character: "#c084fc",
  prop: "#60a5fa",
  outfit: "#f472b6",
  location: "#34d399",
};

function TagPill({ type, label }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontFamily: "'DM Mono', monospace",
        background: TYPE_COLOR[type] + "22",
        color: TYPE_COLOR[type],
        border: `1px solid ${TYPE_COLOR[type]}44`,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {label || type}
    </span>
  );
}

// ─── Autocomplete Prompt Input ────────────────────────────────────────────────
function PromptInput({ value, onChange, tags }) {
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [activeSug, setActiveSug] = useState(0);
  const taRef = useRef(null);
  const listRef = useRef(null);

  const filtered = mentionQuery !== null
    ? tags.filter((t) => t.key.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    setSuggestions(filtered);
    setActiveSug(0);
  }, [mentionQuery, tags]);

  const handleChange = (e) => {
    const val = e.target.value;
    const cur = e.target.selectionStart;
    onChange(val);

    // Find @ before cursor
    const beforeCursor = val.slice(0, cur);
    const atIdx = beforeCursor.lastIndexOf("@");
    if (atIdx !== -1) {
      const segment = beforeCursor.slice(atIdx + 1);
      if (!segment.includes(" ")) {
        setMentionStart(atIdx);
        setMentionQuery(segment);
        return;
      }
    }
    setMentionQuery(null);
    setMentionStart(null);
  };

  const insertTag = (tag) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(taRef.current.selectionStart);
    const next = before + "@" + tag.key + " " + after;
    onChange(next);
    setMentionQuery(null);
    setMentionStart(null);
    setTimeout(() => {
      taRef.current?.focus();
      const pos = (before + "@" + tag.key + " ").length;
      taRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveSug((p) => Math.min(p + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveSug((p) => Math.max(p - 1, 0)); }
    if (e.key === "Tab" || e.key === "Enter") {
      if (mentionQuery !== null && filtered.length > 0) {
        e.preventDefault();
        insertTag(filtered[activeSug]);
      }
    }
    if (e.key === "Escape") { setMentionQuery(null); }
  };

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Describe your scene… use @tag to reference characters, locations, props & outfits"
        rows={4}
        style={{
          width: "100%",
          background: "#0d0d0d",
          border: "1px solid #2a2a2a",
          borderRadius: 10,
          color: "#e8e8e8",
          fontFamily: "'DM Mono', monospace",
          fontSize: 14,
          padding: "14px 16px",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          lineHeight: 1.6,
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#555")}
        onBlur={(e) => {
          e.target.style.borderColor = "#2a2a2a";
          setTimeout(() => setMentionQuery(null), 150);
        }}
      />
      {filtered.length > 0 && mentionQuery !== null && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: 10,
            overflow: "hidden",
            zIndex: 100,
            boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
          }}
        >
          {filtered.map((tag, i) => (
            <div
              key={tag.key}
              onMouseDown={() => insertTag(tag)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                cursor: "pointer",
                background: i === activeSug ? "#1e1e1e" : "transparent",
                borderBottom: i < filtered.length - 1 ? "1px solid #1a1a1a" : "none",
                transition: "background 0.12s",
              }}
              onMouseEnter={() => setActiveSug(i)}
            >
              <span style={{ color: TYPE_COLOR[tag.type], fontFamily: "'DM Mono', monospace", fontSize: 13 }}>@{tag.key}</span>
              <TagPill type={tag.type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Generate Page ─────────────────────────────────────────────────────────────
function GeneratePage({ tags, toast }) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [compiled, setCompiled] = useState(null);

  const generate = async () => {
    if (!prompt.trim()) return toast.add("Please enter a prompt", "error");
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post("/generate", { prompt, size });
      if (res.ok) {
        setResult(res.wavespeed);
        setCompiled(res.compiled);
        toast.add("Image generated!", "success");
      } else {
        toast.add(res.error || "Generation failed", "error");
      }
    } catch (e) {
      toast.add("Network error", "error");
    }
    setLoading(false);
  };

  const imageUrl = result?.images?.[0] || result?.image_url || result?.url;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: "#f0f0f0", margin: 0, letterSpacing: "-0.02em" }}>
          Generate
        </h1>
        <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, marginTop: 6 }}>
          Craft your scene — use @tags to pull in characters, outfits, props & locations
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PromptInput value={prompt} onChange={setPrompt} tags={tags} />

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Size
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              style={{
                width: "100%",
                background: "#0d0d0d",
                border: "1px solid #2a2a2a",
                borderRadius: 8,
                color: "#e8e8e8",
                fontFamily: "'DM Mono', monospace",
                fontSize: 13,
                padding: "10px 12px",
                outline: "none",
              }}
            >
              {["512x512","768x768","1024x1024","1024x1536","1536x1024","1536x2048","2048x1536"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <button
            onClick={generate}
            disabled={loading}
            style={{
              marginTop: 24,
              padding: "10px 32px",
              background: loading ? "#1a1a1a" : "#f0f0f0",
              color: loading ? "#444" : "#000",
              border: "none",
              borderRadius: 8,
              fontFamily: "'DM Mono', monospace",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.04em",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Generating…" : "Generate →"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, border: "2px solid #222", borderTop: "2px solid #888", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>Dreaming…</span>
        </div>
      )}

      {imageUrl && (
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 20 }}>
          <img
            src={imageUrl}
            alt="Generated"
            style={{ width: "100%", borderRadius: 12, border: "1px solid #1a1a1a", display: "block" }}
          />
          {compiled && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: 16 }}>
              <div style={{ color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Compiled Prompt
              </div>
              <p style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, lineHeight: 1.7 }}>
                {compiled.rawPrompt}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Image Upload Grid ─────────────────────────────────────────────────────────
function ImageUploadGrid({ label, files, onAdd, onRemove }) {
  const inputRef = useRef();

  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList);
    const b64s = await Promise.all(arr.map(toBase64));
    onAdd(b64s);
  };

  return (
    <div>
      <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
        {files.map((src, i) => (
          <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "1px solid #1a1a1a" }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button
              onClick={() => onRemove(i)}
              style={{
                position: "absolute", top: 4, right: 4,
                width: 20, height: 20, borderRadius: "50%",
                background: "rgba(0,0,0,0.8)", border: "none",
                color: "#fff", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          </div>
        ))}
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            aspectRatio: "1",
            borderRadius: 8,
            border: "1px dashed #2a2a2a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#333",
            fontSize: 22,
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#555")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a2a")}
        >
          +
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)} />
        </div>
      </div>
    </div>
  );
}

// ─── Tag Form Modal ────────────────────────────────────────────────────────────
function TagFormModal({ existingTag, onClose, onSave, toast }) {
  const isEdit = !!existingTag;
  const [type, setType] = useState(existingTag?.type || null);
  const [key, setKey] = useState(existingTag?.key || "");
  const [basicDesc, setBasicDesc] = useState(existingTag?.lock?.basicDescription || "");
  const [appearDesc, setAppearDesc] = useState(existingTag?.lock?.appearanceDescription || "");
  const [bodyDesc, setBodyDesc] = useState(existingTag?.lock?.bodyDescription || "");
  const [faceImgs, setFaceImgs] = useState([]);
  const [bodyImgs, setBodyImgs] = useState([]);
  const [propImgs, setPropImgs] = useState([]);
  const [outfitImgs, setOutfitImgs] = useState([]);
  const [locationImgs, setLocationImgs] = useState([]);
  const [saving, setSaving] = useState(false);

  const TAG_TYPES = [
    { id: "character", label: "Character", icon: "◈", color: TYPE_COLOR.character },
    { id: "prop", label: "Prop", icon: "⬡", color: TYPE_COLOR.prop },
    { id: "location", label: "Location", icon: "◎", color: TYPE_COLOR.location },
    { id: "outfit", label: "Outfit", icon: "◇", color: TYPE_COLOR.outfit },
  ];

  const save = async () => {
    if (!key.trim()) return toast.add("Key is required", "error");
    if (!type) return toast.add("Select a type", "error");
    setSaving(true);
    try {
      const body = {
        key: key.trim(),
        type,
        basicDescription: basicDesc,
        appearanceDescription: appearDesc,
        bodyDescription: bodyDesc,
        face: faceImgs,
        body: bodyImgs,
        prop: propImgs,
        outfit: outfitImgs,
        location: locationImgs,
      };
      const res = await api.post("/tag", body);
      if (res.ok) {
        toast.add(isEdit ? "Tag updated!" : "Tag created!", "success");
        onSave(res.tag);
      } else {
        toast.add(res.error || "Save failed", "error");
      }
    } catch {
      toast.add("Network error", "error");
    }
    setSaving(false);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 16,
        width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto",
        padding: 32, display: "flex", flexDirection: "column", gap: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#f0f0f0", margin: 0 }}>
            {isEdit ? `Edit — ${existingTag.key}` : "New Tag"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Type selector */}
        {!isEdit && (
          <div>
            <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Type
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {TAG_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  style={{
                    padding: "12px 8px",
                    borderRadius: 8,
                    border: `1px solid ${type === t.id ? t.color : "#1e1e1e"}`,
                    background: type === t.id ? t.color + "11" : "#0a0a0a",
                    color: type === t.id ? t.color : "#444",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Key */}
        <div>
          <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Key
          </label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.replace(/\s/g, "_").toLowerCase())}
            disabled={isEdit}
            placeholder="e.g. aria_chen"
            style={{
              width: "100%", background: "#080808", border: "1px solid #1e1e1e",
              borderRadius: 8, color: isEdit ? "#444" : "#e8e8e8",
              fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Description fields */}
        {type === "character" && (
          <>
            <div>
              <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Appearance Description
              </label>
              <textarea
                value={appearDesc}
                onChange={(e) => setAppearDesc(e.target.value)}
                rows={2}
                placeholder="Describe face, hair, skin, eyes…"
                style={{ width: "100%", background: "#080808", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Body Description
              </label>
              <textarea
                value={bodyDesc}
                onChange={(e) => setBodyDesc(e.target.value)}
                rows={2}
                placeholder="Describe physique, proportions…"
                style={{ width: "100%", background: "#080808", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <ImageUploadGrid label="Face Images" files={faceImgs} onAdd={(imgs) => setFaceImgs((p) => [...p, ...imgs])} onRemove={(i) => setFaceImgs((p) => p.filter((_, j) => j !== i))} />
            <ImageUploadGrid label="Body Images" files={bodyImgs} onAdd={(imgs) => setBodyImgs((p) => [...p, ...imgs])} onRemove={(i) => setBodyImgs((p) => p.filter((_, j) => j !== i))} />
          </>
        )}

        {type === "prop" && (
          <>
            <div>
              <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</label>
              <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2} placeholder="Describe the prop…" style={{ width: "100%", background: "#080808", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <ImageUploadGrid label="Images" files={propImgs} onAdd={(imgs) => setPropImgs((p) => [...p, ...imgs])} onRemove={(i) => setPropImgs((p) => p.filter((_, j) => j !== i))} />
          </>
        )}

        {type === "outfit" && (
          <>
            <div>
              <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</label>
              <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2} placeholder="Describe the outfit…" style={{ width: "100%", background: "#080808", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <ImageUploadGrid label="Images" files={outfitImgs} onAdd={(imgs) => setOutfitImgs((p) => [...p, ...imgs])} onRemove={(i) => setOutfitImgs((p) => p.filter((_, j) => j !== i))} />
          </>
        )}

        {type === "location" && (
          <>
            <div>
              <label style={{ display: "block", color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</label>
              <textarea value={basicDesc} onChange={(e) => setBasicDesc(e.target.value)} rows={2} placeholder="Describe the location…" style={{ width: "100%", background: "#080808", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <ImageUploadGrid label="Images" files={locationImgs} onAdd={(imgs) => setLocationImgs((p) => [...p, ...imgs])} onRemove={(i) => setLocationImgs((p) => p.filter((_, j) => j !== i))} />
          </>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: "10px 24px", background: "#f0f0f0", border: "none", borderRadius: 8, color: "#000", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving…" : isEdit ? "Update Tag" : "Create Tag"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tag Detail Panel ──────────────────────────────────────────────────────────
function TagDetail({ tag, onClose, onUpdated, toast }) {
  const [adding, setAdding] = useState(false);
  const [newImgs, setNewImgs] = useState({ face: [], body: [], prop: [], outfit: [], location: [] });
  const [saving, setSaving] = useState(false);

  const groups = ["face", "body", "prop", "outfit", "location"].filter(
    (g) => tag.assets[g]?.length > 0 || (tag.type === "character" ? g === "face" || g === "body" : g === tag.type || g === "prop")
  );

  const handleAddImages = async () => {
    const body = {};
    for (const g of ["face","body","prop","outfit","location"]) {
      if (newImgs[g].length > 0) body[g] = newImgs[g];
    }
    if (Object.keys(body).length === 0) return toast.add("Add some images first", "error");
    setSaving(true);
    try {
      const res = await api.post(`/tags/${tag.key}/images`, body);
      if (res.ok) { toast.add("Images added!", "success"); onUpdated(res.tag); setAdding(false); setNewImgs({ face: [], body: [], prop: [], outfit: [], location: [] }); }
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

  const relevantGroups = tag.type === "character"
    ? ["face", "body"]
    : tag.type === "prop" ? ["prop"]
    : tag.type === "outfit" ? ["outfit"]
    : ["location"];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", overflow: "auto", padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#f0f0f0", margin: 0 }}>@{tag.key}</h2>
            <TagPill type={tag.type} />
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Descriptions */}
        {tag.lock?.basicDescription && (
          <p style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, lineHeight: 1.7 }}>{tag.lock.basicDescription}</p>
        )}
        {tag.lock?.appearanceDescription && (
          <div>
            <div style={{ color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Appearance</div>
            <p style={{ color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0, lineHeight: 1.7 }}>{tag.lock.appearanceDescription}</p>
          </div>
        )}

        {/* Existing images */}
        {["face","body","prop","outfit","location"].map((group) => {
          const assets = tag.assets[group] || [];
          if (assets.length === 0) return null;
          return (
            <div key={group}>
              <div style={{ color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{group}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                {assets.map((asset) => (
                  <div key={asset.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "1px solid #1a1a1a" }}>
                    <img src={asset.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      onClick={() => handleDeleteImage(group, asset.id)}
                      style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "none", color: "#ff3b3b", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Add images */}
        {adding ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {relevantGroups.map((g) => (
              <ImageUploadGrid
                key={g}
                label={`Add ${g} images`}
                files={newImgs[g]}
                onAdd={(imgs) => setNewImgs((p) => ({ ...p, [g]: [...p[g], ...imgs] }))}
                onRemove={(i) => setNewImgs((p) => ({ ...p, [g]: p[g].filter((_, j) => j !== i) }))}
              />
            ))}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAdding(false)} style={{ padding: "8px 16px", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAddImages} disabled={saving} style={{ padding: "8px 20px", background: "#f0f0f0", border: "none", borderRadius: 8, color: "#000", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "Add Images"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ alignSelf: "flex-start", padding: "8px 20px", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#888", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer" }}>
            + Add Images
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tags Page ─────────────────────────────────────────────────────────────────
function TagsPage({ tags, onTagsChange, toast }) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filtered = tags.filter((t) =>
    t.key.toLowerCase().includes(search.toLowerCase()) ||
    t.type.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (tag) => {
    // No delete endpoint in spec — show note
    toast.add("Delete not available in current API spec", "error");
    setDeleteConfirm(null);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: "#f0f0f0", margin: 0, letterSpacing: "-0.02em" }}>Tags</h1>
          <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, marginTop: 6 }}>
            {tags.length} tag{tags.length !== 1 ? "s" : ""} — characters, props, outfits & locations
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: "10px 20px", background: "#f0f0f0", border: "none", borderRadius: 8, color: "#000", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}
        >
          + New Tag
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags…"
          style={{ width: "100%", background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 8, color: "#e8e8e8", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "10px 14px", outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {["character","prop","outfit","location"].map((t) => {
          const count = tags.filter(x => x.type === t).length;
          return (
            <button
              key={t}
              onClick={() => setSearch(search === t ? "" : t)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${search === t ? TYPE_COLOR[t] : "#1e1e1e"}`,
                background: search === t ? TYPE_COLOR[t] + "11" : "transparent",
                color: search === t ? TYPE_COLOR[t] : "#444",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {t} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
          {search ? "No tags match your search" : "No tags yet — create one to get started"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {filtered.map((tag) => {
            const allAssets = Object.values(tag.assets).flat();
            const preview = allAssets[0]?.url;
            return (
              <div
                key={tag.key}
                onClick={() => setSelectedTag(tag)}
                style={{
                  background: "#0a0a0a",
                  border: "1px solid #1a1a1a",
                  borderRadius: 12,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "border-color 0.2s, transform 0.15s",
                  position: "relative",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {preview ? (
                  <div style={{ height: 140, overflow: "hidden" }}>
                    <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ) : (
                  <div style={{ height: 80, background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: TYPE_COLOR[tag.type], fontSize: 24 }}>
                      {tag.type === "character" ? "◈" : tag.type === "prop" ? "⬡" : tag.type === "location" ? "◎" : "◇"}
                    </span>
                  </div>
                )}
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#e0e0e0" }}>@{tag.key}</span>
                    <TagPill type={tag.type} />
                  </div>
                  {tag.lock?.basicDescription || tag.lock?.appearanceDescription ? (
                    <p style={{ color: "#444", fontFamily: "'DM Mono', monospace", fontSize: 11, margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tag.lock.basicDescription || tag.lock.appearanceDescription}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                    <span style={{ color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                      {allAssets.length} image{allAssets.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(tag); }}
                      style={{ padding: "2px 8px", borderRadius: 4, background: "none", border: "1px solid #1e1e1e", color: "#333", fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff3b3b44"; e.currentTarget.style.color = "#ff3b3b"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#333"; }}
                    >
                      delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <TagFormModal
          onClose={() => setShowCreate(false)}
          onSave={(tag) => { onTagsChange(); setShowCreate(false); }}
          toast={toast}
        />
      )}

      {selectedTag && (
        <TagDetail
          tag={selectedTag}
          onClose={() => setSelectedTag(null)}
          onUpdated={(updated) => { onTagsChange(); setSelectedTag(updated); }}
          toast={toast}
        />
      )}

      {deleteConfirm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}
        >
          <div style={{ background: "#0e0e0e", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, maxWidth: 360, width: "100%" }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", color: "#f0f0f0", margin: "0 0 12px" }}>Delete @{deleteConfirm.key}?</h3>
            <p style={{ color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: "0 0 20px" }}>This action cannot be undone.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "8px 16px", background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#555", fontFamily: "'DM Mono', monospace", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ padding: "8px 16px", background: "#ff3b3b", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("generate");
  const [tags, setTags] = useState([]);
  const toast = useToast();

  const loadTags = useCallback(async () => {
    try {
      const res = await api.get("/tags");
      if (res.ok) setTags(res.tags);
    } catch {}
  }, []);

  useEffect(() => { loadTags(); }, [loadTags]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #080808; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #080808; } ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 3px; }
        select option { background: #0e0e0e; }
      `}</style>

      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #111",
        display: "flex", alignItems: "center", padding: "0 24px", height: 56,
      }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "#e8e8e8", fontWeight: 700, letterSpacing: "-0.02em", marginRight: 40 }}>
          Seedream Studio
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["generate","Generate"],["tags","Tags"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                background: page === id ? "#1a1a1a" : "transparent",
                color: page === id ? "#e8e8e8" : "#444",
                fontFamily: "'DM Mono', monospace",
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ color: "#222", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
          {tags.length} tags loaded
        </div>
      </nav>

      {/* Pages */}
      {page === "generate" && <GeneratePage tags={tags} toast={toast} />}
      {page === "tags" && <TagsPage tags={tags} onTagsChange={loadTags} toast={toast} />}

      <Toast toasts={toast.toasts} remove={toast.remove} />
    </>
  );
}
