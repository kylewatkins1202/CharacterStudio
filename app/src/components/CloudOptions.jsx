import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { colors, font, radius, fieldLabel as FL } from "../theme";

/**
 * CloudOptions — model selector for WaveSpeed cloud generation.
 *
 * @param {{
 *   model: string, onModelChange: Function,
 *   models?: { [key: string]: { name: string, min: number, max: number } },
 * }} props
 */
export function CloudOptions({
  model, onModelChange, models
}) {
  const [fetchedModels, setFetchedModels] = useState(null);

  useEffect(() => {
    if (models) return;
    api.get("/models/wavespeed/options").then((res) => {
      if (res.ok) {
        setFetchedModels(res.models);
      }
    }).catch(() => {});
  }, [models]);

  const availableModels = models || fetchedModels;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Model */}
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
    </div>
  );
}
