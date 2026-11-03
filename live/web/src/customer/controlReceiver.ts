import { decode, type ControlMessage, type Shape } from "../protocol/messages";
import { FrameAssembler } from "../protocol/chunks";
import type { Transient } from "../overlay/renderer";

type Frozen = { frameId: string; w: number; h: number; image: unknown };
type Pending = { frameId: string; w: number; h: number; asm: FrameAssembler };

export interface ControlReceiverOptions {
  send(m: ControlMessage): void;
  now?: () => number;
  decodeImage?: (bytes: Uint8Array) => Promise<ImageBitmap | HTMLImageElement>;
  onChange?: () => void;
}

const POINTER_MS = 3000;
const ARROW_MS = 5000;
const defaultDecode = (bytes: Uint8Array) => createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }));

/** Applies agent control messages on the customer side. Pure logic, no DOM. */
export class ControlReceiver {
  private frozen: Frozen | null = null;
  private shapes: Shape[] = [];
  private transients: Transient[] = [];
  private pending: Pending | null = null;
  private now: () => number;
  private decodeImage: (bytes: Uint8Array) => Promise<ImageBitmap | HTMLImageElement>;

  constructor(private o: ControlReceiverOptions) {
    this.now = o.now ?? Date.now;
    this.decodeImage = o.decodeImage ?? defaultDecode;
  }

  state() {
    const now = this.now();
    this.transients = this.transients.filter((t) => t.until > now);
    return { frozen: this.frozen, shapes: this.shapes, transients: this.transients };
  }

  async onMessage(data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== "string") {
      this.pending?.asm.add(data);
      return;
    }
    const m = decode(data);
    if (!m) return;
    switch (m.t) {
      case "pointer":
        this.transients = [...this.transients, { kind: "pointer", until: this.now() + POINTER_MS, pts: [[m.x, m.y]], color: "#ffcc00" }];
        break;
      case "arrow":
        this.transients = [...this.transients, { kind: "arrow", until: this.now() + ARROW_MS, pts: [[m.x1, m.y1], [m.x2, m.y2]], color: m.color }];
        break;
      case "freeze-start":
        this.pending = { frameId: m.frameId, w: m.w, h: m.h, asm: new FrameAssembler(m.bytes, m.chunks) };
        return;
      case "freeze-end":
        await this.finishFreeze(m.frameId);
        break;
      case "shape":
        this.shapes = [...this.shapes, m];
        break;
      case "clear":
        this.shapes = [];
        break;
      case "resume":
        this.frozen = null;
        this.shapes = [];
        this.pending = null;
        this.o.send({ t: "resumed" });
        break;
      default:
        return;
    }
    this.o.onChange?.();
  }

  private async finishFreeze(frameId: string): Promise<void> {
    const p = this.pending;
    this.pending = null;
    if (!p || p.frameId !== frameId) return this.o.send({ t: "ack", frameId, ok: false });
    const bytes = p.asm.done() ? p.asm.result() : undefined;
    try {
      if (!bytes) throw new Error("incomplete frame");
      const image = await this.decodeImage(bytes);
      this.frozen = { frameId, w: p.w, h: p.h, image };
      this.o.send({ t: "ack", frameId, ok: true });
    } catch {
      this.o.send({ t: "ack", frameId, ok: false });
    }
  }
}
