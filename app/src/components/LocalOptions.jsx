import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { colors, font, radius, fieldLabel as FL } from "../theme";

/**
 * NumberStepper — a compact +/- numeric input styled to match the dark theme.
 */
function NumberStepper({ value, onChange, step, min, max, label }) {
  const dec = () => {
    const next = Math.round((value - step) * 1000) / 1000;
    if (min == null || next >= min) onChange(next);
  };
  const inc = () => {
    const next = Math.round((value + step) * 1000) / 1000;
    if (max == null || next <= max) onChange(next);
  };

  const btnStyle = {
    width:      26,
    height:     "100%",
    background: "transparent",
    border:     "none",
    color:      colors.textMuted,
    fontFamily: font.mono,
    fontSize:   font.sizeLg,
    cursor:     "pointer",
    padding:    0,
    lineHeight: 1,
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <div style={{ ...FL, marginBottom: 0 }}>{label}</div>}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        background:   "#0d0d0d",
        border:       `1px solid #1e1e1e`,
        borderRadius: radius.md,
        height:       34,
        width:        100,
        overflow:     "hidden",
      }}>
        <button onClick={dec} style={btnStyle}>−</button>
        <div style={{
          flex:       1,
          textAlign:  "center",
          fontFamily: font.mono,
          fontSize:   font.sizeMd,
          color:      colors.text,
          userSelect: "none",
        }}>
          {value}
        </div>
        <button onClick={inc} style={btnStyle}>+</button>
      </div>
    </div>
  );
}

/**
 * LocalOptions — model, lora, steps, cfg, and denoise controls for local ComfyUI mode.
 *
 * @param {{
 *   model: string, onModelChange: Function,
 *   steps: number, onStepsChange: Function,
 *   cfg: number,   onCfgChange: Function,
 *   denoise: number, onDenoiseChange: Function,
 *   loras: Array<{loraKey: string, strength: number}>, onLorasChange: Function,
 * }} props
 */
export function LocalOptions({
  model,     onModelChange,
  steps,     onStepsChange,
  cfg,       onCfgChange,
  denoise,   onDenoiseChange,
  loras,     onLorasChange,
  scheduler, onSchedulerChange,
  sampler,   onSamplerChange,
}) {
  const [availableModels,    setAvailableModels]    = useState([]);
  const [availableLoras,     setAvailableLoras]     = useState([]);
  const [availableSchedulers, setAvailableSchedulers] = useState([]);
  const [availableSamplers,   setAvailableSamplers]   = useState([]);

  useEffect(() => {
    api.get("/models/comfyui/options").then((res) => {
      if (res.ok) {
        setAvailableModels(res.models);
        setAvailableLoras(res.loras);
        setAvailableSchedulers(res.schedulers);
        setAvailableSamplers(res.samplers);
      }
    }).catch(() => {});
  }, []);

  const toggleLora = (key) => {
    const exists = loras.find((l) => l.loraKey === key);
    if (exists) {
      onLorasChange(loras.filter((l) => l.loraKey !== key));
    } else {
      onLorasChange([...loras, { loraKey: key, strength: 1 }]);
    }
  };

  const setLoraStrength = (key, strength) => {
    onLorasChange(loras.map((l) => l.loraKey === key ? { ...l, strength } : l));
  };

  const activeLora = (key) => loras.find((l) => l.loraKey === key);

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

      {/* Steps / CFG / Denoise */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <NumberStepper label="Steps"   value={steps}   onChange={onStepsChange}   step={1}   min={1} />
        <NumberStepper label="CFG"     value={cfg}     onChange={onCfgChange}     step={0.1} min={0} />
        <NumberStepper label="Denoise" value={denoise} onChange={onDenoiseChange} step={0.01} min={0} max={1} />
      </div>

      {/* Scheduler / Sampler */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {availableSchedulers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ ...FL, marginBottom: 0 }}>Scheduler</div>
            <select
              value={scheduler}
              onChange={(e) => onSchedulerChange(e.target.value)}
              style={{
                background:   "#0d0d0d",
                border:       `1px solid #1e1e1e`,
                borderRadius: radius.md,
                color:        colors.text,
                fontFamily:   font.mono,
                fontSize:     font.sizeMd,
                padding:      "6px 10px",
                cursor:       "pointer",
                outline:      "none",
              }}
            >
              {availableSchedulers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        {availableSamplers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ ...FL, marginBottom: 0 }}>Sampler</div>
            <select
              value={sampler}
              onChange={(e) => onSamplerChange(e.target.value)}
              style={{
                background:   "#0d0d0d",
                border:       `1px solid #1e1e1e`,
                borderRadius: radius.md,
                color:        colors.text,
                fontFamily:   font.mono,
                fontSize:     font.sizeMd,
                padding:      "6px 10px",
                cursor:       "pointer",
                outline:      "none",
              }}
            >
              {availableSamplers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* LoRAs */}
      {availableLoras.length > 0 && (
        <div>
          <label style={FL}>LoRAs</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {availableLoras.map((key) => {
              const active = activeLora(key);
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => toggleLora(key)}
                    style={{
                      padding:      "5px 14px",
                      borderRadius: radius.md,
                      border:       `1px solid ${active ? colors.primary : "#1e1e1e"}`,
                      background:   active ? colors.primary : "transparent",
                      color:        active ? colors.primaryText : colors.textMuted,
                      fontFamily:   font.mono,
                      fontSize:     font.sizeMd,
                      cursor:       "pointer",
                      transition:   "all 0.15s",
                      minWidth:     80,
                    }}
                  >
                    {key}
                  </button>

                  {active && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: font.mono, fontSize: font.sizeSm, color: colors.textGhost }}>
                        strength
                      </span>
                      <NumberStepper
                        value={active.strength}
                        onChange={(v) => setLoraStrength(key, v)}
                        step={0.1}
                        min={0}
                        max={2}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
