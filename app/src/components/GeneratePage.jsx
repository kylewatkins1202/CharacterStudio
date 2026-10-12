import { api } from "../lib/api";
import { computeSize, extractImageUrl } from "../lib/utils";
import { PromptInput } from "./PromptInput";
import { ReferenceImageInput } from "./ReferenceImageInput";
import { LocalOptions } from "./LocalOptions";
import { colors, font, radius, fieldLabel as FL } from "../theme";
import { useState, useEffect, useMemo } from "react";
import { CloudOptions } from "./CloudOptions";
import { GenerateStore } from "../../../shared/stores/GenerateStore.js";
import { AppStore } from "../stores/AppStore.js";

export function GeneratePage({ toast, localGenerationEnabled }) {
  const {
    prompt, negPrompt, mode, referenceImages,
    result, compiled, resetCache, useRawPrompt,
    cloudModel, cloudModelParams,
    localModel, localSteps, localCfg, localDenoise,
    localLoras, localScheduler, localSampler,
    tagOverrides, wsModels, generationCost, costLoading, starting,
  } = GenerateStore.useState();

  const { tags } = AppStore.useState();

  const maxReferenceImages = mode === "local" ? 3 : null;

  // Load WaveSpeed models once
  useEffect(() => {
    GenerateStore.actions.LOAD_WS_MODELS({});
  }, []);

  // Debounced cost fetch
  useEffect(() => {
    if (mode !== "wavespeed" || !prompt.trim()) return;
    GenerateStore.actions.SET_COST_LOADING(true);
    const timer = setTimeout(() => {
      GenerateStore.actions.FETCH_COST({});
    }, 600);
    return () => clearTimeout(timer);
  }, [prompt, cloudModel, cloudModelParams, mode]);

  const referencedTags = useMemo(() => {
    const hits = new Set([...prompt.matchAll(/@(\S+)/g)].map((m) => m[1]));
    return tags.filter((t) => hits.has(t.key));
  }, [prompt, tags]);

  const getOverride = (key, field) => tagOverrides[key]?.[field] ?? true;
  const setOverride = (key, field, value) =>
    GenerateStore.actions.SET_TAG_OVERRIDES({ ...tagOverrides, [key]: { ...(tagOverrides[key] || {}), [field]: value } });

  // Clamp baseSize to model max when model or models list changes
  useEffect(() => {
    const max = wsModels[cloudModel]?.max;
    if (max && cloudModelParams.baseSize > max) {
      GenerateStore.actions.SET_CLOUD_MODEL_PARAMS({ ...cloudModelParams, baseSize: max });
    }
  }, [cloudModel, wsModels]);

  const imageUrl = result ? extractImageUrl(result) : null;

  const generate = async () => {
    if (!prompt.trim()) return toast.add("Please enter a prompt", "error");
    GenerateStore.actions.SET_STARTING(true);
    await GenerateStore.actions.GENERATE({});
    toast.add("Generation started!", "success");
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
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
            onClick={() => GenerateStore.actions.SET_MODE("wavespeed")}
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
              onClick={() => GenerateStore.actions.SET_MODE("local")}
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
        <PromptInput
          value={prompt}
          onChange={(v) => GenerateStore.actions.SET_PROMPT(v)}
          tags={mode === "wavespeed" ? tags : []}
          disableTags={mode === "local"}
          placeholder={mode === "wavespeed" ? "Describe your scene… use @tag to reference characters, outfits, props & locations" : "Describe your scene…"}
        />
        {mode === "local" && (
          <PromptInput value={negPrompt} onChange={(v) => GenerateStore.actions.SET_NEG_PROMPT(v)} placeholder="Negative prompt…" />
        )}

        {/* Per-tag descriptor toggles */}
        {mode === "wavespeed" && referencedTags.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {referencedTags.map((tag) => {
              const isChar    = tag.type === "character";
              const hasAppear = isChar && !!tag.lock?.appearanceDescription;
              const hasBody   = isChar && !!tag.lock?.bodyDescription;
              const hasBasic  = !isChar && !!tag.lock?.basicDescription;
              const hasAny    = hasAppear || hasBody || hasBasic;

              const allOn = (
                (!hasAppear || getOverride(tag.key, "appearance")) &&
                (!hasBody   || getOverride(tag.key, "bodyShape")) &&
                (!hasBasic  || getOverride(tag.key, "basic"))
              );
              const toggleAll = (value) => {
                GenerateStore.actions.SET_TAG_OVERRIDES({
                  ...tagOverrides,
                  [tag.key]: {
                    ...(hasAppear ? { appearance: value } : {}),
                    ...(hasBody   ? { bodyShape:  value } : {}),
                    ...(hasBasic  ? { basic:       value } : {}),
                  },
                });
              };

              return (
                <div key={tag.key} style={{ display: "flex", alignItems: "center", gap: 12, background: colors.surface, border: `1px solid ${colors.borderMid}`, borderRadius: radius.md, padding: "8px 12px" }}>
                  <span style={{ fontFamily: font.mono, fontSize: font.sizeMd, color: colors.textMid, flexShrink: 0 }}>@{tag.key}</span>
                  {!hasAny ? (
                    <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.borderStrong }}>no descriptions</span>
                  ) : (
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
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
          <ReferenceImageInput
            images={referenceImages}
            onChange={(f) => !f ? null : GenerateStore.actions.SET_REFERENCE_IMAGES(f(referenceImages))}
            maxImages={maxReferenceImages}
          />
        </div>

        {mode === "local" && (
          <LocalOptions
            model={localModel}     onModelChange={(v) => GenerateStore.actions.SET_LOCAL_MODEL(v)}
            steps={localSteps}     onStepsChange={(v) => GenerateStore.actions.SET_LOCAL_STEPS(v)}
            cfg={localCfg}         onCfgChange={(v) => GenerateStore.actions.SET_LOCAL_CFG(v)}
            denoise={localDenoise} onDenoiseChange={(v) => GenerateStore.actions.SET_LOCAL_DENOISE(v)}
            loras={localLoras}           onLorasChange={(v) => GenerateStore.actions.SET_LOCAL_LORAS(v)}
            scheduler={localScheduler}   onSchedulerChange={(v) => GenerateStore.actions.SET_LOCAL_SCHEDULER(v)}
            sampler={localSampler}       onSamplerChange={(v) => GenerateStore.actions.SET_LOCAL_SAMPLER(v)}
          />
        )}
        {mode === "wavespeed" && (
          <CloudOptions
            model={cloudModel}           onModelChange={(v) => GenerateStore.actions.SET_CLOUD_MODEL(v)}
            models={wsModels}
            modelParams={cloudModelParams} onModelParamsChange={(v) => GenerateStore.actions.SET_CLOUD_MODEL_PARAMS(v)}
          />
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
              onChange={(e) => GenerateStore.actions.SET_RESET_CACHE(e.target.checked)}
              style={{ accentColor: colors.primary, cursor: "pointer", width: 13, height: 13 }}
            />
            <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: resetCache ? colors.textMuted : colors.textGhost, transition: "color 0.15s" }}>
              Reset cache
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={useRawPrompt}
              onChange={(e) => GenerateStore.actions.SET_USE_RAW_PROMPT(e.target.checked)}
              style={{ accentColor: colors.primary, cursor: "pointer", width: 13, height: 13 }}
            />
            <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: useRawPrompt ? colors.textMuted : colors.textGhost, transition: "color 0.15s" }}>
              Raw prompt
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
