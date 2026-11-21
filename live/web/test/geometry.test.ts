import { describe, it, expect } from "vitest";
import { contentRect, toFrac, toPx } from "../src/overlay/geometry";

describe("geometry", () => {
  it("letterboxes a portrait frame in a landscape element", () => {
    const fit = contentRect(1000, 500, 720, 1280);
    expect(fit).toEqual({ x: 359.375, y: 0, w: 281.25, h: 500 });
  });
  it("letterboxes a landscape frame in a portrait element", () => {
    const fit = contentRect(400, 800, 1280, 720);
    expect(fit).toEqual({ x: 0, y: 287.5, w: 400, h: 225 });
  });
  it("maps pixels to fractions and back, and rejects the bars", () => {
    const fit = contentRect(1000, 500, 720, 1280);
    expect(toFrac(500, 250, fit)?.map((v) => +v.toFixed(3))).toEqual([0.5, 0.5]);
    expect(toFrac(10, 10, fit)).toBeUndefined();
    expect(toPx(0.5, 0.5, fit)).toEqual([500, 250]);
  });
});
