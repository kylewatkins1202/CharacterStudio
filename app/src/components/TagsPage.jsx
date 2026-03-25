import { useState } from "react";
import { TagPill } from "./TagPill";
import { TagFormModal } from "./TagFormModal";
import { TagDetail } from "./TagDetail";
import { TYPE_COLOR, TYPE_ICON, colors, font, radius, fieldInput as FI } from "../theme";

/**
 * TagsPage — searchable, filterable grid of all tags.
 *
 * Clicking a card opens TagDetail; the "+ New Tag" button opens TagFormModal.
 *
 * @param {{
 *   tags: object[],
 *   onTagsChange: () => void,
 *   toast: { add: Function }
 * }} props
 */
export function TagsPage({ tags, onTagsChange, toast }) {
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);

  const filtered = tags.filter((t) =>
    t.key.toLowerCase().includes(search.toLowerCase()) &&
    (!typeFilter || t.type === typeFilter)
  );

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "40px 24px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: font.serif, fontSize: font.sizeHeading, fontWeight: 700, color: colors.textHigh, margin: 0, letterSpacing: "-0.02em" }}>
            Tags
          </h1>
          <p style={{ color: colors.textMuted, fontFamily: font.mono, fontSize: font.sizeLg, marginTop: 6 }}>
            {tags.length} tag{tags.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: "10px 20px", background: colors.primary, border: "none", borderRadius: radius.md, color: colors.primaryText, fontFamily: font.mono, fontSize: font.sizeLg, fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em" }}
        >
          + New Tag
        </button>
      </div>

      {/* Search + type filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags…"
          style={{ flex: 1, ...FI }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {["character", "prop", "outfit", "location"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              style={{
                padding:      "8px 12px",
                borderRadius: radius.md - 1,
                border:       `1px solid ${typeFilter === t ? TYPE_COLOR[t] : "#1e1e1e"}`,
                background:   typeFilter === t ? TYPE_COLOR[t] + "11" : "transparent",
                color:        typeFilter === t ? TYPE_COLOR[t] : colors.textDim,
                fontFamily:   font.mono,
                fontSize:     14,
                cursor:       "pointer",
                transition:   "all 0.15s",
              }}
            >
              {TYPE_ICON[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Tag grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeLg }}>
          {search || typeFilter ? "No tags match your filters" : "No tags yet — create one to get started"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {filtered.map((tag) => {
            const allAssets = Object.values(tag.assets).flat();
            const preview   = allAssets[0]?.url;
            return (
              <div
                key={tag.key}
                onClick={() => setSelectedTag(tag)}
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.xl, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.borderStrong; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {preview
                  ? <div style={{ height: 130, overflow: "hidden" }}><img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                  : <div style={{ height: 72, background: colors.surfaceDeep, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: TYPE_COLOR[tag.type] + "44", fontSize: 28 }}>{TYPE_ICON[tag.type]}</span></div>
                }
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: font.mono, fontSize: font.sizeLg, color: colors.textMid }}>@{tag.key}</span>
                    <TagPill type={tag.type} />
                  </div>
                  {(tag.lock?.basicDescription || tag.lock?.appearanceDescription) && (
                    <p style={{ color: colors.textGhost, fontFamily: font.mono, fontSize: font.sizeSm, margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tag.lock.basicDescription || tag.lock.appearanceDescription}
                    </p>
                  )}
                  <div style={{ color: colors.borderStrong, fontFamily: font.mono, fontSize: font.sizeSm, marginTop: 6 }}>
                    {allAssets.length} image{allAssets.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <TagFormModal
          onClose={() => setShowCreate(false)}
          onSave={() => { onTagsChange(); setShowCreate(false); }}
          toast={toast}
        />
      )}
      {selectedTag && (
        <TagDetail
          tag={selectedTag}
          onClose={() => setSelectedTag(null)}
          onUpdated={(u) => { onTagsChange(); setSelectedTag(u); }}
          onDeleted={() => { onTagsChange(); setSelectedTag(null); }}
          toast={toast}
        />
      )}
    </div>
  );
}
