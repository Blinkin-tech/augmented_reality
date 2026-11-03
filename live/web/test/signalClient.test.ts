import { describe, it, expect, vi } from "vitest";
import { SignalClient } from "../src/rtc/signalClient";

class FakeWS { static instances: FakeWS[] = []; onopen?: () => void; onclose?: (e: { code: number; reason: string }) => void; onmessage?: (e: { data: string }) => void; sent: string[] = [];
  constructor(public url: string) { FakeWS.instances.push(this); } send(d: string) { this.sent.push(d); } close() {} }

describe("SignalClient", () => {
  it("dispatches joined and signals, reconnects on drop, stops on 4409", () => {
    const h = { onJoined: vi.fn(), onPeerJoined: vi.fn(), onPeerLeft: vi.fn(), onSignal: vi.fn(), onEnded: vi.fn(), onStatus: vi.fn() };
    const timeouts: Array<[() => void, number]> = [];
    const c = new SignalClient("ws://x/ws?code=A&role=agent", h, { WebSocketImpl: FakeWS as any, now: () => 0, setTimeoutImpl: ((fn: () => void, ms: number) => { timeouts.push([fn, ms]); return 0; }) as any });
    const ws = FakeWS.instances[0]; ws.onopen!(); expect(h.onStatus).toHaveBeenCalledWith("open");
    ws.onmessage!({ data: JSON.stringify({ type: "joined", role: "agent", peerPresent: false, iceServers: [] }) }); expect(h.onJoined).toHaveBeenCalled();
    ws.onmessage!({ data: JSON.stringify({ type: "offer", sdp: "o" }) }); expect(h.onSignal).toHaveBeenCalledWith({ type: "offer", sdp: "o" });
    ws.onclose!({ code: 1006, reason: "" }); expect(h.onStatus).toHaveBeenCalledWith("reconnecting"); expect(timeouts[0][1]).toBe(1000);
    timeouts[0][0](); expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1].onclose!({ code: 4409, reason: "role taken" }); expect(h.onStatus).toHaveBeenLastCalledWith("lost"); expect(timeouts).toHaveLength(1);
    c.close();
  });

  function setup(extra: object = {}) {
    FakeWS.instances.length = 0;
    const h: any = { onJoined: vi.fn(), onPeerJoined: vi.fn(), onPeerLeft: vi.fn(), onSignal: vi.fn(), onEnded: vi.fn(), onStatus: vi.fn(), ...extra };
    const timeouts: Array<[() => void, number]> = [];
    const clearTimeoutImpl = vi.fn();
    const c = new SignalClient("ws://x", h, { WebSocketImpl: FakeWS as any, now: () => 0, clearTimeoutImpl: clearTimeoutImpl as any, setTimeoutImpl: ((fn: () => void, ms: number) => { timeouts.push([fn, ms]); return 42; }) as any });
    return { h, c, timeouts, clearTimeoutImpl };
  }

  it("dispatches error to onError and tolerates its absence", () => {
    const onError = vi.fn();
    const a = setup({ onError });
    FakeWS.instances[0].onmessage!({ data: JSON.stringify({ type: "error", message: "bad" }) });
    expect(onError).toHaveBeenCalledWith("bad");
    const b = setup();
    expect(() => FakeWS.instances[0].onmessage!({ data: JSON.stringify({ type: "error", message: "bad" }) })).not.toThrow();
    a.c.close(); b.c.close();
  });

  it("close() clears a pending reconnect timer", () => {
    const { c, timeouts, clearTimeoutImpl } = setup();
    FakeWS.instances[0].onclose!({ code: 1006, reason: "" });
    c.close();
    expect(clearTimeoutImpl).toHaveBeenCalledWith(42);
    timeouts[0][0]();
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("ignores a late close from a replaced socket", () => {
    const { c, timeouts } = setup();
    const first = FakeWS.instances[0];
    first.onclose!({ code: 1006, reason: "" });
    timeouts[0][0]();
    expect(FakeWS.instances).toHaveLength(2);
    first.onclose!({ code: 1006, reason: "" });
    expect(timeouts).toHaveLength(1);
    c.close();
  });
});
