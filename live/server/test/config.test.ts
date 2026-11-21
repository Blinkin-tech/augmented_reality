import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const c = loadConfig({});
    expect(c.port).toBe(3000);
    expect(c.dataDir.endsWith("data")).toBe(true);
    expect(c.turn).toBeUndefined();
    expect(c.anthropicApiKey).toBeUndefined();
  });
  it("reads TURN only when all three variables are set", () => {
    expect(loadConfig({ TURN_URL: "turn:x" }).turn).toBeUndefined();
    const c = loadConfig({ TURN_URL: "turn:x", TURN_USER: "u", TURN_PASS: "p", PORT: "4000" });
    expect(c.turn).toEqual({ url: "turn:x", username: "u", credential: "p" });
    expect(c.port).toBe(4000);
  });
  it("parses PORT 0 as 0", () => {
    expect(loadConfig({ PORT: "0" }).port).toBe(0);
    expect(loadConfig({ PORT: "" }).port).toBe(3000);
  });
});
