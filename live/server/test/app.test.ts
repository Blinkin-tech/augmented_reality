import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer } from "../src/index";
import { loadConfig } from "../src/config";

let base = ""; let handle: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  handle = await startServer(loadConfig({ PORT: "0", TURN_URL: "turn:t", TURN_USER: "u", TURN_PASS: "p" }));
  const addr = handle.server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => handle.close());

describe("sessions api", () => {
  it("creates and reads a session, case-insensitive", async () => {
    const r = await fetch(`${base}/api/sessions`, { method: "POST" });
    expect(r.status).toBe(201);
    const { code, customerUrl } = await r.json();
    expect(customerUrl).toBe(`${base}/s/${code}`);
    const g = await fetch(`${base}/api/sessions/${code.toLowerCase()}`);
    expect((await g.json()).state).toBe("waiting");
  });
  it("404s on unknown code and ends a session", async () => {
    expect((await fetch(`${base}/api/sessions/ZZZZZZ`)).status).toBe(404);
    const { code } = await (await fetch(`${base}/api/sessions`, { method: "POST" })).json();
    expect((await fetch(`${base}/api/sessions/${code}/end`, { method: "POST" })).status).toBe(200);
    expect((await (await fetch(`${base}/api/sessions/${code}`)).json()).state).toBe("ended");
  });
  it("returns ice servers with turn", async () => {
    const { iceServers } = await (await fetch(`${base}/api/ice`)).json();
    expect(iceServers[0].urls).toBe("stun:stun.l.google.com:19302");
    expect(iceServers[1]).toEqual({ urls: "turn:t", username: "u", credential: "p" });
  });
});
