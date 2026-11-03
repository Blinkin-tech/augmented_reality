import { describe, it, expect } from "vitest";
import { nextAction } from "../src/agent/useAgentSession";

describe("agent nextAction", () => {
  it("connects on peer-joined even with a peer", () => {
    expect(nextAction("peer-joined", { hasPeer: false })).toBe("connect");
    expect(nextAction("peer-joined", { hasPeer: true })).toBe("connect");
  });
  it("disconnects on peer-left", () => expect(nextAction("peer-left", { hasPeer: true })).toBe("disconnect"));
  it("builds a peer for an offer when none exists, then signals", () => expect(nextAction("offer", { hasPeer: false })).toBe("connect"));
  it("only signals an offer when a peer exists", () => expect(nextAction("offer", { hasPeer: true })).toBe("none"));
  it("does nothing on joined", () => expect(nextAction("joined", { hasPeer: false })).toBe("none"));
});
