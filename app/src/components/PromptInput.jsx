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
  // The text after the last "@" still being typed (null when no active mention)
  const [mentionQuery, setMentionQuery] = useState(null);
  // Cursor index in the prompt where the current "@" was typed
  const [mentionStart, setMentionStart] = useState(null);
  // Index of the currently highlighted suggestion row
  const [activeSug,    setActiveSug]    = useState(0);
  // Ref to the textarea for direct cursor manipulation
  const taRef = useRef(null);

  // Filter tags by mentionQuery, capped at 8 results
  const filtered = mentionQuery !== null
    ? tags.filter((t) => t.key.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  // Reset the active suggestion to the first row whenever the query changes
  useEffect(() => { setActiveSug(0); }, [mentionQuery]);

  const handleChange = (e) => {
    const val = e.target.value;
    // Capture the cursor position before React re-renders
    const cur = e.target.selectionStart;
    // Propagate the new value to the parent
    onChange(val);

    // Check if the text left of the cursor contains an open @-mention
    const before = val.slice(0, cur);
    const atIdx  = before.lastIndexOf("@");
    if (atIdx !== -1) {
      // Text between "@" and the cursor — the mention search term
      const seg = before.slice(atIdx + 1);
      // If no space in the segment, the mention is still being typed
      if (!seg.includes(" ")) {
        setMentionStart(atIdx);
        setMentionQuery(seg);
        return;
      }
    }
    // Cursor is not inside an open mention — close the dropdown
    setMentionQuery(null);
    setMentionStart(null);
  };

  const insertTag = (tag) => {
    // Use the textarea's current cursor as the end of the mention segment
    const cur    = taRef.current?.selectionStart ?? value.length;
    // Text before the "@" that opened the mention
    const before = value.slice(0, mentionStart);
    // Text after the cursor
    const after  = value.slice(cur);
    // Replace "@query" with "@key " (trailing space makes the next word easy to type)
    onChange(before + "@" + tag.key + " " + after);
    // Close the dropdown
    setMentionQuery(null);
    setMentionStart(null);
    // Restore focus and move the cursor to just after the inserted tag
    setTimeout(() => {
      taRef.current?.focus();
      const pos = (before + "@" + tag.key + " ").length;
      taRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e) => {
    // Ignore key events when the dropdown is not showing
    if (!filtered.length || mentionQuery === null) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      // Move highlight down, clamping at the last item
      setActiveSug((p) => Math.min(p + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      // Move highlight up, clamping at the first item
      setActiveSug((p) => Math.max(p - 1, 0));
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      // Insert the currently highlighted tag
      insertTag(filtered[activeSug]);
    } else if (e.key === "Escape") {
      // Dismiss the dropdown without inserting
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
