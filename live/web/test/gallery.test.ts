import { describe, it, expect } from "vitest";
import { shouldRefreeze } from "../src/agent/useGallery";

describe("shouldRefreeze", () => {
  it("refreezes when not frozen", () => expect(shouldRefreeze(false, undefined, "a")).toBe(true));
  it("refreezes when frozen on another snapshot", () => expect(shouldRefreeze(true, "b", "a")).toBe(true));
  it("refreezes when frozen on a live frame", () => expect(shouldRefreeze(true, undefined, "a")).toBe(true));
  it("keeps the freeze when frozen on the same snapshot", () => expect(shouldRefreeze(true, "a", "a")).toBe(false));
});
