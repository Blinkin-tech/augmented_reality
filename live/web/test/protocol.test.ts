import { describe, it, expect } from "vitest";
import { encode, decode } from "../src/protocol/messages";
import { splitFrame, FrameAssembler, CHUNK_SIZE } from "../src/protocol/chunks";

describe("messages", () => {
  it("round-trips every message", () => {
    const all = [
      { t: "pointer", x: 0.5, y: 0.25 }, { t: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, color: "#ff0" },
      { t: "freeze-start", frameId: "f1", bytes: 10, chunks: 1, w: 1280, h: 720 }, { t: "freeze-end", frameId: "f1" },
      { t: "shape", id: "s1", kind: "rect", points: [[0.1, 0.1], [0.4, 0.3]], color: "#0f0" }, { t: "shape", id: "s2", kind: "text", points: [[0.2, 0.2]], color: "#fff", text: "WAN" },
      { t: "clear" }, { t: "resume" }, { t: "ack", frameId: "f1", ok: true }, { t: "resumed" },
    ] as const;
    for (const m of all) expect(decode(encode(m as any))).toEqual(m);
  });
  it("rejects bad input", () => {
    expect(decode("nope")).toBeUndefined();
    expect(decode(JSON.stringify({ t: "pointer", x: 1.5, y: 0 }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "shape", id: "x", kind: "circle", points: [], color: "#000" }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "wat" }))).toBeUndefined();
  });
  it("rejects malformed fields", () => {
    expect(decode(JSON.stringify({ t: "pointer", x: 0.5 }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "freeze-start", frameId: "f", bytes: -1, chunks: 1, w: 1, h: 1 }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "freeze-end", frameId: "" }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "shape", id: "a", kind: "path", points: [[0.1, 2]], color: "#000" }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "shape", id: "a", kind: "text", points: [[0.1, 0.2]], color: "#000", text: 5 }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "ack", frameId: "f", ok: "yes" }))).toBeUndefined();
    expect(decode("null")).toBeUndefined();
  });
});

describe("chunks", () => {
  it("splits and reassembles with index headers", () => {
    const data = new Uint8Array(CHUNK_SIZE * 2 + 5).map((_, i) => i % 251);
    const parts = splitFrame(data);
    expect(parts).toHaveLength(3); expect(parts[0].length).toBe(CHUNK_SIZE);
    expect(new DataView(parts[2].buffer, parts[2].byteOffset).getUint32(0)).toBe(2);
    const a = new FrameAssembler(data.length, 3);
    for (const p of [parts[2], parts[0], parts[1]]) a.add(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
    expect(a.done()).toBe(true); expect(a.result()).toEqual(data);
  });
  it("reports a byte count mismatch", () => {
    const a = new FrameAssembler(100, 1);
    a.add(splitFrame(new Uint8Array(50))[0].buffer);
    expect(a.done()).toBe(true); expect(a.result()).toBeUndefined();
  });
  it("ignores out-of-range indexes and still completes", () => {
    const data = new Uint8Array(CHUNK_SIZE).map((_, i) => i % 251);
    const parts = splitFrame(data);
    expect(parts).toHaveLength(2);
    const a = new FrameAssembler(data.length, 2);
    const bad = parts[0].slice(); new DataView(bad.buffer).setUint32(0, 5);
    a.add(bad.buffer);
    a.add(parts[0].slice().buffer);
    expect(a.done()).toBe(false);
    expect(a.result()).toBeUndefined();
    a.add(parts[1].slice().buffer);
    expect(a.done()).toBe(true);
    expect(a.result()).toEqual(data);
  });
  it("returns undefined for an absurd expectedBytes without throwing", () => {
    const a = new FrameAssembler(1e12, 1);
    a.add(splitFrame(new Uint8Array(10))[0].buffer);
    expect(a.done()).toBe(true);
    expect(() => a.result()).not.toThrow();
    expect(a.result()).toBeUndefined();
  });
});
