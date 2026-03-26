import { api } from "../lib/api";
import { computeSize, estimateCost, extractImageUrl } from "../lib/utils";
import { ASPECT_RATIOS } from "../lib/constants";
import { PromptInput } from "./PromptInput";
import { ReferenceImageInput } from "./ReferenceImageInput";
import { colors, font, radius, fieldLabel as FL } from "../theme";

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
  loading, setLoading,
  result, setResult,
  compiled, setCompiled,
  referenceImages, setReferenceImages,
  resetCache, setResetCache,
  onGenerated,
}) {
  const computedSize = computeSize(aspect, baseSize);
  const cost         = estimateCost(computedSize);
  const imageUrl     = result ? extractImageUrl(result) : null;

  /**
   * Generates image and shows the image and its raw prompt to the user
   * @returns {Promise<void>}
   */
  const generate = async () => {
    // If no prompt
    if (!prompt.trim()) return toast.add("Please enter a prompt", "error");
    
    // Set loading to true
    setLoading(true);

    // Set result to null
    setResult(null);
    
    // Set compiled to null
    setCompiled(null);

    try {
      // Request body
      const body = {
        prompt,
        size: computedSize,
        // Existing assets picked from the library — resolved server-side by ID
        referenceAssetIds:  referenceImages.filter((i) => i.assetId).map((i) => ({ id: i.assetId, purpose: i.purpose })),
        // New base64 uploads — creates an asset record on the backend
        referenceImages:    referenceImages.filter((i) => !i.assetId && !i.isUrl).map((i) => ({ data: i.src, purpose: i.purpose })),
        // Pasted URLs — healed if a matching asset exists, used as-is otherwise
        referenceImageUrls: referenceImages.filter((i) => i.isUrl).map((i) => ({ url: i.url || i.src, purpose: i.purpose })),
        resetCache,
      }

      // Generate image
      const res = await api.post("/generate", body);

      // If response is ok 
      if (res.ok) {
        // Set result
        setResult(res.wavespeed);

        // Set compiled
        setCompiled(res.compiled);

        // Add tost for image generated
        toast.add("Image generated!", "success");

        // Set reset cache to false
        setResetCache(false);

        // Run on generated
        onGenerated();
      } else {
        // Add toast for generation failed
        toast.add(res.error || "Generation failed", "error");
      }
    } catch (err) {
      toast.add(err.message || "Network error", "error");
    }
    setLoading(false);
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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PromptInput value={prompt} onChange={setPrompt} tags={tags} />

        {/* Reference images */}
        <div>
          <label style={FL}>
            Reference Images{" "}
            <span style={{ color: colors.borderStrong, fontWeight: 400 }}>
              — passed directly to the model alongside tag images
            </span>
          </label>
          <ReferenceImageInput images={referenceImages} onChange={setReferenceImages} />
        </div>

        {/* Aspect ratio */}
        <div>
          <label style={FL}>Aspect Ratio</label>
          <div style={{ display: "flex", gap: 6 }}>
            {ASPECT_RATIOS.map((r) => (
              <button
                key={r.label}
                onClick={() => setAspect(r)}
                style={{
                  padding:      "6px 14px",
                  borderRadius: radius.md - 1,
                  border:       `1px solid ${aspect.label === r.label ? colors.primary : "#1e1e1e"}`,
                  background:   aspect.label === r.label ? colors.primary : "transparent",
                  color:        aspect.label === r.label ? colors.primaryText : colors.textMuted,
                  fontFamily:   font.mono,
                  fontSize:     font.sizeMd,
                  cursor:       "pointer",
                  transition:   "all 0.15s",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution slider */}
        <div>
          <label style={FL}>
            Resolution — <span style={{ color: colors.textMuted }}>{computedSize.replace("*", " × ")}</span>
          </label>
          <input
            type="range"
            min={512}
            max={8192}
            step={64}
            value={baseSize}
            onChange={(e) => setBaseSize(Number(e.target.value))}
            style={{ width: "100%", accentColor: colors.primary, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, marginTop: 4 }}>
            <span>512</span><span>2048</span><span>4096</span><span>6144</span><span>8192</span>
          </div>
        </div>

        {/* Actions row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14 }}>
          {cost && (
            <span style={{ fontFamily: font.mono, fontSize: font.sizeMd, color: colors.textGhost }}>
              est. <span style={{ color: colors.textMuted }}>${cost}</span>
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
            disabled={loading}
            style={{
              padding:      "10px 32px",
              background:   loading ? "#111" : colors.primary,
              color:        loading ? colors.textGhost : colors.primaryText,
              border:       "none",
              borderRadius: radius.md,
              fontFamily:   font.mono,
              fontSize:     font.sizeLg,
              fontWeight:   600,
              cursor:       loading ? "not-allowed" : "pointer",
              transition:   "all 0.2s",
              whiteSpace:   "nowrap",
            }}
          >
            {loading ? "Generating…" : "Generate →"}
          </button>
        </div>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, border: "2px solid #1e1e1e", borderTop: "2px solid #666", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: font.sizeMd }}>Dreaming…</span>
        </div>
      )}

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
