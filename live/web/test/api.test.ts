import { describe, it, expect } from "vitest";
import { analyzeSnapshot, uploadSnapshot, getSession } from "../src/api";

const fakeFetch = (status: number, body: unknown, capture: any[]) => (async (url: string, init?: RequestInit) => { capture.push([url, init]); return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }) as typeof fetch;

describe("api", () => {
  it("uploads jpeg bytes with the right content type", async () => {
    const calls: any[] = [];
    await uploadSnapshot("ABC234", new Uint8Array([1]), fakeFetch(201, { id: "x", url: "/u", takenAt: 1 }, calls));
    expect(calls[0][0]).toBe("/api/sessions/ABC234/snapshots"); expect(calls[0][1].headers["content-type"]).toBe("image/jpeg");
  });
  it("throws the server error on analyze failure", async () => {
    await expect(analyzeSnapshot("ABC234", "x", fakeFetch(502, { error: "boom" }, []))).rejects.toThrow("boom");
  });
  it("returns undefined for a missing session", async () => {
    expect(await getSession("ABC234", fakeFetch(404, { error: "nope" }, []))).toBeUndefined();
  });
});
