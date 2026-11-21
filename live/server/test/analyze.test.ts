import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { AddressInfo } from "net";
import { startServer } from "../src/index";
import { loadConfig } from "../src/config";
import { MockVisionProvider } from "../src/vision/mock";
import { createApp } from "../src/app";
import { SessionStore } from "../src/sessions";
import { SnapshotStore } from "../src/snapshots";

let base = "";
let handle: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  handle = await startServer(loadConfig({ PORT: "0", DATA_DIR: mkdtempSync(join(tmpdir(), "an-")) }));
  base = `http://127.0.0.1:${(handle.server.address() as { port: number }).port}`;
});
afterAll(() => handle.close());

describe("analyze", () => {
  it("mock provider returns the fixed result", async () => {
    const r = await new MockVisionProvider().analyze(Buffer.alloc(2), "image/jpeg");
    expect(r.provider).toBe("mock");
    expect(r.parts.map((p) => p.label)).toEqual(["WAN port", "Power LED", "Reset button"]);
  });

  it("route analyzes an uploaded snapshot and 404s otherwise", async () => {
    const { code } = await (await fetch(`${base}/api/sessions`, { method: "POST" })).json();
    const { id } = await (
      await fetch(`${base}/api/sessions/${code}/snapshots`, {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: Buffer.from([1, 2]),
      })
    ).json();
    const ok = await fetch(`${base}/api/sessions/${code}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: id }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).device.model).toBe("Router X1");
    const missing = await fetch(`${base}/api/sessions/${code}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: "00000000" }),
    });
    expect(missing.status).toBe(404);
  });

  it("returns 502 with the message when the provider throws", async () => {
    const store = new SessionStore({ ttlMs: 60_000 });
    const dataDir = mkdtempSync(join(tmpdir(), "an-boom-"));
    const snapshots = new SnapshotStore(dataDir);
    const session = store.create();
    const snap = await snapshots.save(session, Buffer.from([1, 2]));
    const app = createApp({
      store,
      config: loadConfig({ PORT: "0", DATA_DIR: dataDir }),
      snapshots,
      vision: { name: "boom", analyze: () => Promise.reject(new Error("boom")) },
    });
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.code}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id }),
      });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "boom" });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
