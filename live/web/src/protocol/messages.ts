export type ControlMessage =
  | { t: "pointer"; x: number; y: number }
  | { t: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { t: "freeze-start"; frameId: string; bytes: number; chunks: number; w: number; h: number }
  | { t: "freeze-end"; frameId: string }
  | { t: "shape"; id: string; kind: "path" | "rect" | "text"; points: [number, number][]; color: string; text?: string }
  | { t: "clear" }
  | { t: "resume" }
  | { t: "ack"; frameId: string; ok: boolean }
  | { t: "resumed" };

export type Shape = Extract<ControlMessage, { t: "shape" }>;

export function encode(m: ControlMessage): string {
  return JSON.stringify(m);
}

const frac = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const str = (v: unknown): v is string => typeof v === "string";
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function decode(raw: string): ControlMessage | undefined {
  let o: any;
  try {
    o = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof o !== "object" || o === null) return undefined;
  switch (o.t) {
    case "pointer":
      return frac(o.x) && frac(o.y) ? { t: "pointer", x: o.x, y: o.y } : undefined;
    case "arrow":
      return frac(o.x1) && frac(o.y1) && frac(o.x2) && frac(o.y2) && str(o.color)
        ? { t: "arrow", x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, color: o.color }
        : undefined;
    case "freeze-start":
      return id(o.frameId) && count(o.bytes) && count(o.chunks) && count(o.w) && count(o.h)
        ? { t: "freeze-start", frameId: o.frameId, bytes: o.bytes, chunks: o.chunks, w: o.w, h: o.h }
        : undefined;
    case "freeze-end":
      return id(o.frameId) ? { t: "freeze-end", frameId: o.frameId } : undefined;
    case "shape": {
      if (!id(o.id) || !str(o.color)) return undefined;
      if (o.kind !== "path" && o.kind !== "rect" && o.kind !== "text") return undefined;
      if (o.text !== undefined && !str(o.text)) return undefined;
      if (!Array.isArray(o.points)) return undefined;
      const points: [number, number][] = [];
      for (const p of o.points) {
        if (!Array.isArray(p) || p.length !== 2 || !frac(p[0]) || !frac(p[1])) return undefined;
        points.push([p[0], p[1]]);
      }
      const m: Shape = { t: "shape", id: o.id, kind: o.kind, points, color: o.color };
      if (o.text !== undefined) m.text = o.text;
      return m;
    }
    case "clear":
      return { t: "clear" };
    case "resume":
      return { t: "resume" };
    case "ack":
      return id(o.frameId) && typeof o.ok === "boolean" ? { t: "ack", frameId: o.frameId, ok: o.ok } : undefined;
    case "resumed":
      return { t: "resumed" };
    default:
      return undefined;
  }
}
