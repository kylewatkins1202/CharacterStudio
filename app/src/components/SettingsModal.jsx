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

  // Expo tunnel state
  const [expoStatus,     setExpoStatus]     = useState("idle"); // "idle"|"installing"|"starting"|"running"|"error"
  const [expoUrl,        setExpoUrl]        = useState(null);
  const [expoQrDataUrl,  setExpoQrDataUrl]  = useState(null);
  const [expoLogs,       setExpoLogs]       = useState([]);

  // Tailscale state
  const [tailscaleIp,          setTailscaleIp]          = useState(null);
  const [tailscaleInstalled,   setTailscaleInstalled]   = useState(false);
  const [tailscaleLoading,     setTailscaleLoading]     = useState(false);
  const [installingTailscale,  setInstallingTailscale]  = useState(false);

  const isElectron = Boolean(window.electronAPI);

  // Load current settings on mount
  useEffect(() => {
    api.get("/settings").then((res) => {
      if (res.ok) setApiKey(res.settings.wavespeedApiKey || "");
    });
  }, []);

  // Register Electron IPC listeners and fetch Tailscale IP on mount
  useEffect(() => {
    if (!isElectron) return;

    // Rehydrate tunnel state in case the modal was closed while it was running
    window.electronAPI.getExpoState().then(({ status, url, qrDataUrl }) => {
      setExpoStatus(status);
      if (url) setExpoUrl(url);
      if (qrDataUrl) setExpoQrDataUrl(qrDataUrl);
    });

    window.electronAPI.onExpoQrUpdate(({ url, qrDataUrl }) => {
      setExpoUrl(url);
      setExpoQrDataUrl(qrDataUrl);
    });
    window.electronAPI.onExpoStatus((status) => setExpoStatus(status));
    window.electronAPI.onExpoLog((line) => {
      if (!line.trim()) return;
      setExpoLogs((prev) => [...prev.slice(-199), line]);
    });

    fetchTailscaleIp();

    return () => window.electronAPI.removeExpoListeners();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTailscaleIp = async () => {
    if (!isElectron) return;
    setTailscaleLoading(true);
    try {
      const result = await window.electronAPI.getTailscaleIp();
      setTailscaleIp(result.ip);
      setTailscaleInstalled(result.installed);
    } finally {
      setTailscaleLoading(false);
    }
  };

  const toggleExpoTunnel = async () => {
    if (expoStatus === "idle" || expoStatus === "error") {
      setExpoUrl(null);
      setExpoQrDataUrl(null);
      setExpoLogs([]);
      await window.electronAPI.startExpoTunnel();
    } else {
      await window.electronAPI.stopExpoTunnel();
      setExpoUrl(null);
      setExpoQrDataUrl(null);
      setExpoLogs([]);
    }
  };

  const handleInstallTailscale = async () => {
    setInstallingTailscale(true);
    try {
      const result = await window.electronAPI.installTailscale();
      if (result.ok) {
        toast.add("Tailscale installed — sign in via the system tray", "success");
        fetchTailscaleIp();
      } else {
        toast.add(result.error || "Installation failed", "error");
      }
    } catch {
      toast.add("Failed to install Tailscale", "error");
    } finally {
      setInstallingTailscale(false);
    }
  };

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

        {/* ── Mobile App Hosting ────────────────────────────────────────────── */}
        {isElectron && (
          <div style={section}>
            <div style={sectionTitle}>Mobile App Hosting</div>

            {/* Toggle button */}
            <button
              onClick={toggleExpoTunnel}
              disabled={expoStatus === "starting"}
              style={{
                padding:      "7px 18px",
                borderRadius: radius.md,
                border:       `1px solid ${expoStatus === "running" ? "#2a3a1a" : colors.borderStrong}`,
                background:   expoStatus === "running" ? "#1a2a0a" : colors.surfaceSink,
                color:        expoStatus === "running" ? "#7ec850" : colors.textMid,
                fontFamily:   font.mono,
                fontSize:     font.sizeLg,
                cursor:       expoStatus === "starting" ? "not-allowed" : "pointer",
                opacity:      expoStatus === "starting" ? 0.6 : 1,
                transition:   "all 0.15s",
              }}
            >
              {expoStatus === "idle"     && "Host Mobile App"}
              {expoStatus === "starting" && "Starting…"}
              {expoStatus === "running"  && "Stop Hosting"}
              {expoStatus === "error"    && "Retry"}
            </button>

            {/* Status label */}
            {expoStatus !== "idle" && (
              <div style={{
                marginTop:  10,
                fontFamily: font.mono,
                fontSize:   font.sizeSm,
                color:      expoStatus === "running"   ? "#7ec850"
                          : expoStatus === "error"     ? "#ff6b6b"
                          : colors.textMuted,
              }}>
                {expoStatus === "installing" && "Installing dependencies — first run only…"}
                {expoStatus === "starting"   && "Starting Expo tunnel…"}
                {expoStatus === "running"    && "Expo tunnel is running"}
                {expoStatus === "error"      && "Expo failed to start"}
              </div>
            )}

            {/* Live log — shown while installing/starting, collapsed once QR is available */}
            {(expoStatus === "installing" || expoStatus === "starting" || expoStatus === "error") && expoLogs.length > 0 && (
              <div style={{
                marginTop:    12,
                background:   colors.surfaceSink,
                border:       `1px solid ${colors.borderMid}`,
                borderRadius: radius.md,
                padding:      "10px 12px",
                maxHeight:    140,
                overflowY:    "auto",
                fontFamily:   font.mono,
                fontSize:     font.sizeXs,
                color:        colors.textMuted,
                lineHeight:   1.6,
                whiteSpace:   "pre-wrap",
                wordBreak:    "break-all",
              }}
                ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
              >
                {expoLogs.join("\n")}
              </div>
            )}

            {/* QR code + URL */}
            {expoQrDataUrl && (
              <div style={{ marginTop: 16, display: "flex", alignItems: "flex-start", gap: 16 }}>
                <img
                  src={expoQrDataUrl}
                  alt="Expo QR code"
                  style={{
                    width:        160,
                    height:       160,
                    borderRadius: radius.md,
                    border:       `1px solid ${colors.borderStrong}`,
                    background:   "#fff",
                    flexShrink:   0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.textMid, fontFamily: font.mono, fontSize: font.sizeSm, marginBottom: 6 }}>
                    Scan with Expo Go
                  </div>
                  <div style={{
                    color:        colors.textMuted,
                    fontFamily:   font.mono,
                    fontSize:     font.sizeXs,
                    wordBreak:    "break-all",
                    lineHeight:   1.5,
                  }}>
                    {expoUrl}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tailscale ─────────────────────────────────────────────────────── */}
        {isElectron && (
          <div style={section}>
            <div style={sectionTitle}>Tailscale</div>

            {tailscaleInstalled ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{
                    fontFamily: font.mono,
                    fontSize:   font.sizeLg,
                    color:      tailscaleIp ? colors.textHigh : colors.textMuted,
                  }}>
                    {tailscaleLoading ? "Fetching…" : tailscaleIp ? tailscaleIp : "Not connected"}
                  </div>
                  <button
                    onClick={fetchTailscaleIp}
                    disabled={tailscaleLoading}
                    title="Refresh IP"
                    style={{
                      background:   "none",
                      border:       `1px solid ${colors.borderStrong}`,
                      borderRadius: radius.md,
                      color:        colors.textMuted,
                      fontFamily:   font.mono,
                      fontSize:     font.sizeLg,
                      cursor:       tailscaleLoading ? "not-allowed" : "pointer",
                      padding:      "3px 10px",
                      opacity:      tailscaleLoading ? 0.5 : 1,
                    }}
                  >
                    ↺
                  </button>
                </div>
                {tailscaleIp && (
                  <div style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm }}>
                    Set your mobile Server URL to{" "}
                    <span style={{ color: colors.textMid }}>http://{tailscaleIp}:4989</span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, marginBottom: 12 }}>
                  Tailscale not detected. Install it to access this server from your phone over a secure tunnel.
                </div>
                <button
                  onClick={handleInstallTailscale}
                  disabled={installingTailscale}
                  style={{
                    padding:      "7px 18px",
                    borderRadius: radius.md,
                    border:       `1px solid ${colors.borderStrong}`,
                    background:   colors.surfaceSink,
                    color:        colors.textMid,
                    fontFamily:   font.mono,
                    fontSize:     font.sizeLg,
                    cursor:       installingTailscale ? "not-allowed" : "pointer",
                    opacity:      installingTailscale ? 0.6 : 1,
                  }}
                >
                  {installingTailscale ? "Installing…" : "Install Tailscale"}
                </button>
              </div>
            )}
          </div>
        )}

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
