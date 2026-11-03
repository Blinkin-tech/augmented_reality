import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { contentRect, toFrac, type Fit } from "../overlay/geometry";

export type Pt = [number, number];
export interface OverlayInput {
  tool?: string;
  onPointer?(fx: number, fy: number): void;
  onDrag?(from: Pt, to: Pt): void;
  onDraw?(points: Pt[]): void;
}

const EMPTY: Fit = { x: 0, y: 0, w: 0, h: 0 };

/** Tracks the element size, derives the picture fit, and turns pointer events into fractions. */
export function useOverlay(box: RefObject<HTMLElement>, frame: { w: number; h: number }, input: OverlayInput) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState<Fit>(EMPTY);
  const track = useRef<Pt[]>([]);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);

  useEffect(() => { setFit(contentRect(size.w, size.h, frame.w, frame.h)); }, [size, frame.w, frame.h]);

  const at = useCallback((e: React.PointerEvent): Pt | undefined => {
    const r = e.currentTarget.getBoundingClientRect();
    return toFrac(e.clientX - r.left, e.clientY - r.top, fit);
  }, [fit]);

  const onPointerDown = (e: React.PointerEvent) => {
    const p = at(e);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    track.current = [p];
    if (inputRef.current.tool === "pointer") inputRef.current.onPointer?.(p[0], p[1]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!track.current.length) return;
    const p = at(e);
    if (!p) return;
    if (inputRef.current.tool === "pointer") inputRef.current.onPointer?.(p[0], p[1]);
    else if (inputRef.current.tool === "draw") track.current.push(p);
    else track.current[1] = p;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const pts = track.current;
    track.current = [];
    const end = at(e) ?? pts[pts.length - 1];
    if (!pts.length || !end) return;
    const { tool, onDrag, onDraw } = inputRef.current;
    if (tool === "arrow") onDrag?.(pts[0], end);
    else if (tool === "rect") onDraw?.([pts[0], end]);
    else if (tool === "draw") onDraw?.(pts);
  };

  const handlers = input.onPointer || input.onDrag || input.onDraw ? { onPointerDown, onPointerMove, onPointerUp } : {};
  return { fit, size, handlers };
}
