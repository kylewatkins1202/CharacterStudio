import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { api } from "../lib/api";
import { colors, font, radius, fieldLabel as FL } from "../theme";
import { computeSize } from "../lib/utils";
import { ASPECT_RATIOS } from "../lib/constants";

/** Keys that are handled explicitly by GeneratePage (not rendered as extra fields). */
const RESERVED_KEYS = new Set(["size", "aspect_ratio", "resolution"]);

/**
 * Render a single dynamic field from a model's baseProperites schema entry.
 *
 * - integer / number with no enum → number input
 * - string / any with enum       → pill buttons
 * (Other types are ignored for now.)
 */
function DynamicField({ fieldKey, schema, value, onChange }) {
  const label = fieldKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (schema.enum) {
    return (
      <div>
        <label style={FL}>{label}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {schema.enum.map((opt) => {
            const active = value === opt || (value == null && opt === schema.default);
            return (
              <button
                key={opt}
                onClick={() => onChange(opt)}
                style={{
                  padding:      "6px 14px",
                  borderRadius: radius.md,
                  border:       `1px solid ${active ? colors.primary : "#1e1e1e"}`,
                  background:   active ? colors.primary : "transparent",
                  color:        active ? colors.primaryText : colors.textMuted,
                  fontFamily:   font.mono,
                  fontSize:     font.sizeMd,
                  cursor:       "pointer",
                  transition:   "all 0.15s",
                }}
              >
                {String(opt)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (schema.type === "integer" || schema.type === "number") {
    return (
      <div>
        <label style={FL}>{label}</label>
        <input
          type="number"
          value={value ?? schema.default ?? ""}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          style={{
            background:   "#111",
            border:       `1px solid #1e1e1e`,
            borderRadius: radius.md,
            color:        colors.textMid,
            fontFamily:   font.mono,
            fontSize:     font.sizeMd,
            padding:      "6px 12px",
            width:        "100%",
          }}
        />
      </div>
    );
  }

  return null;
}

// Cache last values for each model to restore on model switch (for fields that aren't preserved in modelParams, like baseSize for enum-size models)
const lastValue = {}

/**
 * CloudOptions — model selector for WaveSpeed cloud generation.
 *
 * Renders:
 * - Model selector pills
 * - Resolution picker (for models with a resolutions enum)
 * - Dynamic extra fields from the model's baseProperites (seed, output_format, etc.)
 *
 * All model-specific values (resolution, seed, output_format, etc.) are stored
 * in and read from `modelParams` — there are no separate resolution props.
 *
 * @param {{
 *   model: string,
 *   onModelChange: Function,
 *   models?: object,
 *   modelParams?: object,
 *   onModelParamsChange?: Function,
 * }} props
 */
export function CloudOptions({
  model, onModelChange, models,
  modelParams = {}, onModelParamsChange,
}) {
  const [fetchedModels, setFetchedModels] = useState(null);
  
  useEffect(() => {
    if (models) return;
    api.get("/models/wavespeed/options").then((res) => {
      if (res.ok) setFetchedModels(res.models);
    }).catch(() => {});
  }, [models]);

  
  
  const availableModels = useMemo(() => models || fetchedModels, [models, fetchedModels]) ;
  const modelSchema     = useMemo(() => availableModels?.[model], [availableModels, model]);
  const usesEnumSize    = useMemo(() => modelSchema?.baseProperites?.resolution && modelSchema?.aspectRatios, [modelSchema]);
  const resolutions     = modelSchema?.baseProperites?.resolution?.enum

  useEffect(() => {
    return () => {
      console.log("Cleaning up model params for model:", model);
    }
  }, [])
  useLayoutEffect(() => {
    // If the model uses enum size, we ignore any baseSize value and just use the resolution enum — so we can clear baseSize on model change to avoid confusion. For non-enum-size models, we enforce that baseSize is within the model's allowed range.
    if (modelSchema?.baseProperites?.resolution && modelSchema?.aspectRatios) {
      onModelParamsChange({ ...modelParams, ...lastValue?.[model] });
    } else if (modelSchema?.baseProperites?.size) {
      let max = modelSchema.baseProperites.size.maximum
      let min = modelSchema.baseProperites.size.minimum

      let s

      if ((modelParams.baseSize && (max === undefined || modelParams.baseSize > max) && (min === undefined || modelParams.baseSize < min))) {
        if (!lastValue?.[model]) {
          lastValue[model] = {}
        }

        lastValue[model].baseSize = max
      } 
      else if (modelParams.baseSize === null) {
        if (!lastValue?.[model]) {
          lastValue[model] = {}
        }

        lastValue[model].baseSize = modelSchema.baseProperites.size.default.split("*")[0]
      }
      
      let newModelParams = { ...modelParams, ...(lastValue?.[model] ?? {}), ...(s !== undefined && { baseSize: s }) }

      for (const key of Object.keys(modelSchema.baseProperites)) { 
        if (key === "size" && newModelParams.baseSize === undefined) {
          newModelParams.baseSize = modelSchema.baseProperites.size.default.split("*")[0]
        } else if (key === "aspect_ratio" && newModelParams.aspect_ratio === undefined) {
          newModelParams.aspect_ratio = modelSchema.baseProperites.aspect_ratio.default
        } else if (key === "resolution" && newModelParams.resolution === undefined) {
          newModelParams.resolution = modelSchema.baseProperites.resolution.default
        }
      }
      onModelParamsChange(newModelParams);
    }

  }, [modelSchema])
  // Extra fields: baseProperites minus reserved size-related keys
  const extraFields = Object.entries(modelSchema?.baseProperites || {})
    .filter(([k]) => !RESERVED_KEYS.has(k));

  const setParam = (key, val) => {
    if (onModelParamsChange) {
      if (!lastValue[model]) {
        lastValue[model] = {}
      }
      
      lastValue[model] = {
        ...(lastValue?.[model]),
        [key]: val
      }

      onModelParamsChange({ ...modelParams, [key]: val });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Model selector */}
      {availableModels && Object.keys(availableModels).length > 0 && (
        <div>
          <label style={FL}>Model</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(availableModels).map(([key, info]) => {
              const active = model === key;
              return (
                <button
                  key={key}
                  onClick={() => onModelChange(key)}
                  style={{
                    padding:      "6px 14px",
                    borderRadius: radius.md,
                    border:       `1px solid ${active ? colors.primary : "#1e1e1e"}`,
                    background:   active ? colors.primary : "transparent",
                    color:        active ? colors.primaryText : colors.textMuted,
                    fontFamily:   font.mono,
                    fontSize:     font.sizeMd,
                    cursor:       "pointer",
                    transition:   "all 0.15s",
                  }}
                >
                  {info.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      
      {/* Aspect ratio */}
        <div>
          <label style={FL}>Aspect Ratio</label>
          <div style={{ display: "flex", gap: 6 }}>
            {ASPECT_RATIOS.map((r) => {
              const active   = modelParams?.aspect_ratio?.label === r.label;
              const maxDim   = 14;
              const svgW     = r.w >= r.h ? maxDim : Math.round(maxDim * r.w / r.h);
              const svgH     = r.h >= r.w ? maxDim : Math.round(maxDim * r.h / r.w);
              return (
                <button
                  key={r.label}
                  onClick={() => setParam("aspect_ratio", r)}
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
        
        {/* Resolution picker — models with a resolutions enum */}
        {usesEnumSize && resolutions && (
          <div>
            <label style={FL}>Resolution</label>
            <div style={{ display: "flex", gap: 6 }}>
              {resolutions.map((r) => {
                const active = (modelParams.resolution ?? resolutions[0]) === r;
                return (
                  <button
                    key={r}
                    onClick={() => setParam("resolution", r)}
                    style={{
                      padding:      "6px 14px",
                      borderRadius: radius.md,
                      border:       `1px solid ${active ? colors.primary : "#1e1e1e"}`,
                      background:   active ? colors.primary : "transparent",
                      color:        active ? colors.primaryText : colors.textMuted,
                      fontFamily:   font.mono,
                      fontSize:     font.sizeMd,
                      cursor:       "pointer",
                      transition:   "all 0.15s",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Resolution slider — hidden for enum-size models (use resolution pill instead) */}
        {!usesEnumSize && (
          <div>
            <label style={FL}>
              Resolution — <span style={{ color: colors.textMuted }}>{computeSize(modelParams?.aspect_ratio, modelParams.baseSize).replace("*", " × ")}</span>
            </label>
            <input
              type="range"
              min={availableModels[model]?.min ?? 512}
              max={availableModels[model]?.max ?? 8192}
              step={64}
              value={modelParams.baseSize || 1024}
              onChange={(e) => setParam("baseSize", Number(e.target.value))}
              style={{ width: "100%", accentColor: colors.primary, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, marginTop: 4 }}>
              {(() => {
                const sliderMin = availableModels[model]?.min ?? 512;
                const sliderMax = availableModels[model]?.max ?? 8192;
                const mid = Math.round((sliderMin + sliderMax) / 2);
                const q1  = Math.round((sliderMin + mid) / 2);
                const q3  = Math.round((mid + sliderMax) / 2);
                return [sliderMin, q1, mid, q3, sliderMax].map((v) => <span key={v}>{v}</span>);
              })()}
            </div>
          </div>
        )}
      {/* Dynamic extra fields from model schema */}
      {extraFields.map(([key, schema]) => (
        <DynamicField
          key={key}
          fieldKey={key}
          schema={schema}
          value={modelParams[key]}
          onChange={(val) => setParam(key, val)}
        />
      ))}
    </div>
  );
}
