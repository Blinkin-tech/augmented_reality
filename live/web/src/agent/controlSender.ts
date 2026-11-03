import { decode, encode, type ControlMessage, type Shape } from "../protocol/messages";
import { splitFrame } from "../protocol/chunks";
import type { Transient } from "../overlay/renderer";

export const POINTER_MS = 3000;
export const ARROW_MS = 5000;
const POINTER_COLOR = "#ffcc00";

export interface ControlChannel {
  send(d: string | ArrayBuffer): void;
  bufferedAmount: number;
  readyState?: string;
}

/** Sends agent control messages and keeps the agent's local copy of what the customer sees. */
export class ControlSender {
  lastAck: { frameId: string; ok: boolean } | undefined;
  resumedAt: number | undefined;
  private shapes: Shape[] = [];
  private transients: Transient[] = [];
  private now: () => number;
  private seq = 0;

  private onAck?: (ack: { frameId: string; ok: boolean }) => void;

  constructor(private ch: ControlChannel, opts: { now?: () => number; onAck?: (ack: { frameId: string; ok: boolean }) => void } = {}) {
    this.now = opts.now ?? Date.now;
    this.onAck = opts.onAck;
  }

  isOpen(): boolean { return this.open; }

  private get open(): boolean { return this.ch.readyState === undefined || this.ch.readyState === "open"; }

  private send(m: ControlMessage): void { if (this.open) this.ch.send(encode(m)); }

  pointer(x: number, y: number): void {
    this.send({ t: "pointer", x, y });
    this.transients = [...this.live(), { kind: "pointer", until: this.now() + POINTER_MS, pts: [[x, y]], color: POINTER_COLOR }];
  }

  arrow(x1: number, y1: number, x2: number, y2: number, color: string): void {
    this.send({ t: "arrow", x1, y1, x2, y2, color });
    this.transients = [...this.live(), { kind: "arrow", until: this.now() + ARROW_MS, pts: [[x1, y1], [x2, y2]], color }];
  }

  shape(s: Shape): void {
    this.send(s);
    this.shapes = [...this.shapes, s];
  }

  clear(): void {
    this.send({ t: "clear" });
    this.shapes = [];
  }

  resume(): void { this.send({ t: "resume" }); this.shapes = []; }

  freeze(jpeg: Uint8Array, w: number, h: number): string | undefined {
    const frameId = `f${this.now()}-${++this.seq}`;
    if (!this.open) return undefined;
    const chunks = splitFrame(jpeg);
    this.send({ t: "freeze-start", frameId, bytes: jpeg.length, chunks: chunks.length, w, h });
    for (const c of chunks) this.ch.send(c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer);
    this.send({ t: "freeze-end", frameId });
    return frameId;
  }

  onMessage(raw: string): void {
    const m = decode(raw);
    if (m?.t === "ack") { this.lastAck = { frameId: m.frameId, ok: m.ok }; this.onAck?.(this.lastAck); }
    else if (m?.t === "resumed") { this.resumedAt = this.now(); this.shapes = []; }
  }

  local(): { shapes: Shape[]; transients: Transient[] } {
    return { shapes: this.shapes, transients: this.live() };
  }

  private live(): Transient[] {
    const now = this.now();
    return this.transients.filter((t) => t.until > now);
  }
}
