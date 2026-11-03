import { describe, it, expect } from "vitest";
import { nextAction } from "../src/customer/useCustomerSession";

describe("nextAction", () => {
  it("peer-joined always connects", () => {
    expect(nextAction("peer-joined", { connected: true })).toBe("connect");
    expect(nextAction("peer-joined", { connected: false })).toBe("connect");
  });
  it("peer-left disconnects", () => expect(nextAction("peer-left", { connected: true })).toBe("disconnect"));
  it("ws-open does nothing", () => expect(nextAction("ws-open", { connected: false })).toBe("none"));
  it("joined-peer connects, joined-alone does nothing", () => {
    expect(nextAction("joined-peer", { connected: false })).toBe("connect");
    expect(nextAction("joined-alone", { connected: false })).toBe("none");
  });
});
