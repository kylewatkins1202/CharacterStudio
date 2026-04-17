import { useState, useEffect } from "react";
import { makeSyntheticResult } from "./lib/utils";
import { globalCss, getThemeCss, colors, font } from "./theme";
import { useToast, Toast } from "./components/Toast";
import { GeneratePage } from "./components/GeneratePage";
import { GalleryPage } from "./components/GalleryPage";
import { TagsPage } from "./components/TagsPage";
import { SettingsModal } from "./components/SettingsModal";
import { AssetsPage } from "./components/AssetsPage";
import { UpscalePage } from "./components/UpscalePage";
import { AppStore } from "./stores/AppStore";
import { GenerateStore } from "../../shared/stores/GenerateStore.js";
import { GalleryStore } from "../../shared/stores/GalleryStore.js";

const NAV_TABS = [
  ["generate", "Generate"],
  ["gallery",  "Gallery"],
  ["upscale",  "Upscale"],
  ["tags",     "Tags"],
  ["assets",   "Assets"],
];

export default function App() {
  const { theme, tags, localGenerationEnabled } = AppStore.useState();
  const { mode, referenceImages }               = GenerateStore.useState();

  const [page,         setPage]         = useState("generate");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upscaleImages, setUpscaleImages] = useState([]);
  const toast = useToast();

  const setTheme = (name) => AppStore.actions.SET_THEME(name);

  useEffect(() => {
    AppStore.actions.LOAD_TAGS();
    AppStore.actions.LOAD_CONFIG();
    GalleryStore.actions.LOAD_PAGE({ page: 1 });
    GenerateStore.actions.LOAD_WS_MODELS();
  }, []);

  // SSE — live gallery updates
  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("gallery:new", (e) => {
      const entry = JSON.parse(e.data);
      GalleryStore.actions.PREPEND_ENTRY(entry);
      AppStore.actions.INCR_GALLERY_COUNT();
    });

    es.addEventListener("gallery:update", (e) => {
      const updated = JSON.parse(e.data);
      GalleryStore.actions.UPDATE_ENTRY(updated);
      if (!updated.loading && !updated.error) {
        GenerateStore.actions.SET_RESULT(makeSyntheticResult(updated.imageUrl || updated.localUrl));
        GenerateStore.actions.SET_COMPILED(
          updated.compiledPrompt || updated.compiledImages?.length
            ? { rawPrompt: updated.compiledPrompt || "", images: updated.compiledImages || [] }
            : null
        );
      }
    });

    es.onerror = () => {};
    return () => es.close();
  }, []);

  const handleUsePrompt = (entry) => {
    GenerateStore.actions.RESTORE_FROM_ENTRY(entry);
    setPage("generate");
  };

  const handleAddReference = (asset) => {
    const maxRefs = mode === "local" ? 3 : null;
    if (maxRefs !== null && referenceImages.length >= maxRefs) {
      toast.add(`Reference image limit reached (${maxRefs})`, "error");
      return;
    }
    GenerateStore.actions.UPDATE_REFERENCE_IMAGES({ assetId: asset.id, url: asset.url, purpose: "" });
    setPage("generate");
  };

  const handleUpscale = (entry) => {
    setUpscaleImages([{ assetId: entry.imageAssetId, url: entry.localUrl || entry.imageUrl, purpose: "" }]);
    setPage("upscale");
  };

  return (
    <>
      <style>{getThemeCss(theme) + globalCss}</style>

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
          {NAV_TABS.map(([id, label]) => (
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
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ color: colors.borderMid, fontFamily: font.mono, fontSize: font.sizeSm, WebkitAppRegion: "no-drag" }}>
          {tags.length} tag{tags.length !== 1 ? "s" : ""}
        </div>
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
                  fontSize:     18,
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

      <div style={{ display: page === "generate" ? "block" : "none" }}>
        <GeneratePage toast={toast} localGenerationEnabled={localGenerationEnabled} />
      </div>

      {page === "gallery" && (
        <GalleryPage
          toast={toast}
          onUsePrompt={handleUsePrompt}
          onAddReference={handleAddReference}
          onUpscale={handleUpscale}
        />
      )}

      {page === "upscale" && (
        <UpscalePage toast={toast} images={upscaleImages} onImagesChange={setUpscaleImages} />
      )}

      <div style={{ display: page === "tags" ? "block" : "none" }}>
        <TagsPage tags={tags} onTagsChange={() => AppStore.actions.LOAD_TAGS()} toast={toast} />
      </div>

      <div style={{ display: page === "assets" ? "block" : "none" }}>
        <AssetsPage toast={toast} onAddReference={handleAddReference} />
      </div>

      <Toast toasts={toast.toasts} remove={toast.remove} />
    </>
  );
}
