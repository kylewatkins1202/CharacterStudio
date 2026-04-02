import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { colors, font, radius, fieldLabel as FL } from "../theme";

/**
 * CloudOptions — model, lora, steps, cfg, and denoise controls for local ComfyUI mode.
 *
 * @param {{
 *   model: string, onModelChange: Function,
 *   steps: number, onStepsChange: Function,
 *   cfg: number,   onCfgChange: Function,
 *   denoise: number, onDenoiseChange: Function,
 *   loras: Array<{loraKey: string, strength: number}>, onLorasChange: Function,
 * }} props
 */
export function CloudOptions({
  model,     onModelChange
}) {
  const [availableModels,    setAvailableModels]    = useState([]);

  useEffect(() => {
    api.get("/models/wavespeed/options").then((res) => {
      if (res.ok) {
        setAvailableModels(res.models)
      }
    }).catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Model */}
      {availableModels.length > 0 && (
        <div>
          <label style={FL}>Model</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {availableModels.map((m) => {
              const active = model === m;
              return (
                <button
                  key={m}
                  onClick={() => onModelChange(m)}
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
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
