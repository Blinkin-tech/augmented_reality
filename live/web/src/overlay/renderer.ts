import type { Shape } from "../protocol/messages";
import { toPx, type Fit } from "./geometry";

export type Transient = {
  kind: "pointer" | "arrow";
  until: number;
  pts: [number, number][];
  color: string;
};

const POINTER_COLOR = "#ffcc00";
const POINTER_RADIUS = 24;
const POINTER_STROKE = 3;
const ARROW_STROKE = 4;
const ARROW_HEAD = 14;
const TEXT_PAD = 4;

function drawArrow(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = ARROW_STROKE;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  for (const side of [-1, 1]) {
    const t = angle + Math.PI + (side * Math.PI) / 6;
    ctx.lineTo(b[0] + ARROW_HEAD * Math.cos(t), b[1] + ARROW_HEAD * Math.sin(t));
  }
  ctx.closePath();
  ctx.fill();
}

function drawShape(ctx: CanvasRenderingContext2D, fit: Fit, s: Shape) {
  const pts = s.points.map(([fx, fy]) => toPx(fx, fy, fit));
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (s.kind === "path" && pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  } else if (s.kind === "rect" && pts.length >= 2) {
    const [a, b] = pts;
    ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  } else if (s.kind === "text" && pts.length >= 1 && s.text) {
    ctx.font = "bold 20px sans-serif";
    ctx.textBaseline = "top";
    const w = ctx.measureText(s.text).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(pts[0][0], pts[0][1], w + TEXT_PAD * 2, 20 + TEXT_PAD * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(s.text, pts[0][0] + TEXT_PAD, pts[0][1] + TEXT_PAD);
  }
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  shapes: Shape[],
  transients: Transient[],
  now: number,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const s of shapes) drawShape(ctx, fit, s);
  for (const t of transients) {
    if (t.until <= now) continue;
    const pts = t.pts.map(([fx, fy]) => toPx(fx, fy, fit));
    if (t.kind === "pointer" && pts.length >= 1) {
      ctx.strokeStyle = POINTER_COLOR;
      ctx.lineWidth = POINTER_STROKE;
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], POINTER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    } else if (t.kind === "arrow" && pts.length >= 2) {
      drawArrow(ctx, pts[0], pts[pts.length - 1], t.color);
    }
  }
}
