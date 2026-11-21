import { describe, it, expect } from "vitest";
import { partRect, shouldRefreeze } from "../src/agent/useGallery";

describe("shouldRefreeze", () => {
  it("refreezes when not frozen", () => expect(shouldRefreeze(false, undefined, "a")).toBe(true));
  it("refreezes when frozen on another snapshot", () => expect(shouldRefreeze(true, "b", "a")).toBe(true));
  it("refreezes when frozen on a live frame", () => expect(shouldRefreeze(true, undefined, "a")).toBe(true));
  it("keeps the freeze when frozen on the same snapshot", () => expect(shouldRefreeze(true, "a", "a")).toBe(false));
});

describe("partRect", () => {
  it("keeps a box inside the frame unchanged", () => expect(partRect([0.25, 0.25, 0.25, 0.5])).toEqual([[0.25, 0.25], [0.5, 0.75]]));
  it("clamps the far corner to 1", () => expect(partRect([0.8, 0.9, 0.5, 0.3])).toEqual([[0.8, 0.9], [1, 1]]));
});
