import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { colors, font, radius, fieldLabel as FL, fieldInput as FI } from "../theme";

/**
 * SettingsModal — full-screen overlay for user settings.
 *
 * Sections:
 *  - WaveSpeed API key (password input with show/hide)
 *  - Clear cache (with info tooltip + confirmation)
 *  - Clear gallery (with confirmation)
 *
 * @param {{ onClose: () => void, toast: { add: Function } }} props
 */
const THEME_OPTIONS = [
  { key: "dark",     label: "Dark",     desc: "Pure black"  },
  { key: "slate",    label: "Slate",    desc: "Cool blue"   },
  { key: "warm",     label: "Warm",     desc: "Amber"       },
  { key: "light",    label: "Light",    desc: "Light mode"  },
  { key: "forest",   label: "Forest",   desc: "Deep green"  },
  { key: "rose",     label: "Rose",     desc: "Dusty mauve" },
  { key: "midnight", label: "Midnight", desc: "Indigo"      },
  { key: "sand",     label: "Sand",     desc: "Warm beige"  },
  { key: "mist",     label: "Mist",     desc: "Cool blue"   },
  { key: "sage",     label: "Sage",     desc: "Soft green"  },
  { key: "neon",     label: "Neon",     desc: "Phosphor"    },
  { key: "dusk",     label: "Dusk",     desc: "Twilight"    },
];

