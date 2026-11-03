import { describe, it, expect } from "vitest";
import { SessionStore, generateCode, normalizeCode } from "../src/sessions";

describe("codes", () => {
  it("generates 6 chars from the safe alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
  it("normalizes case and spaces", () => {
    expect(normalizeCode(" ab2c3d ")).toBe("AB2C3D");
  });
});

describe("SessionStore", () => {
  it("creates, gets by any case, ends", () => {
    const s = new SessionStore({ ttlMs: 1000 });
    const created = s.create();
    expect(created.state).toBe("waiting");
    expect(s.get(created.code.toLowerCase())?.code).toBe(created.code);
    expect(s.end(created.code)).toBe(true);
    expect(s.get(created.code)?.state).toBe("ended");
    expect(s.end("NOPE22")).toBe(false);
  });
  it("expires sessions older than ttl and closes sockets", () => {
    let t = 0;
    const s = new SessionStore({ ttlMs: 1000, now: () => t });
    const a = s.create();
    const closed: unknown[] = [];
    a.agentSocket = { close: (c: number, r: string) => closed.push([c, r]) } as never;
    t = 999; expect(s.expire()).toEqual([]);
    t = 1000; expect(s.expire()).toEqual([a.code]);
    expect(closed).toEqual([[4000, "session ended"]]);
    expect(s.expire()).toEqual([]);
  });
});
