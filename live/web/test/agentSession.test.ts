import { describe, it, expect } from "vitest";
import { nextAction, shownStatus } from "../src/agent/useAgentSession";

describe("agent nextAction", () => {
  it("connects on peer-joined even with a peer", () => {
    expect(nextAction("peer-joined", { hasPeer: false })).toBe("connect");
    expect(nextAction("peer-joined", { hasPeer: true })).toBe("connect");
  });
  it("disconnects on peer-left", () => expect(nextAction("peer-left", { hasPeer: true })).toBe("disconnect"));
  it("builds a fresh peer for every offer, with or without an existing peer", () => {
    expect(nextAction("offer", { hasPeer: false })).toBe("connect");
    expect(nextAction("offer", { hasPeer: true })).toBe("connect");
  });
  it("does nothing on joined", () => expect(nextAction("joined", { hasPeer: false })).toBe("none"));
});

describe("agent shownStatus", () => {
  it("shows connecting while the peer is connected but the channel is not open", () => expect(shownStatus("live", false)).toBe("connecting"));
  it("shows live once the channel is open", () => expect(shownStatus("live", true)).toBe("live"));
  it("passes other statuses through", () => {
    expect(shownStatus("customer reconnecting", false)).toBe("customer reconnecting");
    expect(shownStatus("sending frame", true)).toBe("sending frame");
  });
});
