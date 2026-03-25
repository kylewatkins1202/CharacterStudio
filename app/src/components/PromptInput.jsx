import { useState, useRef, useEffect } from "react";
import { TagPill } from "./TagPill";
import { TYPE_COLOR, colors, font, radius } from "../theme";

/**
 * PromptInput — a textarea with @-mention autocomplete for tags.
 *
 * Typing "@" followed by characters shows a dropdown of matching tag keys.
 * Selecting a suggestion inserts the full "@key " into the prompt.
 *
 * @param {{
 *   value: string,
 *   onChange: (value: string) => void,
 *   tags: Array<{ key: string, type: string }>
 * }} props
 */
export function PromptInput({ value, onChange, tags }) {
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(null);
  const [activeSug,    setActiveSug]    = useState(0);
  const taRef = useRef(null);

  const filtered = mentionQuery !== null
    ? tags.filter((t) => t.key.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => { setActiveSug(0); }, [mentionQuery]);

  const handleChange = (e) => {
    const val = e.target.value;
    const cur = e.target.selectionStart;
    onChange(val);

    const before = val.slice(0, cur);
    const atIdx  = before.lastIndexOf("@");
    if (atIdx !== -1) {
      const seg = before.slice(atIdx + 1);
      if (!seg.includes(" ")) {
        setMentionStart(atIdx);
        setMentionQuery(seg);
        return;
      }
    }
    setMentionQuery(null);
    setMentionStart(null);
  };

  const insertTag = (tag) => {
    const cur    = taRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after  = value.slice(cur);
    onChange(before + "@" + tag.key + " " + after);
    setMentionQuery(null);
    setMentionStart(null);
    setTimeout(() => {
      taRef.current?.focus();
      const pos = (before + "@" + tag.key + " ").length;
      taRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!filtered.length || mentionQuery === null) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSug((p) => Math.min(p + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSug((p) => Math.max(p - 1, 0));
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      insertTag(filtered[activeSug]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
        onFocus={(e) => (e.target.style.borderColor = colors.borderFocus)}
        placeholder="Describe your scene… use @tag to reference characters, outfits, props & locations"
        rows={4}
        style={{
          width:       "100%",
          background:  colors.surfaceDeep,
          border:      `1px solid ${colors.borderStrong}`,
          borderRadius: radius.lg,
          color:       colors.text,
          fontFamily:  font.mono,
          fontSize:    font.sizeXl,
          padding:     "14px 16px",
          resize:      "vertical",
          outline:     "none",
          boxSizing:   "border-box",
          lineHeight:  1.6,
          transition:  "border-color 0.2s",
        }}
      />

      {filtered.length > 0 && mentionQuery !== null && (
        <div style={{
          position:   "absolute",
          top:        "calc(100% + 6px)",
          left:       0,
          right:      0,
          background: colors.surfaceSink,
          border:     `1px solid ${colors.borderStrong}`,
          borderRadius: radius.lg,
          overflow:   "hidden",
          zIndex:     100,
          boxShadow:  "0 12px 40px rgba(0,0,0,0.7)",
        }}>
          {filtered.map((tag, i) => (
            <div
              key={tag.key}
              onMouseDown={() => insertTag(tag)}
              onMouseEnter={() => setActiveSug(i)}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                padding:      "10px 14px",
                cursor:       "pointer",
                background:   i === activeSug ? "#1e1e1e" : "transparent",
                borderBottom: i < filtered.length - 1 ? `1px solid ${colors.border}` : "none",
              }}
            >
              <span style={{ color: TYPE_COLOR[tag.type], fontFamily: font.mono, fontSize: font.sizeLg }}>
                @{tag.key}
              </span>
              <TagPill type={tag.type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
