import { useEffect, useRef } from "react";
import { drawOverlay, type Transient } from "../overlay/renderer";
import type { Shape } from "../protocol/messages";
import { useOverlay, type OverlayInput, type Pt } from "../hooks/useOverlay";

export interface VideoOverlayProps {
  stream?: MediaStream;
  frozen?: { image: unknown; w: number; h: number } | null;
  shapes: Shape[];
  transients: Transient[];
  onPointer?(fx: number, fy: number): void;
  onDrag?(from: Pt, to: Pt): void;
  onDraw?(points: Pt[]): void;
  tool?: string;
  frameSize: { w: number; h: number };
  muted?: boolean;
  onFrameSize?(size: { w: number; h: number }): void;
}

const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

function sizeCanvas(c: HTMLCanvasElement, w: number, h: number) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function VideoOverlay(p: VideoOverlayProps) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const frame = p.frozen ? { w: p.frozen.w, h: p.frozen.h } : p.frameSize;
  const input: OverlayInput = { tool: p.tool, onPointer: p.onPointer, onDrag: p.onDrag, onDraw: p.onDraw };
  const { fit, size, handlers } = useOverlay(box, frame, input);

  useEffect(() => {
    if (video.current && video.current.srcObject !== (p.stream ?? null)) video.current.srcObject = p.stream ?? null;
  }, [p.stream]);

  useEffect(() => {
    const c = still.current;
    if (!c) return;
    const ctx = sizeCanvas(c, size.w, size.h);
    if (p.frozen && fit.w > 0) ctx.drawImage(p.frozen.image as CanvasImageSource, fit.x, fit.y, fit.w, fit.h);
  }, [p.frozen, fit, size]);

  const alive = p.transients.some((t) => t.until > Date.now());
  useEffect(() => {
    const c = over.current;
    if (!c) return;
    const ctx = sizeCanvas(c, size.w, size.h);
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      drawOverlay(ctx, fit, p.shapes, p.transients, now);
      if (p.transients.some((t) => t.until > now)) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [p.shapes, p.transients, fit, size, alive]);

  return (
    <div ref={box} style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <video ref={video} autoPlay playsInline muted={p.muted ?? true} style={{ ...fill, objectFit: "contain", visibility: p.frozen ? "hidden" : "visible" }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          p.onFrameSize?.({ w: v.videoWidth, h: v.videoHeight });
          v.play().catch(() => {});
        }}
        onResize={(e) => p.onFrameSize?.({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
      <canvas ref={still} style={{ ...fill, pointerEvents: "none", display: p.frozen ? "block" : "none" }} />
      <canvas ref={over} {...handlers} style={{ ...fill, touchAction: "none", pointerEvents: Object.keys(handlers).length ? "auto" : "none" }} />
    </div>
  );
}
