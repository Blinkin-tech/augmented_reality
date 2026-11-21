import { describe, it, expect, vi } from "vitest";
import { ControlReceiver } from "../src/customer/controlReceiver";
import { encode } from "../src/protocol/messages";
import { splitFrame } from "../src/protocol/chunks";

const mk = () => { const send = vi.fn(); let t = 1000; const r = new ControlReceiver({ send, now: () => t, decodeImage: async () => ({} as any) }); return { r, send, tick: (ms: number) => (t += ms) }; };

describe("ControlReceiver", () => {
  it("keeps pointer for 3s and arrow for 5s", async () => {
    const { r } = mk();
    await r.onMessage(encode({ t: "pointer", x: 0.1, y: 0.2 })); await r.onMessage(encode({ t: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, color: "#fff" }));
    expect(r.state().transients.map((x) => x.until)).toEqual([4000, 6000]);
  });
  it("assembles a frozen frame, acks, draws shapes, resumes", async () => {
    const { r, send } = mk(); const bytes = new Uint8Array(40000);
    const parts = splitFrame(bytes);
    await r.onMessage(encode({ t: "freeze-start", frameId: "f", bytes: bytes.length, chunks: parts.length, w: 640, h: 480 }));
    for (const p of parts) await r.onMessage(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
    await r.onMessage(encode({ t: "freeze-end", frameId: "f" }));
    expect(send).toHaveBeenCalledWith({ t: "ack", frameId: "f", ok: true }); expect(r.state().frozen?.w).toBe(640);
    await r.onMessage(encode({ t: "shape", id: "s", kind: "rect", points: [[0, 0], [0.5, 0.5]], color: "#0f0" })); expect(r.state().shapes).toHaveLength(1);
    await r.onMessage(encode({ t: "clear" })); expect(r.state().shapes).toHaveLength(0);
    await r.onMessage(encode({ t: "resume" })); expect(r.state().frozen).toBeNull(); expect(send).toHaveBeenLastCalledWith({ t: "resumed" });
  });
  it("nacks a byte mismatch and stays live", async () => {
    const { r, send } = mk();
    await r.onMessage(encode({ t: "freeze-start", frameId: "g", bytes: 999, chunks: 1, w: 1, h: 1 }));
    await r.onMessage(splitFrame(new Uint8Array(10))[0].buffer);
    await r.onMessage(encode({ t: "freeze-end", frameId: "g" }));
    expect(send).toHaveBeenCalledWith({ t: "ack", frameId: "g", ok: false }); expect(r.state().frozen).toBeNull();
  });
});