export function SettingsModal({ onClose, toast, theme, setTheme }) {
  // Current API key value in the input
  const [apiKey,               setApiKey]               = useState("");
  // Toggle to reveal/hide the key
  const [showKey,              setShowKey]              = useState(false);
  // True while the save request is in-flight
  const [savingKey,            setSavingKey]            = useState(false);
  // True while a clear operation is in-flight
  const [clearing,             setClearing]             = useState(false);
  // Whether the cache-clear confirmation row is showing
  const [confirmClearCache,    setConfirmClearCache]    = useState(false);
  // Whether the gallery-clear confirmation row is showing
  const [confirmClearGallery,  setConfirmClearGallery]  = useState(false);
  // Whether the cache info tooltip is visible
  const [showCacheInfo,        setShowCacheInfo]        = useState(false);

  // Load current settings on mount
  useEffect(() => {
    api.get("/settings").then((res) => {
      if (res.ok) setApiKey(res.settings.wavespeedApiKey || "");
    });
  }, []);

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const saveApiKey = async () => {
    setSavingKey(true);
    try {
      const res = await api.put("/settings", { wavespeedApiKey: apiKey.trim() });
      if (res.ok) {
        toast.add("API key saved", "success");
      } else {
        toast.add(res.error || "Failed to save", "error");
      }
    } catch {
      toast.add("Failed to save API key", "error");
    } finally {
      setSavingKey(false);
    }
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      const res = await api.post("/settings/clear-cache", {});
      if (res.ok) {
        toast.add("Cache cleared", "success");
        setConfirmClearCache(false);
      } else {
        toast.add(res.error || "Failed to clear cache", "error");
      }
    } catch {
      toast.add("Failed to clear cache", "error");
    } finally {
      setClearing(false);
    }
  };

  const clearGallery = async () => {
    setClearing(true);
    try {
      const res = await api.post("/settings/clear-gallery", {});
      if (res.ok) {
        toast.add("Gallery cleared", "success");
        setConfirmClearGallery(false);
      } else {
        toast.add(res.error || "Failed to clear gallery", "error");
      }
    } catch {
      toast.add("Failed to clear gallery", "error");
    } finally {
      setClearing(false);
    }
  };

  // ── Shared styles ────────────────────────────────────────────────────────────

  const section = {
    borderBottom: `1px solid ${colors.borderMid}`,
    paddingBottom: 28,
    marginBottom:  28,
  };

  const sectionTitle = {
    color:         colors.textMid,
    fontFamily:    font.mono,
    fontSize:      font.sizeSm,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom:  16,
  };

  const dangerBtn = {
    padding:      "7px 16px",
    borderRadius: radius.md,
    border:       `1px solid #3a1a1a`,
    background:   "#1a0a0a",
    color:        "#ff6b6b",
    fontFamily:   font.mono,
    fontSize:     font.sizeLg,
    cursor:       "pointer",
  };

  const confirmBtn = (primary) => ({
    padding:      "6px 14px",
    borderRadius: radius.md,
    border:       "none",
    background:   primary ? "#ff3b3b" : colors.borderStrong,
    color:        primary ? "#fff" : colors.textMid,
    fontFamily:   font.mono,
    fontSize:     font.sizeSm,
    cursor:       "pointer",
  });

  const ghostBtn = {
    background:   "none",
    border:       "none",
    color:        colors.textMuted,
    fontFamily:   font.mono,
    fontSize:     font.sizeSm,
    cursor:       "pointer",
    padding:      "2px 6px",
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     200,
        background: "rgba(0,0,0,0.7)",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{
        background:   colors.surfaceModal,
        border:       `1px solid ${colors.borderMid}`,
        borderRadius: radius.xl,
        width:        480,
        maxWidth:     "calc(100vw - 32px)",
        padding:      32,
        maxHeight:    "80vh",
        overflowY:    "auto",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: font.mono, fontSize: font.sizeXl, color: colors.textHigh, flex: 1 }}>
            Settings
          </div>
          <button onClick={onClose} style={ghostBtn}>✕</button>
        </div>

        {/* ── Theme ─────────────────────────────────────────────────────────── */}
        <div style={section}>
          <div style={sectionTitle}>Theme</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
            {THEME_OPTIONS.map(({ key, label, desc }) => {
              const active = theme === key;
              return (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  style={{
                    flex:         1,
                    padding:      "10px 0",
                    borderRadius: radius.md,
                    border:       `1px solid ${active ? colors.borderFocus : colors.borderMid}`,
                    background:   active ? colors.borderStrong : "transparent",
                    color:        active ? colors.textHigh : colors.textMuted,
                    fontFamily:   font.mono,
                    fontSize:     font.sizeSm,
                    cursor:       "pointer",
                    transition:   "all 0.15s",
                    display:      "flex",
                    flexDirection:"column",
                    alignItems:   "center",
                    gap:          3,
                  }}
                >
                  <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
                  <span style={{ fontSize: font.sizeXs, color: active ? colors.textMid : colors.textGhost }}>{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── API Key ────────────────────────────────────────────────────────── */}
        <div style={section}>
          <div style={sectionTitle}>WaveSpeed API Key</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
                placeholder="ws-…"
                spellCheck={false}
                style={{ ...FI, paddingRight: 36 }}
              />
              {/* Show/hide toggle */}
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{
                  position:   "absolute",
                  right:      10,
                  top:        "50%",
                  transform:  "translateY(-50%)",
                  background: "none",
                  border:     "none",
                  color:      colors.textMuted,
                  cursor:     "pointer",
                  fontFamily: font.mono,
                  fontSize:   font.sizeSm,
                  padding:    0,
                }}
              >
                {showKey ? "hide" : "show"}
              </button>
            </div>
            <button
              onClick={saveApiKey}
              disabled={savingKey}
              style={{
                padding:      "0 18px",
                borderRadius: radius.md,
                border:       "none",
                background:   colors.primary,
                color:        colors.primaryText,
                fontFamily:   font.mono,
                fontSize:     font.sizeLg,
                cursor:       savingKey ? "not-allowed" : "pointer",
                opacity:      savingKey ? 0.6 : 1,
                whiteSpace:   "nowrap",
              }}
            >
              {savingKey ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* ── Cache ──────────────────────────────────────────────────────────── */}
        <div style={section}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={sectionTitle}>Prompt Cache</div>
            {/* Info tooltip trigger */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <button
                onClick={() => setShowCacheInfo((v) => !v)}
                style={{
                  width:        18,
                  height:       18,
                  borderRadius: "50%",
                  border:       `1px solid ${colors.borderStrong}`,
                  background:   colors.surfaceSink,
                  color:        colors.textMuted,
                  fontFamily:   font.mono,
                  fontSize:     10,
                  cursor:       "pointer",
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  padding:      0,
                }}
              >
                ?
              </button>
              {showCacheInfo && (
                <div style={{
                  position:     "absolute",
                  top:          24,
                  left:         0,
                  zIndex:       10,
                  background:   colors.surfaceModal,
                  border:       `1px solid ${colors.borderStrong}`,
                  borderRadius: radius.md,
                  padding:      "12px 14px",
                  width:        280,
                  color:        colors.textMid,
                  fontFamily:   font.mono,
                  fontSize:     font.sizeSm,
                  lineHeight:   1.6,
                }}>
                  When you generate with @tags, the compiled prompt is cached so repeated generations with the same prompt and tags skip the LLM planning step. Clearing the cache forces a fresh compile on the next generation.
                  <button
                    onClick={() => setShowCacheInfo(false)}
                    style={{ ...ghostBtn, display: "block", marginTop: 8 }}
                  >
                    close
                  </button>
                </div>
              )}
            </div>
          </div>

          {!confirmClearCache ? (
            <button onClick={() => setConfirmClearCache(true)} style={dangerBtn}>
              Clear Cache
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: colors.textMid, fontFamily: font.mono, fontSize: font.sizeSm }}>
                Are you sure?
              </span>
              <button onClick={clearCache} disabled={clearing} style={confirmBtn(true)}>
                {clearing ? "Clearing…" : "Yes, clear it"}
              </button>
              <button onClick={() => setConfirmClearCache(false)} style={confirmBtn(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Gallery ────────────────────────────────────────────────────────── */}
        <div style={{ paddingBottom: 4 }}>
          <div style={sectionTitle}>Gallery</div>

          {!confirmClearGallery ? (
            <button onClick={() => setConfirmClearGallery(true)} style={dangerBtn}>
              Clear Gallery
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: colors.textMid, fontFamily: font.mono, fontSize: font.sizeSm }}>
                This will delete all gallery entries. Are you sure?
              </span>
              <button onClick={clearGallery} disabled={clearing} style={confirmBtn(true)}>
                {clearing ? "Clearing…" : "Yes, clear it"}
              </button>
              <button onClick={() => setConfirmClearGallery(false)} style={confirmBtn(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
