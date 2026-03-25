import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api";
import { makeSyntheticResult } from "./lib/utils";
import { ASPECT_RATIOS } from "./lib/constants";
import { globalCss, colors, font } from "./theme";
import { useToast, Toast } from "./components/Toast";
import { GeneratePage } from "./components/GeneratePage";
import { GalleryPage } from "./components/GalleryPage";
import { TagsPage } from "./components/TagsPage";

const NAV_TABS = [
  ["generate", "Generate"],
  ["gallery",  null],   // label computed below to include count badge
  ["tags",     "Tags"],
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
  const [page,         setPage]         = useState("generate");
  const [tags,         setTags]         = useState([]);
  const [galleryCount, setGalleryCount] = useState(0);
  const toast = useToast();

  // ── Generate page state (hoisted here so it survives tab switches) ──────────
  const [prompt,          setPrompt]          = useState("");
  const [aspect,          setAspect]          = useState(ASPECT_RATIOS[0]);
  const [baseSize,        setBaseSize]        = useState(2048);
  const [loading,         setLoading]         = useState(false);
  const [result,          setResult]          = useState(null);
  const [compiled,        setCompiled]        = useState(null);
  const [resetCache,      setResetCache]      = useState(false);
  const [referenceImages, setReferenceImages] = useState([]);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadTags = useCallback(async () => {
    try {
      const res = await api.get("/tags");
      if (res.ok) setTags(res.tags);
    } catch {}
  }, []);

  const loadGalleryCount = useCallback(async () => {
    try {
      const res = await api.get("/gallery");
      if (res.ok) setGalleryCount(res.count);
    } catch {}
  }, []);

  useEffect(() => { loadTags(); loadGalleryCount(); }, [loadTags, loadGalleryCount]);

  // ── Cross-page callbacks ──────────────────────────────────────────────────────

  /** Add a WaveSpeed URL as a reference image and navigate to the generate tab. */
  const handleAddReference = useCallback((imageUrl) => {
    setReferenceImages((p) => [...p, { src: imageUrl, isUrl: true, purpose: "composition" }]);
    setPage("generate");
  }, []);

  /** Increment the gallery badge after a successful generation. */
  const handleGenerated = useCallback(() => {
    setGalleryCount((p) => p + 1);
  }, []);

  /**
   * Restore a gallery entry to the generate page:
   * - prefills the prompt
   * - restores reference images, aspect ratio, and base size
   * - shows the saved image as the current result
   */
  const handleUsePrompt = useCallback((entry) => {
    setPrompt(entry.userPrompt);

    setReferenceImages(
      entry.referenceImageUrls?.length
        ? entry.referenceImageUrls.map((url) => ({ src: url, isUrl: true, purpose: "composition" }))
        : []
    );

    if (entry.size) {
      const [w, h] = entry.size.split("*").map(Number);
      if (w && h) {
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const d   = gcd(w, h);
        const matched = ASPECT_RATIOS.find((r) => r.w === w / d && r.h === h / d);
        if (matched) setAspect(matched);
        setBaseSize(Math.max(w, h));
      }
    }

    setResult(makeSyntheticResult(entry.imageUrl));
    setCompiled(
      entry.compiledPrompt || entry.compiledImages?.length
        ? { rawPrompt: entry.compiledPrompt || "", images: entry.compiledImages || [] }
        : null
    );
    setPage("generate");
  }, []);

  // ── Nav labels ────────────────────────────────────────────────────────────────

  const navLabel = (id) => {
    if (id === "gallery") return galleryCount > 0 ? `Gallery (${galleryCount})` : "Gallery";
    return NAV_TABS.find(([tabId]) => tabId === id)?.[1] ?? id;
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{globalCss}</style>

      {/* Top navigation bar */}
      <nav style={{
        position:       "sticky",
        top:            0,
        zIndex:         50,
        background:     "rgba(8,8,8,0.94)",
        backdropFilter: "blur(12px)",
        borderBottom:   `1px solid #111`,
        display:        "flex",
        alignItems:     "center",
        padding:        "0 28px",
        height:         54,
        gap:            32,
      }}>
        <div style={{ fontFamily: font.serif, fontSize: font.sizeNav, color: "#e0e0e0", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Character Studio
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {NAV_TABS.map(([id]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                padding:      "5px 14px",
                borderRadius: 6,
                border:       "none",
                background:   page === id ? "#161616" : "transparent",
                color:        page === id ? "#e0e0e0" : "#3a3a3a",
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
        <div style={{ color: colors.borderMid, fontFamily: font.mono, fontSize: font.sizeSm }}>
          {tags.length} tag{tags.length !== 1 ? "s" : ""}
        </div>
      </nav>

      {/*
        Generate and Tags stay mounted (display:none) to preserve state across tab switches.
        Gallery re-fetches from the API each time it mounts, so it doesn't need to stay mounted.
      */}
      <div style={{ display: page === "generate" ? "block" : "none" }}>
        <GeneratePage
          tags={tags}
          toast={toast}
          prompt={prompt}         setPrompt={setPrompt}
          aspect={aspect}         setAspect={setAspect}
          baseSize={baseSize}     setBaseSize={setBaseSize}
          loading={loading}       setLoading={setLoading}
          result={result}         setResult={setResult}
          compiled={compiled}     setCompiled={setCompiled}
          referenceImages={referenceImages}
          setReferenceImages={setReferenceImages}
          resetCache={resetCache} setResetCache={setResetCache}
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
