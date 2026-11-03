import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import { join } from "path";
import { startServer } from "../src/index";
import { loadConfig } from "../src/config";

let base = ""; let handle: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  handle = await startServer(loadConfig({ PORT: "0", DATA_DIR: mkdtempSync(join(tmpdir(), "snap-")) }));
  base = `http://127.0.0.1:${(handle.server.address() as { port: number }).port}`;
});
afterAll(() => handle.close());

describe("snapshots", () => {
  it("uploads, lists, serves", async () => {
    const { code } = await (await fetch(`${base}/api/sessions`, { method: "POST" })).json();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const up = await fetch(`${base}/api/sessions/${code}/snapshots`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: jpeg });
    expect(up.status).toBe(201);
    const { id, url } = await up.json();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    const list = await (await fetch(`${base}/api/sessions/${code}/snapshots`)).json();
    expect(list).toHaveLength(1); expect(list[0].url).toBe(url);
    const got = await fetch(`${base}${url}`);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await got.arrayBuffer())).toEqual(jpeg);
  });
  it("rejects wrong type, too large, unknown id", async () => {
    const { code } = await (await fetch(`${base}/api/sessions`, { method: "POST" })).json();
    expect((await fetch(`${base}/api/sessions/${code}/snapshots`, { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.alloc(4) })).status).toBe(415);
    expect((await fetch(`${base}/api/sessions/${code}/snapshots`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: Buffer.alloc(5 * 1024 * 1024 + 1) })).status).toBe(413);
    expect((await fetch(`${base}/api/sessions/${code}/snapshots/deadbeef`)).status).toBe(404);
  });
});
