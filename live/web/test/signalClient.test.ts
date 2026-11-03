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
});
