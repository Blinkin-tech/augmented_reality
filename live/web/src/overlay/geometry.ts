export type Fit = { x: number; y: number; w: number; h: number };

/** The letterboxed picture area inside an element (`object-fit: contain`). */
export function contentRect(elementW: number, elementH: number, frameW: number, frameH: number): Fit {
  const ok = [elementW, elementH, frameW, frameH].every((v) => Number.isFinite(v) && v > 0);
  if (!ok) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(elementW / frameW, elementH / frameH);
  const w = frameW * scale;
  const h = frameH * scale;
  return { x: (elementW - w) / 2, y: (elementH - h) / 2, w, h };
}

/** Pixel to fraction of the picture; undefined outside the picture. */
export function toFrac(px: number, py: number, fit: Fit): [number, number] | undefined {
  if (fit.w <= 0 || fit.h <= 0) return undefined;
  if (px < fit.x || py < fit.y || px > fit.x + fit.w || py > fit.y + fit.h) return undefined;
  return [(px - fit.x) / fit.w, (py - fit.y) / fit.h];
}

export function toPx(fx: number, fy: number, fit: Fit): [number, number] {
  return [fit.x + fx * fit.w, fit.y + fy * fit.h];
}
