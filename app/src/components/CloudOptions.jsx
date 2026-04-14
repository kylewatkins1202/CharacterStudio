import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { colors, font, radius, fieldLabel as FL } from "../theme";

const RESOLUTIONS = ["1k", "2k", "4k"];

/**
 * CloudOptions — model selector for WaveSpeed cloud generation.
 *
 * @param {{
 *   model: string, onModelChange: Function,
 *   models?: { [key: string]: { name: string, min: number, max: number, schema?: string } },
 *   resolution?: string, onResolutionChange?: Function,
 * }} props
 */
export function CloudOptions({
  model, onModelChange, models,
  resolution, onResolutionChange,
}) {
  const [fetchedModels, setFetchedModels] = useState(null);

  useEffect(() => {
    if (models) return;
    api.get("/models/wavespeed/options").then((res) => {
      if (res.ok) setFetchedModels(res.models);
    }).catch(() => {});
  }, [models]);

  const availableModels = models || fetchedModels;
  const currentSchema   = availableModels?.[model]?.schema;
  const isNanoBanana    = currentSchema === "nano-banana";

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

      {/* Resolution picker — Nano Banana Pro only */}
      {isNanoBanana && onResolutionChange && (
        <div>
          <label style={FL}>Resolution</label>
          <div style={{ display: "flex", gap: 6 }}>
            {RESOLUTIONS.map((r) => {
              const active = resolution === r;
              return (
                <button
                  key={r}
                  onClick={() => onResolutionChange(r)}
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
    </div>
  );
}
