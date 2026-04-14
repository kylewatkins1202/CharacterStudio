import { api } from "../lib/api";
import { computeSize, extractImageUrl } from "../lib/utils";
import { ASPECT_RATIOS } from "../lib/constants";
import { PromptInput } from "./PromptInput";
import { ReferenceImageInput } from "./ReferenceImageInput";
import { LocalOptions } from "./LocalOptions";
import { colors, font, radius, fieldLabel as FL } from "../theme";
import { useState, useEffect, useMemo } from "react";
import { CloudOptions } from "./CloudOptions";

/**
 * GeneratePage — the main image generation view.
 *
 * All state is owned by the App root so it survives tab switches.
 * This component is purely presentational: it reads props and calls setters.
 *
 * @param {{
 *   tags: object[],
 *   toast: { add: Function },
 *   prompt: string,
 *   setPrompt: Function,
 *   aspect: { label: string, w: number, h: number },
 *   setAspect: Function,
 *   baseSize: number,
 *   setBaseSize: Function,
 *   loading: boolean,
 *   setLoading: Function,
 *   result: object|null,
 *   setResult: Function,
 *   compiled: object|null,
 *   setCompiled: Function,
 *   referenceImages: object[],
 *   setReferenceImages: Function,
 *   resetCache: boolean,
 *   setResetCache: Function,
 *   onGenerated: () => void
 * }} props
 */
