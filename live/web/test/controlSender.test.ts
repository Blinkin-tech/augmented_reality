import { describe, it, expect } from "vitest";
import { ControlSender } from "../src/agent/controlSender";
import { decode } from "../src/protocol/messages";

describe("ControlSender", () => {
  it("sends pointer and arrow and keeps local transients", () => {
    const sent: unknown[] = []; const s = new ControlSender({ send: (d) => sent.push(d), bufferedAmount: 0 }, { now: () => 0 });
    s.pointer(0.5, 0.5); s.arrow(0, 0, 1, 1, "#fff");
    expect(sent.map((x) => decode(x as string)?.t)).toEqual(["pointer", "arrow"]);
    expect(s.local().transients.map((t) => t.until)).toEqual([3000, 5000]);
  });
  it("sends freeze-start, chunks, freeze-end and records the ack", () => {
    const sent: unknown[] = []; const s = new ControlSender({ send: (d) => sent.push(d), bufferedAmount: 0 });
    const id = s.freeze(new Uint8Array(20000), 640, 480);
    expect(decode(sent[0] as string)).toMatchObject({ t: "freeze-start", frameId: id, bytes: 20000, chunks: 2, w: 640, h: 480 });
    expect(sent[1]).toBeInstanceOf(ArrayBuffer); expect(sent[2]).toBeInstanceOf(ArrayBuffer);
    expect(decode(sent[3] as string)).toEqual({ t: "freeze-end", frameId: id });
    s.onMessage(JSON.stringify({ t: "ack", frameId: id, ok: false })); expect(s.lastAck).toEqual({ frameId: id, ok: false });
  });
  it("sends nothing on a channel that is not open", () => {
    const sent: unknown[] = []; const s = new ControlSender({ send: (d) => sent.push(d), bufferedAmount: 0, readyState: "closed" });
    s.pointer(0.5, 0.5); s.clear(); s.freeze(new Uint8Array(10), 1, 1);
    expect(sent).toEqual([]);
  });
});
