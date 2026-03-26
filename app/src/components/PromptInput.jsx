import { useState, useRef, useEffect, useMemo } from "react";
import { TagPill } from "./TagPill";
import { TYPE_COLOR, colors, font, radius } from "../theme";

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Serialize a DOM element's children to a plain string.
 * Pill spans (data-tag) are serialized as "@key".
 */
function serializeDom(el) {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
    else if (node.dataset?.tag)          out += "@" + node.dataset.tag;
    else                                  out += serializeDom(node);
  }
  return out;
}

/**
 * Split a plain-text string into text / tag tokens.
 * Only @mentions that are in `tagKeys` become tag tokens.
 */
function tokenize(str, tagKeys) {
  const tokens = [];
  const re     = /@(\S+)/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) tokens.push({ t: "text", v: str.slice(last, m.index) });
    tokens.push(tagKeys.has(m[1]) ? { t: "tag", key: m[1] } : { t: "text", v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < str.length) tokens.push({ t: "text", v: str.slice(last) });
  return tokens;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PromptInput — a rich contenteditable prompt field with @tag pill rendering.
 *
 * - Typing @name opens an autocomplete dropdown.
 * - Selecting a suggestion inserts an inline pill ("@name").
 * - Pressing Backspace while the cursor is immediately after a pill removes
 *   the entire @tag token.
 * - The `value` / `onChange` contract uses the plain-text form ("@name"),
 *   so the parent is unaffected by the pill rendering.
 */
export function PromptInput({ value, onChange, tags }) {
  const [mentionQuery,      setMentionQuery]      = useState(null);
  const [mentionStart,      setMentionStart]      = useState(null);
  const [mentionReplaceEnd, setMentionReplaceEnd] = useState(null);
  const [activeSug,         setActiveSug]         = useState(0);
  const [focused,           setFocused]           = useState(false);
  const editorRef = useRef(null);

  const tagKeys = useMemo(() => new Set(tags.map((t) => t.key)), [tags]);

  const filtered = mentionQuery !== null
    ? tags.filter((t) => t.key.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => { setActiveSug(0); }, [mentionQuery]);

  // ── DOM render ─────────────────────────────────────────────────────────────

  const renderToDOM = (str) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = "";
    for (const tok of tokenize(str, tagKeys)) {
      if (tok.t === "text") {
        if (tok.v) el.appendChild(document.createTextNode(tok.v));
      } else {
        const span = document.createElement("span");
        span.contentEditable = "false";
        span.dataset.tag = tok.key;
        span.style.cssText = [
          "display:inline-block",
          "background:#1c1c2e",
          "border:1px solid #3a3a5c",
          "border-radius:4px",
          "padding:1px 7px",
          "margin:0 2px",
          `font-family:${font.mono}`,
          `font-size:${font.sizeLg}`,
          "color:#9090d0",
          "cursor:default",
          "user-select:none",
          "vertical-align:baseline",
        ].join(";");
        span.textContent = "@" + tok.key;
        el.appendChild(span);
      }
    }
  };

  // Sync value → DOM only when they diverge (avoids clobbering cursor mid-type)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (serializeDom(el) !== value) {
      renderToDOM(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tagKeys]);

  // ── Cursor helpers ──────────────────────────────────────────────────────────

  /** Plain text from the start of the editor to the current cursor position. */
  const getBeforeCursor = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !editorRef.current) return "";
    try {
      const r = document.createRange();
      r.setStart(editorRef.current, 0);
      r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
      const tmp = document.createElement("div");
      tmp.appendChild(r.cloneContents());
      return serializeDom(tmp);
    } catch {
      return "";
    }
  };

  const moveCursorToEnd = () => {
    const el = editorRef.current;
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const str    = serializeDom(el);
    onChange(str);
    const before = getBeforeCursor();
    const atIdx  = before.lastIndexOf("@");
    if (atIdx !== -1 && !before.slice(atIdx + 1).includes(" ")) {
      setMentionStart(atIdx);
      setMentionQuery(before.slice(atIdx + 1));
    } else {
      setMentionQuery(null);
      setMentionStart(null);
    }
  };

  const insertTag = (tag) => {
    const el = editorRef.current;
    if (!el) return;
    const str    = serializeDom(el);
    const end    = mentionReplaceEnd ?? getBeforeCursor().length;
    const prefix = str.slice(0, mentionStart);
    const suffix = str.slice(end);
    const newVal = prefix + "@" + tag.key + " " + suffix;
    onChange(newVal);
    renderToDOM(newVal);
    setMentionQuery(null);
    setMentionStart(null);
    setMentionReplaceEnd(null);
    setTimeout(() => { editorRef.current?.focus(); moveCursorToEnd(); }, 0);
  };

  const handlePillClick = (e) => {
    const span = e.target.closest("[data-tag]");
    if (!span || !editorRef.current?.contains(span)) return;
    // Serialize everything before this span to find its position in the string
    let before = "";
    for (const node of editorRef.current.childNodes) {
      if (node === span) break;
      if (node.nodeType === Node.TEXT_NODE) before += node.textContent;
      else if (node.dataset?.tag) before += "@" + node.dataset.tag;
      else before += serializeDom(node);
    }
    const key = span.dataset.tag;
    setMentionStart(before.length);
    setMentionReplaceEnd(before.length + 1 + key.length);
    setMentionQuery("");
    setActiveSug(0);
  };

  const handleKeyDown = (e) => {
    // ── Pill-aware backspace ──
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (sel?.isCollapsed && sel.rangeCount) {
        const { startContainer, startOffset } = sel.getRangeAt(0);

        // Cursor at offset 0 in a text node whose previous sibling is a pill
        if (startOffset === 0 && startContainer.previousSibling?.dataset?.tag) {
          e.preventDefault();
          startContainer.previousSibling.remove();
          onChange(serializeDom(editorRef.current));
          return;
        }

        // Cursor in the editor div itself, and the previous child is a pill
        if (startContainer === editorRef.current && startOffset > 0) {
          const prev = editorRef.current.childNodes[startOffset - 1];
          if (prev?.dataset?.tag) {
            e.preventDefault();
            prev.remove();
            onChange(serializeDom(editorRef.current));
            return;
          }
        }
      }
    }

    // ── Dropdown navigation ──
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
      setMentionReplaceEnd(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .prompt-editor:empty::before {
          content: attr(data-placeholder);
          color: ${colors.textGhost};
          pointer-events: none;
        }
      `}</style>

      <div
        ref={editorRef}
        className="prompt-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handlePillClick}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setTimeout(() => setMentionQuery(null), 150);
        }}
        data-placeholder="Describe your scene… use @tag to reference characters, outfits, props & locations"
        style={{
          width:        "100%",
          minHeight:    "20.5em",
          background:   colors.surfaceDeep,
          border:       `1px solid ${focused ? colors.borderFocus : colors.borderStrong}`,
          borderRadius: radius.lg,
          color:        colors.text,
          fontFamily:   font.mono,
          fontSize:     font.sizeXl,
          padding:      "14px 16px",
          outline:      "none",
          boxSizing:    "border-box",
          lineHeight:   1.6,
          transition:   "border-color 0.2s",
          whiteSpace:   "pre-wrap",
          wordBreak:    "break-word",
          cursor:       "text",
        }}
      />

      {filtered.length > 0 && mentionQuery !== null && (
        <div style={{
          position:     "absolute",
          top:          "calc(100% + 6px)",
          left:         0,
          right:        0,
          background:   colors.surfaceSink,
          border:       `1px solid ${colors.borderStrong}`,
          borderRadius: radius.lg,
          overflow:     "hidden",
          zIndex:       100,
          boxShadow:    "0 12px 40px rgba(0,0,0,0.7)",
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
