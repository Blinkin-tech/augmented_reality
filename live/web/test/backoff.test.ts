import { describe, it, expect } from "vitest";
import { nextDelay, giveUp } from "../src/rtc/backoff";
describe("backoff", () => {
  it("doubles from 1s and caps at 10s", () => { expect([0, 1, 2, 3, 4, 9].map(nextDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]); });
  it("gives up at 60s", () => { expect(giveUp(59999)).toBe(false); expect(giveUp(60000)).toBe(true); });
});
