import { type ReactNode } from "react";
import type { SnapshotItem } from "../api";

export interface GalleryProps {
  items: SnapshotItem[]; selectedId?: string; onSelect(id: string): void;
  openId?: string; onOpen(id: string | undefined): void;
  /** Rendered over the image in the modal, e.g. a suggestion layer. */
  children?: ReactNode;
  /** Shown over the modal image while busy. */
  busy?: boolean;
}

export function Gallery({ items, selectedId, onSelect, openId, onOpen, children, busy }: GalleryProps) {
  const shown = items.find((i) => i.id === openId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, overflowY: "auto", height: "100%" }}>
      {items.map((it) => (
        <img key={it.id} data-testid="gallery-item" src={it.url} alt="Snapshot"
          style={{ width: "100%", cursor: "pointer", outline: it.id === selectedId ? "3px solid #ffcc00" : "none" }}
          onClick={() => { if (it.id === selectedId) onOpen(it.id); else onSelect(it.id); }} />
      ))}
      {shown && (
        <div role="dialog" aria-label="Snapshot" onClick={() => onOpen(undefined)}
          style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "inline-block", maxWidth: "95vw", maxHeight: "95vh" }}>
            <img src={shown.url} alt="Snapshot" style={{ display: "block", maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain" }} />
            {busy && <div role="progressbar" aria-label="Analyzing" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "#0006" }}>Analyzing...</div>}
            {children}
          </div>
          <button aria-label="Close" style={{ position: "absolute", top: 8, right: 8 }} onClick={() => onOpen(undefined)}>Close</button>
        </div>
      )}
    </div>
  );
}
