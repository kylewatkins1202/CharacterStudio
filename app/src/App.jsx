import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "./lib/api";
import { makeSyntheticResult } from "./lib/utils";
import { ASPECT_RATIOS } from "./lib/constants";
import { globalCss, getThemeCss, colors, font } from "./theme";
import { useToast, Toast } from "./components/Toast";
import { GeneratePage } from "./components/GeneratePage";
import { GalleryPage } from "./components/GalleryPage";
import { TagsPage } from "./components/TagsPage";
import { SettingsModal } from "./components/SettingsModal";
import { AssetsPage } from "./components/AssetsPage";
import { UpscalePage } from "./components/UpscalePage";

const NAV_TABS = [
  ["generate", "Generate"],
  ["gallery",  "Gallery"],   // label computed below to include count badge
  ["upscale",  "Upscale"],
  ["tags",     "Tags"],
  ["assets",   "Assets"],
];

/**
 * App — root component.
 *
 * Owns all cross-tab state (tags, generate form, reference images) so that
 * switching tabs does not reset in-progress work.
 *
 * Generate and Tags pages are kept mounted (display:none) to preserve state.
 * GalleryPage unmounts on tab switch so it always re-fetches fresh data.
 */
export default function App() {
  // Active tab: "generate" | "gallery" | "tags"
  const [page,         setPage]         = useState("generate");
  // Whether the settings modal is open
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Active theme — persisted to localStorage
  const [theme, setThemeState] = useState(() => localStorage.getItem("cs-theme") || "dark");
  const setTheme = (name) => { localStorage.setItem("cs-theme", name); setThemeState(name); };
  // All tags fetched from the API
  const [tags,         setTags]         = useState([]);
  // Number of gallery entries — drives the nav badge label
  const [galleryCount, setGalleryCount] = useState(0);
  // Toast notification controller
  const toast = useToast();

  // ── Generate page state (hoisted here so it survives tab switches) ──────────

  // Raw prompt text typed by the user
  const [prompt,          setPrompt]          = useState("");
  // Selected aspect ratio object { label, w, h }
  const [aspect,          setAspect]          = useState(ASPECT_RATIOS[0]);
  // Slider value — longer dimension of the output image in pixels
  const [baseSize,        setBaseSize]        = useState(2048);
  // Raw WaveSpeed result from the last generation
  const [result,          setResult]          = useState(null);
  // Compiled prompt object { rawPrompt, images } from the last generation
  const [compiled,        setCompiled]        = useState(null);
  // When true the next generate call skips the server-side cache
  const [resetCache,      setResetCache]      = useState(false);
  // Array of reference image objects attached to the current prompt
  const [referenceImages, setReferenceImages] = useState([]);
  // Mode for generating
  const [mode, setMode] = useState('wavespeed')
  // Raw negative prompt typed by user
  const [negPrompt, setNegPrompt] = useState("")
  // Cloud Model
  const [cloudModel, setCloudModel] = useState("seedream")
  // Local (ComfyUI) generation options — defaults match buildDynamicWorkflow
  const [localModel,   setLocalModel]   = useState("DarkBeast")
  const [localSteps,   setLocalSteps]   = useState(4)
  const [localCfg,     setLocalCfg]     = useState(1.5)
  const [localDenoise, setLocalDenoise] = useState(0.9)
  const [localLoras,     setLocalLoras]     = useState([])
  const [localScheduler, setLocalScheduler] = useState("sgm_uniform")
  const [localSampler,   setLocalSampler]   = useState("euler")
  // Model 

  // Upscale page images
  const [upscaleImages, setUpscaleImages] = useState([]);

  // Max reference images allowed by the current mode (null = unlimited)
  const maxReferenceImages = useMemo(() => mode === 'local' ? 3 : null, [mode]);

  // Prune reference images down to the limit whenever mode changes
  useEffect(() => {
    if (maxReferenceImages != null) {
      setReferenceImages((p) => p.length > maxReferenceImages ? p.slice(0, maxReferenceImages) : p);
    }
  }, [maxReferenceImages]);
  // ── Data loaders ─────────────────────────────────────────────────────────────

  /**
   * Fetches all tags from the API and stores them in state.
   * @returns {Promise<void>}
   */
  const loadTags = useCallback(async () => {
    try {
      // Fetch tag list
      const res = await api.get("/tags");
      // Update state if the request succeeded
      if (res.ok) setTags(res.tags);
    } catch {}
  }, []);

  /**
   * Fetches the gallery entry count and updates the nav badge.
   * @returns {Promise<void>}
   */
  const loadGalleryCount = useCallback(async () => {
    try {
      const res = await api.get("/gallery?pageSize=1");
      if (res.ok) setGalleryCount(res.total ?? res.count ?? 0);
    } catch {}
  }, []);

  const [localGenerationEnabled, setLocalGenerationEnabled] = useState(false);

  // Load tags, gallery count, and feature config once on mount
  useEffect(() => {
    loadTags();
    loadGalleryCount();
    api.get("/config").then((res) => { if (res.localGenerationEnabled) setLocalGenerationEnabled(true); }).catch(() => {});
  }, [loadTags, loadGalleryCount]);

  // ── SSE — live gallery updates ────────────────────────────────────────────────

  // null  = no SSE snapshot yet (GalleryPage will fetch on mount as usual)
  // array = live entries maintained by SSE; GalleryPage reads from here
  const [sseEntries, setSseEntries] = useState(null);
  // Version token from the last gallery fetch — used by GalleryPage to skip
  // the full fetch when data hasn't changed since the last visit.
  const [galleryVersion, setGalleryVersion] = useState(null);

  useEffect(() => {
    const es = new EventSource("/api/events");

    // A new loading entry was created — prepend it to the live list
    es.addEventListener("gallery:new", (e) => {
      const entry = JSON.parse(e.data);
      setSseEntries((prev) => (prev ? [entry, ...prev] : [entry]));
      setGalleryCount((p) => p + 1);
    });

    // A generation completed or failed — update the matching entry in-place
    es.addEventListener("gallery:update", (e) => {
      const updated = JSON.parse(e.data);
      setSseEntries((prev) => {
        if (!prev) return null; // gallery not yet loaded; let GalleryPage fetch fresh
        return prev.map((en) => (en.id === updated.id ? updated : en));
      });
      // Show the completed image on the generate page
      if (!updated.loading && !updated.error) {
        setResult(makeSyntheticResult(updated.imageUrl || updated.localUrl));
        setCompiled(
          updated.compiledPrompt || updated.compiledImages?.length
            ? { rawPrompt: updated.compiledPrompt || "", images: updated.compiledImages || [] }
            : null
        );
      }
    });

    es.onerror = () => console.warn("[SSE] connection error — browser will retry");

    return () => es.close();
  }, []);

  // ── Cross-page callbacks ──────────────────────────────────────────────────────

  /**
   * Add an existing asset as a reference image and navigate to the generate tab.
   * @param {{ id: string, url: string, purpose?: string }} asset
   */
  const handleAddReference = useCallback((asset) => {
    setReferenceImages((p) => {
      if (maxReferenceImages != null && p.length >= maxReferenceImages) {
        toast.add(`Reference image limit reached (${maxReferenceImages})`, "error");
        return p;
      }
      return [...p, { assetId: asset.id, url: asset.url, purpose: "" }];
    });
    setPage("generate");
  }, [maxReferenceImages, toast]);

  /**
   * Send a gallery entry to the upscale page and navigate there.
   * @param {object} entry
   */
  const handleUpscale = useCallback((entry) => {
    setUpscaleImages([{ assetId: entry.imageAssetId, url: entry.localUrl || entry.imageUrl, purpose: "" }]);
    setPage("upscale");
  }, []);

  /**
   * Increment the gallery badge after a successful generation.
   */
  const handleGenerated = useCallback(() => {
    // Bump the count so the nav badge stays accurate without a refetch
    setGalleryCount((p) => p + 1);
  }, []);

  /**
   * Restore a gallery entry to the generate page:
   * - prefills the prompt
   * - restores reference images, aspect ratio, and base size
   * - shows the saved image as the current result
   * @param {object} entry
   */
  const handleUsePrompt = useCallback((entry) => {
    if (entry.mode === 'local') {
      setMode('local') 
      setNegPrompt(entry?.userNegPrompt ?? '')
      setLocalModel(entry.model || "DarkBeast")
      setLocalSteps(entry.steps || 4)
      setLocalCfg(entry.cfg || 1.5)
      setLocalDenoise(entry.denoise || 0.9)
      setLocalLoras(entry.loras || [])
      setLocalScheduler(entry.scheduler || "sgm_uniform")
      setLocalSampler(entry.sampler || "euler")
    }
    else {
      setMode('wavespeed')
      setCloudModel(entry.model || "seedream")
    }
    
    // Restore the original user prompt
    setPrompt(entry.userPrompt);

    // Restore reference images (populated server-side from asset IDs)
    if (entry.referenceImages?.length) {
      setReferenceImages(entry.referenceImages.map(({ url, purpose }) => ({ url, isUrl: true, purpose: purpose || "" })));
    } else {
      setReferenceImages([]);
    }

    // Restore aspect ratio and base size from the recorded size string (e.g. "1024*1024")
    if (entry.size) {
      // Split "W*H" into numeric width and height
      const [w, h] = entry.size.split("*").map(Number);
      if (w && h) {
        // Reduce W:H to its lowest terms to match an ASPECT_RATIOS entry
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const d   = gcd(w, h);
        const matched = ASPECT_RATIOS.find((r) => r.w === w / d && r.h === h / d);
        // Apply the matched ratio if found
        if (matched) setAspect(matched);
        // Restore the base size to the longer dimension
        setBaseSize(Math.max(w, h));
      }
    }

    // Show the saved image as the current generation result
    setResult(makeSyntheticResult(entry.imageUrl));
    // Restore the compiled prompt block if available
    setCompiled(
      entry.compiledPrompt || entry.compiledImages?.length
        ? { rawPrompt: entry.compiledPrompt || "", images: entry.compiledImages || [] }
        : null
    );
    // Switch to the generate tab
    setPage("generate");
  }, []);

  // ── Nav labels ────────────────────────────────────────────────────────────────

  /**
   * Returns the display label for a nav tab, including the gallery count badge.
   * @param {string} id
   * @returns {string}
   */
  const navLabel = (id) => {
    // All other tabs use their static label from NAV_TABS
    return NAV_TABS.find(([tabId]) => tabId === id)?.[1] ?? id;
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{getThemeCss(theme) + globalCss}</style>

      {/* Top navigation bar — also serves as the drag region for the frameless window */}
      <nav style={{
        position:          "sticky",
        top:               0,
        zIndex:            50,
        background:        colors.surface,
        backdropFilter:    "blur(12px)",
        borderBottom:      `1px solid ${colors.border}`,
        display:           "flex",
        alignItems:        "center",
        padding:           "0 0 0 28px",
        height:            54,
        gap:               32,
        WebkitAppRegion:   "drag",
        userSelect:        "none",
      }}>
        <div style={{ fontFamily: font.serif, fontSize: font.sizeNav, color: colors.textMid, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Character Studio
        </div>
        <div style={{ display: "flex", gap: 2, WebkitAppRegion: "no-drag" }}>
          {NAV_TABS.map(([id]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                padding:      "5px 14px",
                borderRadius: 6,
                border:       "none",
                background:   page === id ? colors.borderMid : "transparent",
                color:        page === id ? colors.textMid : colors.textGhost,
                fontFamily:   font.mono,
                fontSize:     font.sizeLg,
                cursor:       "pointer",
                transition:   "all 0.15s",
              }}
            >
              {navLabel(id)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ color: colors.borderMid, fontFamily: font.mono, fontSize: font.sizeSm, WebkitAppRegion: "no-drag" }}>
          {tags.length} tag{tags.length !== 1 ? "s" : ""}
        </div>
        {/* Gear icon — opens settings modal */}
        <button
          onClick={() => setSettingsOpen(true)}
          style={{
            background:      "none",
            border:          "none",
            color:           colors.textMuted,
            cursor:          "pointer",
            fontSize:        18,
            padding:         "4px 6px",
            lineHeight:      1,
            borderRadius:    6,
            WebkitAppRegion: "no-drag",
          }}
          title="Settings"
        >
          ⚙
        </button>
        {/* Window controls */}
        {window.electronAPI && (
          <div style={{ display: "flex", alignItems: "stretch", height: "100%", marginLeft: 8, WebkitAppRegion: "no-drag" }}>
            {[
              { label: "─", action: "minimize", hover: colors.borderMid },
              { label: "□", action: "maximize", hover: colors.borderMid },
              { label: "×", action: "close",    hover: "#c0392b" },
            ].map(({ label, action, hover }) => (
              <button
                key={action}
                onClick={() => window.electronAPI[action]()}
                style={{
                  width:        46,
                  height:       "100%",
                  background:   "none",
                  border:       "none",
                  color:        colors.textMuted,
                  fontSize:     action === "maximize" ? 18 : 18,
                  cursor:       "pointer",
                  fontFamily:   font.mono,
                  transition:   "background 0.15s, color 0.15s",
                  lineHeight:   1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = hover; if (action === "close") e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = colors.textMuted; }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} toast={toast} theme={theme} setTheme={setTheme} />
      )}

      {/*
        Generate and Tags stay mounted (display:none) to preserve state across tab switches.
        Gallery re-fetches from the API each time it mounts, so it doesn't need to stay mounted.
      */}
      <div style={{ display: page === "generate" ? "block" : "none" }}>
        <GeneratePage
          tags={tags}
          toast={toast}
          localGenerationEnabled={localGenerationEnabled}
          prompt={prompt}         setPrompt={setPrompt}
          negPrompt={negPrompt}   setNegPrompt={setNegPrompt}
          mode={mode}             setMode={setMode}
          aspect={aspect}         setAspect={setAspect}
          baseSize={baseSize}     setBaseSize={setBaseSize}
          result={result}         setResult={setResult}
          compiled={compiled}     setCompiled={setCompiled}
          referenceImages={referenceImages}
          setReferenceImages={setReferenceImages}
          maxReferenceImages={maxReferenceImages}
          cloudModel={cloudModel}   setCloudModel={setCloudModel}
          localModel={localModel}     setLocalModel={setLocalModel}
          localSteps={localSteps}     setLocalSteps={setLocalSteps}
          localCfg={localCfg}         setLocalCfg={setLocalCfg}
          localDenoise={localDenoise} setLocalDenoise={setLocalDenoise}
          localLoras={localLoras}         setLocalLoras={setLocalLoras}
          localScheduler={localScheduler} setLocalScheduler={setLocalScheduler}
          localSampler={localSampler}     setLocalSampler={setLocalSampler}
          resetCache={resetCache} setResetCache={setResetCache}
          onGenerated={handleGenerated}
        />
      </div>

      {page === "gallery" && (
        <GalleryPage
          toast={toast}
          onUsePrompt={handleUsePrompt}
          onAddReference={handleAddReference}
          onUpscale={handleUpscale}
          sseEntries={sseEntries}
          onEntriesLoaded={setSseEntries}
          galleryVersion={galleryVersion}
          onVersionLoaded={setGalleryVersion}
        />
      )}

      {page === "upscale" && (
        <UpscalePage toast={toast} images={upscaleImages} onImagesChange={setUpscaleImages} />
      )}

      <div style={{ display: page === "tags" ? "block" : "none" }}>
        <TagsPage tags={tags} onTagsChange={loadTags} toast={toast} />
      </div>

      <div style={{ display: page === "assets" ? "block" : "none" }}>
        <AssetsPage toast={toast} onAddReference={handleAddReference} />
      </div>

      <Toast toasts={toast.toasts} remove={toast.remove} />
    </>
  );
}
