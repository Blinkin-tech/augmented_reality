import { describe, it, expect } from "vitest";
import { targetSize } from "../src/agent/captureFrame";
describe("targetSize", () => {
  it("caps the long side at 1280 and keeps aspect", () => {
    expect(targetSize(1920, 1080)).toEqual({ w: 1280, h: 720 });
    expect(targetSize(1080, 1920)).toEqual({ w: 720, h: 1280 });
    expect(targetSize(640, 480)).toEqual({ w: 640, h: 480 });
  });
});
