import { useState } from "react";
import { api } from "../lib/api";
import { colors, font, radius } from "../theme";

/**
 * DownloadButton — saves a gallery image to the local downloads folder.
 *
 * Shows a "✓ Saved" badge if the entry already has a localUrl.
 * While downloading, the button is disabled and shows "…".
 *
 * @param {{
 *   entry: { id: string, localUrl?: string },
 *   onDownloaded: (id: string, localUrl: string) => void
 * }} props
 */
export function DownloadButton({ entry, onDownloaded, onOpened }) {
  // True while the download API call is in-flight
  const [downloading, setDownloading] = useState(false);
  if (entry?.localUrl) {
    return (
      <button style={{
        padding:    "4px 10px",
        borderRadius: radius.md - 2,
        border:     `1px solid ${colors.borderMid}`,
        // color:      colors.borderStrong,
        fontFamily: font.mono,
        fontSize:   font.sizeSm,
        userSelect: "none",
        cursor:     "pointer",
      }} onClick={ () => onOpened?.({localUrl: entry.localUrl, imageAssetId: entry.imageAssetId})}>
        ✓ Open
      </button>
    );
  }
  
  const handleDownload = async () => {
    // Set in-flight state
    setDownloading(true);

    try {
      console.log('download')
      // POST to the download endpoint to save the image to the local disk
      const res = await api.post(`/gallery/${entry.id}/download`);
      if (res.ok) {
        // Pass the new local file URL up to the parent so the button switches to "✓ Saved"
        onDownloaded(entry.id, res.localUrl);
      } else {
        console.error("Download failed:", res.error);
      }
    } catch (err) {
      console.error("Download error:", err);
    }
    setDownloading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      style={{
        padding:      "4px 10px",
        background:   "none",
        border:       `1px solid #1e1e1e`,
        borderRadius: radius.md - 2,
        color:        downloading ? colors.borderStrong : colors.textMuted,
        fontFamily:   font.mono,
        fontSize:     font.sizeSm,
        cursor:       downloading ? "not-allowed" : "pointer",
        transition:   "all 0.15s",
        whiteSpace:   "nowrap",
      }}
      onMouseEnter={(e) => { if (!downloading) { e.currentTarget.style.borderColor = colors.borderFocus; e.currentTarget.style.color = "#e0e0e0"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = downloading ? colors.borderStrong : colors.textMuted; }}
    >
      {downloading ? "…" : "↓ Save"}
    </button>
  );
}