export function GeneratePage({
  tags, toast,
  prompt, setPrompt,
  aspect, setAspect,
  baseSize, setBaseSize,
  result, setResult,
  compiled, setCompiled,
  referenceImages, setReferenceImages,
  maxReferenceImages,
  cloudModel,   setCloudModel,
  localModel,   setLocalModel,
  localSteps,   setLocalSteps,
  localCfg,     setLocalCfg,
  localDenoise, setLocalDenoise,
  localLoras,     setLocalLoras,
  localScheduler, setLocalScheduler,
  localSampler,   setLocalSampler,
  resetCache, setResetCache,
  mode, setMode,
  negPrompt, setNegPrompt,
  localGenerationEnabled,
  onGenerated,
}) {
  // True only while the server is acknowledging the generate request (brief)
  const [starting, setStarting] = useState(false);
  const [wsModels, setWsModels] = useState({});
  // Per-tag descriptor overrides: { [tagKey]: { appearance?: bool, bodyShape?: bool, basic?: bool } }
  const [tagOverrides, setTagOverrides] = useState({});
  // Nano Banana Pro resolution
  const [nbResolution, setNbResolution] = useState("1k");
  // Dynamic cost fetched from /generate/image/cost
  const [generationCost, setGenerationCost] = useState(null);
  const [costLoading, setCostLoading] = useState(false);

  // Tags currently referenced in the prompt via @key tokens
  const referencedTags = useMemo(() => {
    const hits = new Set([...prompt.matchAll(/@(\S+)/g)].map((m) => m[1]));
    return tags.filter((t) => hits.has(t.key));
  }, [prompt, tags]);

  const getOverride = (key, field) => tagOverrides[key]?.[field] ?? true;
  const setOverride = (key, field, value) =>
    setTagOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  
  useEffect(() => {
    api.get("/models/wavespeed/options").then((res) => {
      if (res.ok) setWsModels(res.models);
    }).catch(() => {});
  }, []);

  // Clamp baseSize to the selected model's max when cloudModel or wsModels changes
  useEffect(() => {
    const max = wsModels[cloudModel]?.max;
    if (max && baseSize > max) setBaseSize(max);
  }, [cloudModel, wsModels]);

  // Fetch real-time cost from the backend (debounced 600ms)
  useEffect(() => {
    if (mode !== "wavespeed" || !prompt.trim()) return;
    const isNanoBanana = wsModels[cloudModel]?.schema === "nano-banana";
    setCostLoading(true);
    const timer = setTimeout(async () => {
      try {
        const body = {
          prompt,
          model:     cloudModel,
          tagLocks:  tagOverrides,
          ...(isNanoBanana
            ? { aspect_ratio: aspect.label, resolution: nbResolution }
            : { size: computeSize(aspect, baseSize) }),
        };
        const res = await api.post("/generate/image/cost", body);
        if (res.ok) {
          setGenerationCost("$" + res.unitPrice);
        } else {
          setGenerationCost(null);
        }
      } catch {
        setGenerationCost(null);
      }
      setCostLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [prompt, cloudModel, aspect, baseSize, nbResolution, tagOverrides, mode]);

  const computedSize = computeSize(aspect, baseSize);
  const currentSchema = wsModels[cloudModel]?.schema;
  const imageUrl      = result ? extractImageUrl(result) : null;

  /**
   * Generates image and shows the image and its raw prompt to the user
   * @returns {Promise<void>}
   */
  const generate = async () => {
    if (!prompt.trim()) return toast.add("Please enter a prompt", "error");

    setStarting(true);
    setResult(null);
    setCompiled(null);

    try {
      const isNanoBanana = currentSchema === "nano-banana";
      const body = {
        prompt,
        negPrompt: negPrompt ?? '',
        mode,
        ...(mode === 'local' ? {
          model:     localModel,
          steps:     localSteps,
          cfg:       localCfg,
          denoise:   localDenoise,
          loras:     localLoras,
          scheduler: localScheduler,
          sampler:   localSampler,
        } : {
          model: cloudModel,
          ...(isNanoBanana
            ? { aspect_ratio: aspect.label, resolution: nbResolution }
            : { size: computedSize }),
        }),
        // Existing assets picked from the library — resolved server-side by ID
        referenceAssetIds:  referenceImages.filter((i) => i.assetId).map((i) => ({ id: i.assetId, purpose: i.purpose })),
        // New base64 uploads — creates an asset record on the backend
        referenceImages:    referenceImages.filter((i) => !i.assetId && !i.isUrl).map((i) => ({ data: i.src, purpose: i.purpose })),
        // Pasted URLs — healed if a matching asset exists, used as-is otherwise
        referenceImageUrls: referenceImages.filter((i) => i.isUrl).map((i) => ({ url: i.url || i.src, purpose: i.purpose })),
        tagLocks: tagOverrides,
        resetCache,
      };

      const res = await api.post("/generate/image", body);

      if (res.ok) {
        toast.add("Generation started!", "success");
        setResetCache(false);
        onGenerated();
      } else {
        toast.add(res.error || "Generation failed", "error");
      }
    } catch (err) {
      toast.add(err.message || "Network error", "error");
    }

    setStarting(false);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: font.serif, fontSize: font.sizeHeading, fontWeight: 700, color: colors.textHigh, margin: 0, letterSpacing: "-0.02em" }}>
          Generate
        </h1>
        <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeLg, marginTop: 6 }}>
          Craft your scene — type <span style={{ color: colors.textMuted }}>@</span> to reference tags
        </p>
        <br />
        <div> 
          <button
            onClick={() => {console.log('set'); setMode('wavespeed')}}
            style={{
              padding:      "10px 32px",
              background:   mode !== "wavespeed" ? "#111" : colors.primary,
              color:        mode !== "wavespeed" ? colors.textGhost : colors.primaryText,
              border:       "none",
              borderRadius: (localGenerationEnabled ? `${radius.md}px ${0}px ${0}px ${radius.md}px` : radius.md),
              fontFamily:   font.mono,
              fontSize:     font.sizeLg,
              fontWeight:   600,
              cursor:       starting ? "not-allowed" : "pointer",
              transition:   "all 0.2s",
              whiteSpace:   "nowrap",
            }}
          >
            WaveSpeed
          </button>
          {localGenerationEnabled && (
            <button
              onClick={() => setMode('local')}
              style={{
                padding:      "10px 32px",
                background:   mode !== "local" ? "#111" : colors.primary,
                color:        mode !== "local" ? colors.textGhost : colors.primaryText,
                border:       "none",
                borderRadius: `${0}px ${radius.md}px ${radius.md}px ${0}px`,
                fontFamily:   font.mono,
                fontSize:     font.sizeLg,
                fontWeight:   600,
                cursor:       starting ? "not-allowed" : "pointer",
                transition:   "all 0.2s",
                whiteSpace:   "nowrap",
              }}
            >
              Local
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PromptInput value={prompt} onChange={setPrompt} tags={mode === 'wavespeed' ? tags : []} disableTags={mode === 'local' ? true : false} placeholder={mode === "wavespeed" ? "Describe your scene… use @tag to reference characters, outfits, props & locations" : "Describe your scene…"} />
        {
          mode === 'local' &&
            <PromptInput value={negPrompt} onChange={setNegPrompt} placeholder={"Negative prompt…"}></PromptInput>
        }

        {/* Per-tag descriptor toggles */}
        {mode === 'wavespeed' && referencedTags.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {referencedTags.map((tag) => {
              const isChar   = tag.type === "character";
              const hasAppear = isChar && !!tag.lock?.appearanceDescription;
              const hasBody   = isChar && !!tag.lock?.bodyDescription;
              const hasBasic  = !isChar && !!tag.lock?.basicDescription;
              const hasAny    = hasAppear || hasBody || hasBasic;

              // Available fields for the "All" checkbox
              const allOn = (
                (!hasAppear || getOverride(tag.key, "appearance")) &&
                (!hasBody   || getOverride(tag.key, "bodyShape")) &&
                (!hasBasic  || getOverride(tag.key, "basic"))
              );
              const toggleAll = (value) => {
                setTagOverrides((prev) => ({
                  ...prev,
                  [tag.key]: {
                    ...(hasAppear ? { appearance: value } : {}),
                    ...(hasBody   ? { bodyShape:  value } : {}),
                    ...(hasBasic  ? { basic:       value } : {}),
                  },
                }));
              };

              return (
                <div key={tag.key} style={{ display: "flex", alignItems: "center", gap: 12, background: colors.surface, border: `1px solid ${colors.borderMid}`, borderRadius: radius.md, padding: "8px 12px" }}>
                  <span style={{ fontFamily: font.mono, fontSize: font.sizeMd, color: colors.textMid, flexShrink: 0 }}>@{tag.key}</span>
                  {!hasAny ? (
                    <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.borderStrong }}>no descriptions</span>
                  ) : (
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      {/* All toggle */}
                      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                        <input type="checkbox" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} style={{ accentColor: colors.primary, cursor: "pointer" }} />
                        <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.textMuted }}>All</span>
                      </label>
                      {hasAppear && (
                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={getOverride(tag.key, "appearance")} onChange={(e) => setOverride(tag.key, "appearance", e.target.checked)} style={{ accentColor: colors.primary, cursor: "pointer" }} />
                          <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.textMuted }}>Appearance</span>
                        </label>
                      )}
                      {hasBody && (
                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={getOverride(tag.key, "bodyShape")} onChange={(e) => setOverride(tag.key, "bodyShape", e.target.checked)} style={{ accentColor: colors.primary, cursor: "pointer" }} />
                          <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.textMuted }}>Body shape</span>
                        </label>
                      )}
                      {hasBasic && (
                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={getOverride(tag.key, "basic")} onChange={(e) => setOverride(tag.key, "basic", e.target.checked)} style={{ accentColor: colors.primary, cursor: "pointer" }} />
                          <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.textMuted }}>Description</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Reference images */}
        <div>
          <label style={FL}>
            Reference Images{" "}
            <span style={{ color: colors.borderStrong, fontWeight: 400 }}>
              — passed directly to the model alongside tag images
            </span>
          </label>
          <ReferenceImageInput images={referenceImages} onChange={setReferenceImages} maxImages={maxReferenceImages} />
        </div>

        {/* Local ComfyUI options */}
        {mode === 'local' && (
          <LocalOptions
            model={localModel}     onModelChange={setLocalModel}
            steps={localSteps}     onStepsChange={setLocalSteps}
            cfg={localCfg}         onCfgChange={setLocalCfg}
            denoise={localDenoise} onDenoiseChange={setLocalDenoise}
            loras={localLoras}           onLorasChange={setLocalLoras}
            scheduler={localScheduler}   onSchedulerChange={setLocalScheduler}
            sampler={localSampler}       onSamplerChange={setLocalSampler}
          />
        )}
        {mode === 'wavespeed' && (
          <CloudOptions
            model={cloudModel} onModelChange={setCloudModel}
            models={wsModels}
            resolution={nbResolution} onResolutionChange={setNbResolution}
          />
        )}

        {/* Aspect ratio */}
        <div>
          <label style={FL}>Aspect Ratio</label>
          <div style={{ display: "flex", gap: 6 }}>
            {ASPECT_RATIOS.map((r) => {
              const active   = aspect.label === r.label;
              const maxDim   = 14;
              const svgW     = r.w >= r.h ? maxDim : Math.round(maxDim * r.w / r.h);
              const svgH     = r.h >= r.w ? maxDim : Math.round(maxDim * r.h / r.w);
              return (
                <button
                  key={r.label}
                  onClick={() => setAspect(r)}
                  style={{
                    padding:        "6px 14px",
                    borderRadius:   radius.md - 1,
                    border:         `1px solid ${active ? colors.primary : "#1e1e1e"}`,
                    background:     active ? colors.primary : "transparent",
                    color:          active ? colors.primaryText : colors.textMuted,
                    fontFamily:     font.mono,
                    fontSize:       font.sizeMd,
                    cursor:         "pointer",
                    transition:     "all 0.15s",
                    display:        "flex",
                    alignItems:     "center",
                    gap:            7,
                  }}
                >
                  <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ flexShrink: 0 }}>
                    <rect x={0.5} y={0.5} width={svgW - 1} height={svgH - 1} rx={1}
                      fill="none"
                      stroke={active ? colors.primaryText : colors.textMuted}
                      strokeWidth={1.5}
                    />
                  </svg>
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resolution slider — hidden for nano-banana (uses resolution enum instead) */}
        {currentSchema !== "nano-banana" && (
          <div>
            <label style={FL}>
              Resolution — <span style={{ color: colors.textMuted }}>{computedSize.replace("*", " × ")}</span>
            </label>
            <input
              type="range"
              min={wsModels[cloudModel]?.min ?? 512}
              max={wsModels[cloudModel]?.max ?? 8192}
              step={64}
              value={baseSize}
              onChange={(e) => setBaseSize(Number(e.target.value))}
              style={{ width: "100%", accentColor: colors.primary, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, marginTop: 4 }}>
              {(() => {
                const sliderMin = wsModels[cloudModel]?.min ?? 512;
                const sliderMax = wsModels[cloudModel]?.max ?? 8192;
                const mid = Math.round((sliderMin + sliderMax) / 2);
                const q1  = Math.round((sliderMin + mid) / 2);
                const q3  = Math.round((mid + sliderMax) / 2);
                return [sliderMin, q1, mid, q3, sliderMax].map((v) => <span key={v}>{v}</span>);
              })()}
            </div>
          </div>
        )}

        {/* Actions row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14 }}>
          {mode === "wavespeed" && (
            <span style={{ fontFamily: font.mono, fontSize: font.sizeMd, color: colors.textGhost }}>
              {costLoading ? "fetching cost…" : generationCost ? <>est. <span style={{ color: colors.textMuted }}>{generationCost}</span></> : null}
            </span>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={resetCache}
              onChange={(e) => setResetCache(e.target.checked)}
              style={{ accentColor: colors.primary, cursor: "pointer", width: 13, height: 13 }}
            />
            <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: resetCache ? colors.textMuted : colors.textGhost, transition: "color 0.15s" }}>
              Reset cache
            </span>
          </label>
          <button
            onClick={generate}
            disabled={starting}
            style={{
              padding:      "10px 32px",
              background:   starting ? "#111" : colors.primary,
              color:        starting ? colors.textGhost : colors.primaryText,
              border:       "none",
              borderRadius: radius.md,
              fontFamily:   font.mono,
              fontSize:     font.sizeLg,
              fontWeight:   600,
              cursor:       starting ? "not-allowed" : "pointer",
              transition:   "all 0.2s",
              whiteSpace:   "nowrap",
            }}
          >
            {starting ? "Starting…" : "Generate →"}
          </button>
        </div>
      </div>

      {/* Generated image + compiled prompt */}
      {imageUrl && (
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
          <img src={imageUrl} alt="Generated" style={{ width: "100%", borderRadius: radius.xl, border: `1px solid ${colors.borderMid}`, display: "block" }} />
          {compiled && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: 16 }}>
              <div style={{ ...FL, marginBottom: 8 }}>Compiled Prompt</div>
              <pre style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeMd, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {compiled.rawPrompt}
              </pre>
              {compiled.images?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...FL, marginBottom: 6 }}>Reference Images ({compiled.images.length})</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {compiled.images.map((url, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        <img src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: radius.sm, border: `1px solid ${colors.borderMid}` }} />
                        <span style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,0.8)", color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeXs - 1, padding: "1px 3px", borderRadius: 3 }}>
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Raw response fallback */}
      {!imageUrl && result && (
        <div style={{ marginTop: 24, background: colors.surface, border: `1px solid #1e1e1e`, borderRadius: radius.lg, padding: 16 }}>
          <div style={{ ...FL, marginBottom: 8 }}>Raw Response</div>
          <pre style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeSm, margin: 0, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
