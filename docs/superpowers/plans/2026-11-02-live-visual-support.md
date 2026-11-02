# Live Visual Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser demo where a customer streams a phone camera to an agent, and the agent draws guidance that the customer sees on the phone.

**Architecture:** One Node server serves the web app, relays WebRTC signaling over a WebSocket, and stores snapshots on disk. Video and audio go peer-to-peer. Guidance messages go over a WebRTC data channel. An "analyze" endpoint calls a vision provider behind one interface.

**Tech Stack:** Node 22, TypeScript, Express 4, ws, Vite 5, React 18, qrcode.react, Vitest, Playwright, @anthropic-ai/sdk, zod.

**Spec:** `docs/superpowers/specs/2026-11-02-live-visual-support-design.md`

## Global Constraints

- All new code lives under `live/`. The old C++ folders are not touched.
- Session code: 6 characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- Snapshot id: 8 random hex characters.
- Coordinates in guidance messages are fractions from 0 to 1.
- Data channel name: `control`. Binary chunk size: 16384 bytes max, first 4 bytes are the chunk index as an unsigned 32-bit big-endian integer.
- Frozen frame JPEG: long side at most 1280 pixels, quality 0.7.
- Snapshot upload limit: 5 MB, response 413 above it.
- Session expiry: 60 minutes after creation.
- WebSocket close code for a taken role: 4409, reason `role taken`.
- Reconnect backoff: 1 s doubling to 10 s, give up after 60 s total.
- ICE hint after 20 s without a connected state.
- Pointer fades after 3 s. Arrow fades after 5 s.
- Vision model: `claude-opus-5-5` through `@anthropic-ai/sdk`, selected only when `ANTHROPIC_API_KEY` is set.
- Environment variables: `PORT` (3000), `PUBLIC_URL`, `TURN_URL`, `TURN_USER`, `TURN_PASS`, `ANTHROPIC_API_KEY`, `DATA_DIR` (`live/data`).
- The pre-installed Chromium is at `/opt/pw-browsers/chromium`. Do not run `playwright install`.

## Review Focus

1. A customer who opens the link twice, for example after a phone reload, must get the slot back. The old socket is dead but not yet closed. The server must treat a dead customer socket as free after the close event, and the reconnect test in Task 5 pins this.
2. A session code typed in lower case must still open the session. Task 3 pins case-insensitive lookup.
3. A frozen frame on a portrait phone shown on a landscape desktop must place shapes on the same pixels of the picture. Task 9 pins letterbox math in both directions.
4. An agent click outside the picture area but inside the letterbox bars must not send a pointer. Task 9 pins the out-of-bounds result.
5. A snapshot upload with a wrong content type must be rejected, not stored as a corrupt file. Task 4 pins the 415 response.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `live/package.json`, `live/.gitignore`, `live/tsconfig.base.json`
- Create: `live/server/package.json`, `live/server/tsconfig.json`, `live/server/vitest.config.ts`, `live/server/src/config.ts`, `live/server/test/config.test.ts`
- Create: `live/web/package.json`, `live/web/tsconfig.json`, `live/web/vite.config.ts`, `live/web/vitest.config.ts`, `live/web/index.html`, `live/web/src/main.tsx`, `live/web/src/App.tsx`, `live/web/test/smoke.test.ts`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): Config` in `live/server/src/config.ts` with `Config = { port: number; publicUrl?: string; dataDir: string; turn?: { url: string; username: string; credential: string }; anthropicApiKey?: string }`.
- Produces: npm scripts at `live/`: `dev`, `build`, `start`, `test`, `test:e2e`.

- [ ] **Step 1: Write the failing config test**

```ts
// live/server/test/config.test.ts
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
});
```

- [ ] **Step 2: Create the workspace files**

`live/package.json`: `"private": true`, `"workspaces": ["server", "web"]`, scripts: `dev` = `concurrently -k "npm:dev -w server" "npm:dev -w web"`, `build` = `npm run build -w web && npm run build -w server`, `start` = `npm start -w server`, `test` = `npm test -w server && npm test -w web`, `test:e2e` = `npm run test:e2e -w web`. Dev dependency: `concurrently`.

`live/server/package.json`: dependencies `express@4`, `ws@8`, `@anthropic-ai/sdk`, `zod@3`; dev dependencies `typescript@5`, `tsx`, `vitest@4`, `@types/express@4`, `@types/ws@8`, `@types/node@22`. Scripts: `dev` = `tsx watch src/index.ts`, `build` = `tsc -p .`, `start` = `node dist/index.js`, `test` = `vitest run`.

`live/web/package.json`: dependencies `react@18`, `react-dom@18`, `react-router-dom@6`, `qrcode.react@4`; dev dependencies `vite@5`, `@vitejs/plugin-react`, `typescript@5`, `vitest@4`, `jsdom`, `@playwright/test@1.63.0`, `@types/react@18`, `@types/react-dom@18`. Scripts: `dev` = `vite --host`, `build` = `tsc -p . && vite build`, `test` = `vitest run`, `test:e2e` = `playwright test`.

`live/web/vite.config.ts`: React plugin, `server.port` 5173, `server.proxy` with `/api` to `http://localhost:3000` and `/ws` to `ws://localhost:3000` with `ws: true`.

`live/.gitignore`: `node_modules`, `dist`, `data`, `test-results`, `playwright-report`.

`live/web/vitest.config.ts`: `test.environment` = `jsdom`, `test.include` = `test/**/*.test.ts`, so the Playwright files under `e2e/` are not picked up.

`live/web/src/App.tsx`: a router with route `/agent` and `/s/:code` that render placeholder text `Agent console` and `Customer`. `live/web/test/smoke.test.ts`: one test that asserts `1 + 1 === 2`, to prove the runner works.

- [ ] **Step 3: Install and run the tests**

Run: `cd live && npm install && npm test`
Expected: server config test passes with 2 tests, web smoke test passes with 1 test.

- [ ] **Step 4: Implement `loadConfig` in `live/server/src/config.ts`**

`dataDir` default is `path.resolve(__dirname, "..", "..", "data")`. Return `turn` only when all three TURN variables are non-empty.

- [ ] **Step 5: Run the tests and the build**

Run: `cd live && npm test && npm run build`
Expected: all tests pass, `web/dist/index.html` and `server/dist/index.js` exist.

- [ ] **Step 6: Commit**

```bash
git add live
git commit -m "live: scaffold server and web workspaces"
```

---

### Task 2: Session store

**Files:**
- Create: `live/server/src/sessions.ts`
- Test: `live/server/test/sessions.test.ts`

**Interfaces:**
- Produces: `generateCode(): string`, `normalizeCode(input: string): string` (upper case, trimmed).
- Produces: `class SessionStore { constructor(opts: { ttlMs: number; now?: () => number }); create(): Session; get(code: string): Session | undefined; end(code: string): boolean; expire(): string[]; }` where `Session = { code: string; createdAt: number; state: "waiting" | "live" | "ended"; snapshots: Snapshot[]; agentSocket?: WebSocket; customerSocket?: WebSocket }` and `Snapshot = { id: string; file: string; takenAt: number }`.
- Produces: `end()` and `expire()` set `state` to `ended` and close both sockets with code 4000 and reason `session ended`. `expire()` returns the ended codes.

- [ ] **Step 1: Write the failing tests**

```ts
// live/server/test/sessions.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w server test/sessions.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `live/server/src/sessions.ts`**

Use `crypto.randomInt` for the code. Retry on collision. Store sessions in a `Map<string, Session>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w server test/sessions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add live/server
git commit -m "live: add in-memory session store"
```

---

### Task 3: HTTP server with session and ICE routes

**Files:**
- Create: `live/server/src/app.ts`, `live/server/src/index.ts`, `live/server/src/routes/sessions.ts`, `live/server/src/routes/ice.ts`
- Test: `live/server/test/app.test.ts`

**Interfaces:**
- Consumes: `SessionStore`, `loadConfig`.
- Produces: `createApp(deps: { store: SessionStore; config: Config }): express.Express`.
- Produces: `startServer(config: Config): Promise<{ server: http.Server; store: SessionStore; close(): Promise<void> }>` in `index.ts`. `index.ts` calls `startServer(loadConfig(process.env))` only when run as the main module.
- Produces routes: `POST /api/sessions` returns `{ code, customerUrl }` with status 201. `GET /api/sessions/:code` returns `{ code, state, createdAt }` or 404 `{ error: "not found" }`. `POST /api/sessions/:code/end` returns `{ ok: true }` or 404. `GET /api/ice` returns `{ iceServers }`.
- `customerUrl` = `${origin}/s/${code}` where `origin` is `config.publicUrl` without a trailing slash, or `${req.protocol}://${req.get("host")}`.
- `iceServers` = `[{ urls: "stun:stun.l.google.com:19302" }]` plus `{ urls: config.turn.url, username, credential }` when TURN is set.
- `startServer` runs `store.expire()` every 60 seconds with an unref'd interval.
- In production (`NODE_ENV !== "development"` and `web/dist` exists), the app serves `web/dist` as static files and sends `index.html` for any non-API, non-ws path.

- [ ] **Step 1: Write the failing tests**

```ts
// live/server/test/app.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w server test/app.test.ts`
Expected: FAIL, `startServer` not found.

- [ ] **Step 3: Implement `app.ts`, the two route files, and `index.ts`**

Use `express.json()` only on the API router. Detect the main module with `require.main === module` (CommonJS output) so tests can import `startServer` without starting a server.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w server`
Expected: PASS, all server tests.

- [ ] **Step 5: Commit**

```bash
git add live/server
git commit -m "live: add http server with session and ice routes"
```

---

### Task 4: Snapshot storage and routes

**Files:**
- Create: `live/server/src/snapshots.ts`, `live/server/src/routes/snapshots.ts`
- Modify: `live/server/src/app.ts` (mount the router)
- Test: `live/server/test/snapshots.test.ts`

**Interfaces:**
- Produces: `class SnapshotStore { constructor(dataDir: string); save(session: Session, jpeg: Buffer): Promise<Snapshot>; read(session: Session, id: string): Promise<Buffer | undefined>; list(session: Session): Snapshot[] }`. `save` writes `${dataDir}/${code}/${id}.jpg` and pushes the snapshot onto `session.snapshots`.
- Produces routes: `POST /api/sessions/:code/snapshots` with raw body, `Content-Type: image/jpeg`, limit 5 MB, returns 201 `{ id, url, takenAt }` where `url` = `/api/sessions/${code}/snapshots/${id}`. Wrong content type returns 415 `{ error: "expected image/jpeg" }`. Over the limit returns 413. `GET /api/sessions/:code/snapshots` returns an array of `{ id, url, takenAt }`. `GET /api/sessions/:code/snapshots/:id` returns the bytes with `Content-Type: image/jpeg` or 404.
- `createApp` gains a `snapshots: SnapshotStore` dependency. `startServer` builds it from `config.dataDir`. Tests pass a temp dir through `DATA_DIR`.

- [ ] **Step 1: Write the failing tests**

```ts
// live/server/test/snapshots.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w server test/snapshots.test.ts`
Expected: FAIL, 404 on upload.

- [ ] **Step 3: Implement `snapshots.ts` and the router; mount it in `app.ts`**

Use `express.raw({ type: "image/jpeg", limit: "5mb" })` on the upload route. Check `req.is("image/jpeg")` first and send 415 otherwise. Express sends 413 from the raw parser on its own.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live/server
git commit -m "live: add snapshot storage and routes"
```

---

### Task 5: Signaling relay over WebSocket

**Files:**
- Create: `live/server/src/signaling.ts`, `live/server/src/protocol/signal.ts`
- Modify: `live/server/src/index.ts` (attach the WebSocket server to the HTTP server)
- Test: `live/server/test/signaling.test.ts`

**Interfaces:**
- Produces: `attachSignaling(server: http.Server, deps: { store: SessionStore; iceServers: RTCIceServerLike[] }): WebSocketServer` on path `/ws`.
- Produces: `parseClientSignal(raw: string): ClientSignal | undefined` in `protocol/signal.ts`, where `ClientSignal = { type: "offer"; sdp: string } | { type: "answer"; sdp: string } | { type: "ice"; candidate: unknown }`. Any other shape returns `undefined`.
- Server messages: `{ type: "joined", role, peerPresent, iceServers }`, `{ type: "peer-joined" }`, `{ type: "peer-left" }`, `{ type: "ended" }`, `{ type: "error", message }`.
- Join rules: query `code` and `role` (`agent` | `customer`). Unknown or ended code closes with 4404 `unknown session`. A role whose socket is still open closes the new socket with 4409 `role taken`. On join of the customer, the session state becomes `live` when the agent is present, and the same when the agent joins and the customer is present. On a close, the slot clears and the peer gets `peer-left`. `store.end` and `expire` send `ended` through the close reason only.

- [ ] **Step 1: Write the failing tests**

```ts
// live/server/test/signaling.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startServer } from "../src/index";
import { loadConfig } from "../src/config";

let base = ""; let handle: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { handle = await startServer(loadConfig({ PORT: "0" })); base = `ws://127.0.0.1:${(handle.server.address() as { port: number }).port}`; });
afterAll(() => handle.close());

const open = (code: string, role: string) => new Promise<WebSocket>((res) => { const ws = new WebSocket(`${base}/ws?code=${code}&role=${role}`); ws.once("open", () => res(ws)); });
const next = (ws: WebSocket) => new Promise<any>((res) => ws.once("message", (d) => res(JSON.parse(d.toString()))));
const closed = (ws: WebSocket) => new Promise<[number, string]>((res) => ws.once("close", (c, r) => res([c, r.toString()])));
const newCode = async () => (await (await fetch(base.replace("ws", "http") + "/api/sessions", { method: "POST" })).json()).code as string;

describe("signaling", () => {
  it("joins both roles, relays offer/answer/ice, reports peer-left", async () => {
    const code = await newCode();
    const agent = await open(code, "agent");
    const j1 = await next(agent); expect(j1).toMatchObject({ type: "joined", role: "agent", peerPresent: false }); expect(j1.iceServers[0].urls).toContain("stun:");
    const cust = await open(code, "customer");
    const [j2, pj] = await Promise.all([next(cust), next(agent)]);
    expect(j2).toMatchObject({ type: "joined", role: "customer", peerPresent: true }); expect(pj).toEqual({ type: "peer-joined" });
    expect(handle.store.get(code)?.state).toBe("live");
    cust.send(JSON.stringify({ type: "offer", sdp: "o" })); expect(await next(agent)).toEqual({ type: "offer", sdp: "o" });
    agent.send(JSON.stringify({ type: "answer", sdp: "a" })); expect(await next(cust)).toEqual({ type: "answer", sdp: "a" });
    agent.send(JSON.stringify({ type: "ice", candidate: { c: 1 } })); expect(await next(cust)).toEqual({ type: "ice", candidate: { c: 1 } });
    agent.send("not json"); expect(await next(agent)).toMatchObject({ type: "error" });
    cust.close(); expect(await next(agent)).toEqual({ type: "peer-left" });
    agent.close();
  });
  it("rejects unknown code and taken role, frees the slot after close", async () => {
    const bad = new WebSocket(`${base}/ws?code=ZZZZZZ&role=agent`); expect(await closed(bad)).toEqual([4404, "unknown session"]);
    const code = await newCode();
    const a1 = await open(code, "agent"); await next(a1);
    const a2 = new WebSocket(`${base}/ws?code=${code}&role=agent`); expect(await closed(a2)).toEqual([4409, "role taken"]);
    a1.close(); await closed(a1);
    const a3 = await open(code, "agent"); expect(await next(a3)).toMatchObject({ type: "joined", role: "agent" }); a3.close();
  });
  it("closes sockets when the session ends", async () => {
    const code = await newCode();
    const a = await open(code, "agent"); await next(a);
    await fetch(base.replace("ws", "http") + `/api/sessions/${code}/end`, { method: "POST" });
    expect(await closed(a)).toEqual([4000, "session ended"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w server test/signaling.test.ts`
Expected: FAIL, connection refused on `/ws` or `attachSignaling` not found.

- [ ] **Step 3: Implement `protocol/signal.ts`, `signaling.ts`, and wire it in `startServer`**

Use `new WebSocketServer({ server, path: "/ws" })`. Parse the query with `new URL(req.url, "http://x")`. The `end` route must also close sockets with 4000 `session ended`; move that into `SessionStore.end` so both paths share it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live/server
git commit -m "live: add websocket signaling relay"
```

---

### Task 6: Vision provider interface, mock provider, analyze route

**Files:**
- Create: `live/server/src/vision/provider.ts`, `live/server/src/vision/mock.ts`, `live/server/src/routes/analyze.ts`
- Modify: `live/server/src/app.ts`, `live/server/src/index.ts`
- Test: `live/server/test/analyze.test.ts`

**Interfaces:**
- Produces in `provider.ts`: `interface VisionProvider { name: string; analyze(image: Buffer, mime: "image/jpeg"): Promise<AnalysisResult> }`, `type Part = { label: string; kind: "port" | "button" | "led" | "display" | "other"; box: [number, number, number, number]; confidence: number }`, `type AnalysisResult = { provider: string; device: { brand: string; model: string; confidence: number } | null; parts: Part[]; notes: string }`, and a zod schema `AnalysisResultSchema` for the same shape.
- Produces in `mock.ts`: `class MockVisionProvider implements VisionProvider` with `name = "mock"`. It resolves after 300 ms with device `{ brand: "Demo", model: "Router X1", confidence: 0.9 }` and parts: `WAN port` (`port`, box `[0.62, 0.55, 0.06, 0.08]`), `Power LED` (`led`, box `[0.2, 0.3, 0.03, 0.03]`), `Reset button` (`button`, box `[0.8, 0.56, 0.03, 0.04]`), each with confidence 0.85, and notes `Mock result. Set ANTHROPIC_API_KEY for real analysis.`
- Produces route: `POST /api/sessions/:code/analyze` with body `{ snapshotId }`. 404 when the session or the snapshot is missing. 502 `{ error: message }` when the provider throws. 200 with `AnalysisResult` otherwise.
- `createApp` gains `vision: VisionProvider`. `startServer` picks the provider with `selectProvider(config): VisionProvider` in `provider.ts`, which returns the mock when `anthropicApiKey` is unset. Task 7 extends it.

- [ ] **Step 1: Write the failing tests**

```ts
// live/server/test/analyze.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import { join } from "path";
import { startServer } from "../src/index";
import { loadConfig } from "../src/config";
import { MockVisionProvider } from "../src/vision/mock";

let base = ""; let handle: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { handle = await startServer(loadConfig({ PORT: "0", DATA_DIR: mkdtempSync(join(tmpdir(), "an-")) })); base = `http://127.0.0.1:${(handle.server.address() as { port: number }).port}`; });
afterAll(() => handle.close());

describe("analyze", () => {
  it("mock provider returns the fixed result", async () => {
    const r = await new MockVisionProvider().analyze(Buffer.alloc(2), "image/jpeg");
    expect(r.provider).toBe("mock"); expect(r.parts.map((p) => p.label)).toEqual(["WAN port", "Power LED", "Reset button"]);
  });
  it("route analyzes an uploaded snapshot and 404s otherwise", async () => {
    const { code } = await (await fetch(`${base}/api/sessions`, { method: "POST" })).json();
    const { id } = await (await fetch(`${base}/api/sessions/${code}/snapshots`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: Buffer.from([1, 2]) })).json();
    const ok = await fetch(`${base}/api/sessions/${code}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId: id }) });
    expect(ok.status).toBe(200); expect((await ok.json()).device.model).toBe("Router X1");
    const missing = await fetch(`${base}/api/sessions/${code}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId: "00000000" }) });
    expect(missing.status).toBe(404);
  });
});
```

Add a third test in the same file that builds `createApp` directly with a provider whose `analyze` rejects with `new Error("boom")`, and asserts status 502 and body `{ error: "boom" }`. Use `app.listen(0)` and close it in the test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w server test/analyze.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the provider types, the mock, the route, and `selectProvider`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live/server
git commit -m "live: add vision provider interface, mock provider, analyze route"
```

---

### Task 7: Claude vision provider

**Files:**
- Create: `live/server/src/vision/claude.ts`
- Modify: `live/server/src/vision/provider.ts` (`selectProvider`)
- Test: `live/server/test/claude-provider.test.ts`

**Interfaces:**
- Produces: `class ClaudeVisionProvider implements VisionProvider { constructor(client: Pick<Anthropic["beta"]["messages"], "create"> | Anthropic, model?: string); name = "claude" }`. The constructor accepts a real `Anthropic` client or a minimal object with `beta.messages.create`, so tests inject a fake.
- `analyze` calls `client.beta.messages.create` with: `model: "claude-opus-5-5"`, `max_tokens: 4096`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, `output_config: { format: zodOutputFormat(AnalysisOutputSchema) }`, one user message with an `image` block (`source: { type: "base64", media_type: "image/jpeg", data }`) followed by a `text` block with the instruction. `AnalysisOutputSchema` is the result schema without `provider`. The system prompt: `You identify consumer network and home devices in support photos. Name the brand and model if visible. List ports, buttons, LEDs, and displays with tight bounding boxes as fractions of image width and height. Use null for device when unsure. Keep notes under 200 characters.`
- After the call: if `stop_reason === "refusal"`, throw `Error("analysis refused")`. Otherwise take the first `text` block, `JSON.parse` it, validate with `AnalysisOutputSchema.parse`, and return it with `provider: "claude"`. A parse failure throws `Error("invalid analysis output")`.
- `selectProvider(config)` returns `new ClaudeVisionProvider(new Anthropic({ apiKey: config.anthropicApiKey }))` when the key is set.
- If the installed SDK's TypeScript types reject `fallbacks: "default"`, use the array form `betas: ["server-side-fallback-2026-06-01"]`, `fallbacks: [{ model: "claude-opus-4-8" }]` instead and note it in a comment.

- [ ] **Step 1: Write the failing tests**

```ts
// live/server/test/claude-provider.test.ts
import { describe, it, expect } from "vitest";
import { ClaudeVisionProvider } from "../src/vision/claude";

const fake = (reply: object) => ({ beta: { messages: { create: async (req: any) => { (fake as any).last = req; return reply; } } } });
const good = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ device: { brand: "D-Link", model: "DSL-6850U", confidence: 0.8 }, parts: [{ label: "WAN port", kind: "port", box: [0.1, 0.2, 0.05, 0.05], confidence: 0.7 }], notes: "ok" }) }] };

describe("ClaudeVisionProvider", () => {
  it("sends the image and returns the parsed result", async () => {
    const p = new ClaudeVisionProvider(fake(good) as any);
    const r = await p.analyze(Buffer.from("abc"), "image/jpeg");
    expect(r.provider).toBe("claude"); expect(r.device?.model).toBe("DSL-6850U"); expect(r.parts[0].kind).toBe("port");
    const req = (fake as any).last;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from("abc").toString("base64") } });
  });
  it("throws on refusal and on bad output", async () => {
    await expect(new ClaudeVisionProvider(fake({ stop_reason: "refusal", content: [] }) as any).analyze(Buffer.alloc(1), "image/jpeg")).rejects.toThrow("analysis refused");
    await expect(new ClaudeVisionProvider(fake({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] }) as any).analyze(Buffer.alloc(1), "image/jpeg")).rejects.toThrow("invalid analysis output");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w server test/claude-provider.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `claude.ts` and extend `selectProvider`**

- [ ] **Step 4: Run the tests and the type check**

Run: `cd live && npx vitest run -w server && npm run build -w server`
Expected: PASS and a clean compile.

- [ ] **Step 5: Commit**

```bash
git add live/server
git commit -m "live: add Claude vision provider"
```

---

### Task 8: Guidance protocol module (web)

**Files:**
- Create: `live/web/src/protocol/messages.ts`, `live/web/src/protocol/chunks.ts`
- Test: `live/web/test/protocol.test.ts`

**Interfaces:**
- Produces in `messages.ts`: the union `ControlMessage` with members `{ t: "pointer"; x; y }`, `{ t: "arrow"; x1; y1; x2; y2; color }`, `{ t: "freeze-start"; frameId: string; bytes: number; chunks: number; w: number; h: number }`, `{ t: "freeze-end"; frameId }`, `{ t: "shape"; id: string; kind: "path" | "rect" | "text"; points: [number, number][]; color: string; text?: string }`, `{ t: "clear" }`, `{ t: "resume" }`, `{ t: "ack"; frameId; ok: boolean }`, `{ t: "resumed" }`. Also `type Shape = Extract<ControlMessage, { t: "shape" }>`, used by Tasks 9, 11, 12. Functions `encode(m: ControlMessage): string` and `decode(raw: string): ControlMessage | undefined`. `decode` returns `undefined` for unknown `t`, missing fields, or a coordinate outside 0 to 1.
- Produces in `chunks.ts`: `CHUNK_SIZE = 16384`, `splitFrame(bytes: Uint8Array): Uint8Array[]` (each chunk has a 4-byte big-endian index header and at most `CHUNK_SIZE - 4` payload bytes), and `class FrameAssembler { constructor(expectedBytes: number, expectedChunks: number); add(chunk: ArrayBuffer): void; done(): boolean; result(): Uint8Array | undefined }` where `result()` is `undefined` when the byte count does not match.

- [ ] **Step 1: Write the failing tests**

```ts
// live/web/test/protocol.test.ts
import { describe, it, expect } from "vitest";
import { encode, decode } from "../src/protocol/messages";
import { splitFrame, FrameAssembler, CHUNK_SIZE } from "../src/protocol/chunks";

describe("messages", () => {
  it("round-trips every message", () => {
    const all = [
      { t: "pointer", x: 0.5, y: 0.25 }, { t: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, color: "#ff0" },
      { t: "freeze-start", frameId: "f1", bytes: 10, chunks: 1, w: 1280, h: 720 }, { t: "freeze-end", frameId: "f1" },
      { t: "shape", id: "s1", kind: "rect", points: [[0.1, 0.1], [0.4, 0.3]], color: "#0f0" }, { t: "shape", id: "s2", kind: "text", points: [[0.2, 0.2]], color: "#fff", text: "WAN" },
      { t: "clear" }, { t: "resume" }, { t: "ack", frameId: "f1", ok: true }, { t: "resumed" },
    ] as const;
    for (const m of all) expect(decode(encode(m as any))).toEqual(m);
  });
  it("rejects bad input", () => {
    expect(decode("nope")).toBeUndefined();
    expect(decode(JSON.stringify({ t: "pointer", x: 1.5, y: 0 }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "shape", id: "x", kind: "circle", points: [], color: "#000" }))).toBeUndefined();
    expect(decode(JSON.stringify({ t: "wat" }))).toBeUndefined();
  });
});

describe("chunks", () => {
  it("splits and reassembles with index headers", () => {
    const data = new Uint8Array(CHUNK_SIZE * 2 + 5).map((_, i) => i % 251);
    const parts = splitFrame(data);
    expect(parts).toHaveLength(3); expect(parts[0].length).toBe(CHUNK_SIZE);
    expect(new DataView(parts[2].buffer, parts[2].byteOffset).getUint32(0)).toBe(2);
    const a = new FrameAssembler(data.length, 3);
    for (const p of [parts[2], parts[0], parts[1]]) a.add(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
    expect(a.done()).toBe(true); expect(a.result()).toEqual(data);
  });
  it("reports a byte count mismatch", () => {
    const a = new FrameAssembler(100, 1);
    a.add(splitFrame(new Uint8Array(50))[0].buffer);
    expect(a.done()).toBe(true); expect(a.result()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w web test/protocol.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `messages.ts` and `chunks.ts`**

Write the validator by hand as one `switch` on `t`, with a helper `frac(v): v is number` for the 0 to 1 check.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live/web
git commit -m "live: add guidance protocol and frame chunking"
```

---

### Task 9: Overlay geometry and canvas renderer

**Files:**
- Create: `live/web/src/overlay/geometry.ts`, `live/web/src/overlay/renderer.ts`
- Test: `live/web/test/geometry.test.ts`

**Interfaces:**
- Produces in `geometry.ts`: `type Fit = { x: number; y: number; w: number; h: number }`, `contentRect(elementW: number, elementH: number, frameW: number, frameH: number): Fit` (the letterboxed picture area inside the element, `object-fit: contain`), `toFrac(px: number, py: number, fit: Fit): [number, number] | undefined` (undefined outside the picture), `toPx(fx: number, fy: number, fit: Fit): [number, number]`.
- Produces in `renderer.ts`: `type Transient = { kind: "pointer" | "arrow"; until: number; pts: [number, number][]; color: string }`, `drawOverlay(ctx: CanvasRenderingContext2D, fit: Fit, shapes: Shape[], transients: Transient[], now: number): void` where `Shape` is the `shape` message payload. Pointer: a circle of radius 24 px, 3 px stroke. Arrow: 4 px line with a 14 px head. Rect, path, text use the message color; text is drawn at 20 px bold with a dark backing box. Transients past `until` are skipped.

- [ ] **Step 1: Write the failing tests**

```ts
// live/web/test/geometry.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w web test/geometry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `geometry.ts` and `renderer.ts`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add live/web
git commit -m "live: add overlay geometry and renderer"
```

---

### Task 10: Signaling client and peer connection wrapper

**Files:**
- Create: `live/web/src/rtc/signalClient.ts`, `live/web/src/rtc/peer.ts`, `live/web/src/rtc/backoff.ts`
- Test: `live/web/test/backoff.test.ts`, `live/web/test/signalClient.test.ts`

**Interfaces:**
- Produces in `backoff.ts`: `nextDelay(attempt: number): number` returning `min(1000 * 2 ** attempt, 10000)`, and `giveUp(elapsedMs: number): boolean` returning `elapsedMs >= 60000`.
- Produces in `signalClient.ts`: `class SignalClient { constructor(url: string, handlers: { onJoined(m): void; onPeerJoined(): void; onPeerLeft(): void; onSignal(m: { type: "offer" | "answer" | "ice"; [k: string]: unknown }): void; onEnded(): void; onStatus(s: "connecting" | "open" | "reconnecting" | "lost"): void }, opts?: { WebSocketImpl?: typeof WebSocket; now?: () => number; setTimeoutImpl?: typeof setTimeout }); send(m: object): void; close(): void }`. Reconnects with `nextDelay` on an unexpected close, except for close codes 4000, 4404, 4409 which call `onEnded` or set status `lost`. Calls `onStatus("lost")` when `giveUp` is true.
- Produces in `peer.ts`: `class Peer { constructor(opts: { role: "agent" | "customer"; iceServers: RTCIceServer[]; signal: SignalClient; onTrack(stream: MediaStream): void; onControl(channel: RTCDataChannel): void; onState(s: RTCPeerConnectionState): void }); start(local?: MediaStream): Promise<void>; handleSignal(m): Promise<void>; close(): void }`. The customer `start` adds tracks, creates the `control` channel, creates the offer, and sends it. The agent `start` adds its audio track and waits. `handleSignal` applies offer, answer, and ice. The agent, on `ondatachannel`, passes the channel to `onControl`. Ice candidates from the connection go out as `{ type: "ice", candidate }`.

- [ ] **Step 1: Write the failing tests**

```ts
// live/web/test/backoff.test.ts
import { describe, it, expect } from "vitest";
import { nextDelay, giveUp } from "../src/rtc/backoff";
describe("backoff", () => {
  it("doubles from 1s and caps at 10s", () => { expect([0, 1, 2, 3, 4, 9].map(nextDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]); });
  it("gives up at 60s", () => { expect(giveUp(59999)).toBe(false); expect(giveUp(60000)).toBe(true); });
});
```

```ts
// live/web/test/signalClient.test.ts  (jsdom environment)
import { describe, it, expect, vi } from "vitest";
import { SignalClient } from "../src/rtc/signalClient";

class FakeWS { static instances: FakeWS[] = []; onopen?: () => void; onclose?: (e: { code: number; reason: string }) => void; onmessage?: (e: { data: string }) => void; sent: string[] = [];
  constructor(public url: string) { FakeWS.instances.push(this); } send(d: string) { this.sent.push(d); } close() {} }

describe("SignalClient", () => {
  it("dispatches joined and signals, reconnects on drop, stops on 4409", () => {
    const h = { onJoined: vi.fn(), onPeerJoined: vi.fn(), onPeerLeft: vi.fn(), onSignal: vi.fn(), onEnded: vi.fn(), onStatus: vi.fn() };
    const timeouts: Array<[() => void, number]> = [];
    const c = new SignalClient("ws://x/ws?code=A&role=agent", h, { WebSocketImpl: FakeWS as any, now: () => 0, setTimeoutImpl: ((fn: () => void, ms: number) => { timeouts.push([fn, ms]); return 0; }) as any });
    const ws = FakeWS.instances[0]; ws.onopen!(); expect(h.onStatus).toHaveBeenCalledWith("open");
    ws.onmessage!({ data: JSON.stringify({ type: "joined", role: "agent", peerPresent: false, iceServers: [] }) }); expect(h.onJoined).toHaveBeenCalled();
    ws.onmessage!({ data: JSON.stringify({ type: "offer", sdp: "o" }) }); expect(h.onSignal).toHaveBeenCalledWith({ type: "offer", sdp: "o" });
    ws.onclose!({ code: 1006, reason: "" }); expect(h.onStatus).toHaveBeenCalledWith("reconnecting"); expect(timeouts[0][1]).toBe(1000);
    timeouts[0][0](); expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1].onclose!({ code: 4409, reason: "role taken" }); expect(h.onStatus).toHaveBeenLastCalledWith("lost"); expect(timeouts).toHaveLength(1);
    c.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w web`
Expected: FAIL on the two new files.

- [ ] **Step 3: Implement `backoff.ts`, `signalClient.ts`, and `peer.ts`**

`peer.ts` is not unit tested. The end-to-end test in Task 15 covers it. Keep it under 120 lines.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd live && npx vitest run -w web && npm run build -w web`
Expected: PASS and a clean build.

- [ ] **Step 5: Commit**

```bash
git add live/web
git commit -m "live: add signaling client, backoff, and peer wrapper"
```

---

### Task 11: Customer page

**Files:**
- Create: `live/web/src/pages/Customer.tsx`, `live/web/src/components/VideoOverlay.tsx`, `live/web/src/hooks/useOverlay.ts`, `live/web/src/customer/controlReceiver.ts`
- Modify: `live/web/src/App.tsx`
- Test: `live/web/test/controlReceiver.test.ts`

**Interfaces:**
- Consumes: `SignalClient`, `Peer`, `decode`, `FrameAssembler`, `drawOverlay`, `contentRect`.
- Produces in `controlReceiver.ts`: `class ControlReceiver { constructor(opts: { send(m: ControlMessage): void; now?: () => number; decodeImage?: (bytes: Uint8Array) => Promise<ImageBitmap | HTMLImageElement> }); onMessage(data: string | ArrayBuffer): Promise<void>; state(): { frozen: { frameId: string; w: number; h: number; image: unknown } | null; shapes: Shape[]; transients: Transient[] } }`. Pointer adds a transient with `until = now + 3000`; arrow with `until = now + 5000`. `freeze-start` creates an assembler; binary data goes to it; `freeze-end` decodes and sends `ack` with `ok: true`, or sends `ack` with `ok: false` and keeps live video on a mismatch. `shape` appends; `clear` empties `shapes`; `resume` clears `frozen` and `shapes` and sends `resumed`.
- Produces `VideoOverlay`: props `{ stream?: MediaStream; frozen?: { image; w; h } | null; shapes; transients; onPointer?(fx, fy): void; onDrag?(from, to): void; onDraw?(points): void; tool?: string; frameSize: { w; h } }`. It renders a `<video>` (or the frozen image on a canvas) and an overlay `<canvas>` sized to the element with `ResizeObserver`, and redraws on `requestAnimationFrame` while transients exist. Input handlers convert pixels with `toFrac` and ignore the bars.
- The customer page: on load, `GET /api/sessions/:code`; show `Session not found` on 404 and `Session ended` when ended. Show the consent text with a `Start camera` button. On click, `getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })`, falling back to `{ video: true, audio: true }` on `OverconstrainedError`. On `NotAllowedError`, show the instruction text from the spec. Then open `SignalClient` with role `customer`, build `Peer`, and `start(stream)` after `joined`. Re-run `start` after `peer-joined` when the connection is not `connected`. Status line with the states from the spec; after 20 s without `connected`, add the TURN hint. Buttons: Mute (toggles the audio track), End (`POST /end`, then show `Session ended`). Request a wake lock with `navigator.wakeLock?.request("screen")` inside a try block.

- [ ] **Step 1: Write the failing tests**

```ts
// live/web/test/controlReceiver.test.ts
import { describe, it, expect, vi } from "vitest";
import { ControlReceiver } from "../src/customer/controlReceiver";
import { encode } from "../src/protocol/messages";
import { splitFrame } from "../src/protocol/chunks";

const mk = () => { const send = vi.fn(); let t = 1000; const r = new ControlReceiver({ send, now: () => t, decodeImage: async () => ({} as any) }); return { r, send, tick: (ms: number) => (t += ms) }; };

describe("ControlReceiver", () => {
  it("keeps pointer for 3s and arrow for 5s", async () => {
    const { r } = mk();
    await r.onMessage(encode({ t: "pointer", x: 0.1, y: 0.2 })); await r.onMessage(encode({ t: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, color: "#fff" }));
    expect(r.state().transients.map((x) => x.until)).toEqual([4000, 6000]);
  });
  it("assembles a frozen frame, acks, draws shapes, resumes", async () => {
    const { r, send } = mk(); const bytes = new Uint8Array(40000);
    const parts = splitFrame(bytes);
    await r.onMessage(encode({ t: "freeze-start", frameId: "f", bytes: bytes.length, chunks: parts.length, w: 640, h: 480 }));
    for (const p of parts) await r.onMessage(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
    await r.onMessage(encode({ t: "freeze-end", frameId: "f" }));
    expect(send).toHaveBeenCalledWith({ t: "ack", frameId: "f", ok: true }); expect(r.state().frozen?.w).toBe(640);
    await r.onMessage(encode({ t: "shape", id: "s", kind: "rect", points: [[0, 0], [0.5, 0.5]], color: "#0f0" })); expect(r.state().shapes).toHaveLength(1);
    await r.onMessage(encode({ t: "clear" })); expect(r.state().shapes).toHaveLength(0);
    await r.onMessage(encode({ t: "resume" })); expect(r.state().frozen).toBeNull(); expect(send).toHaveBeenLastCalledWith({ t: "resumed" });
  });
  it("nacks a byte mismatch and stays live", async () => {
    const { r, send } = mk();
    await r.onMessage(encode({ t: "freeze-start", frameId: "g", bytes: 999, chunks: 1, w: 1, h: 1 }));
    await r.onMessage(splitFrame(new Uint8Array(10))[0].buffer);
    await r.onMessage(encode({ t: "freeze-end", frameId: "g" }));
    expect(send).toHaveBeenCalledWith({ t: "ack", frameId: "g", ok: false }); expect(r.state().frozen).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w web test/controlReceiver.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `controlReceiver.ts`, `VideoOverlay.tsx`, `useOverlay.ts`, and `Customer.tsx`; wire the route**

- [ ] **Step 4: Run the tests and the build**

Run: `cd live && npx vitest run -w web && npm run build -w web`
Expected: PASS and a clean build.

- [ ] **Step 5: Manual check**

Run: `cd live && npm run dev`. Open `http://localhost:5173/s/ZZZZZZ`.
Expected: the page shows `Session not found`.

- [ ] **Step 6: Commit**

```bash
git add live/web
git commit -m "live: add customer page and control receiver"
```

---

### Task 12: Agent console with session, video, pointer, arrow, audio

**Files:**
- Create: `live/web/src/pages/Agent.tsx`, `live/web/src/components/SessionPanel.tsx`, `live/web/src/components/Toolbar.tsx`, `live/web/src/agent/controlSender.ts`
- Modify: `live/web/src/App.tsx`
- Test: `live/web/test/controlSender.test.ts`

**Interfaces:**
- Consumes: `SignalClient`, `Peer`, `VideoOverlay`, `encode`, `splitFrame`.
- Produces in `controlSender.ts`: `class ControlSender { constructor(channel: { send(d: string | ArrayBuffer): void; bufferedAmount: number }, opts?: { now?: () => number }); pointer(x, y): void; arrow(x1, y1, x2, y2, color): void; shape(s: Shape): void; clear(): void; resume(): void; freeze(jpeg: Uint8Array, w: number, h: number): string /* frameId */; onMessage(raw: string): void; local(): { shapes: Shape[]; transients: Transient[] } }`. `pointer` and `arrow` also add a local transient so the agent sees the same fade. `freeze` sends `freeze-start`, the chunks in order, then `freeze-end`, and returns the frame id. `onMessage` records `ack` results in `lastAck: { frameId; ok } | undefined` and `resumed`.
- Produces `SessionPanel`: props `{ session?: { code; customerUrl }; onNew(): void }`. Shows the New session button, the code, the link with a Copy button, and a `QRCodeSVG` of the link at 160 px.
- Produces `Toolbar`: props `{ tool: Tool; onTool(t: Tool): void; color: string; onColor(c): void; frozen: boolean; onFreeze(): void; onResume(): void; onClear(): void; onSnapshot(): void; onAnalyze(): void; muted: boolean; onMute(): void; onEnd(): void }` with `Tool = "pointer" | "arrow" | "pen" | "rect" | "text"`. Freeze and Resume are one button whose label depends on `frozen`. Pen, rect, text are disabled while not frozen.
- Agent page: New session calls `POST /api/sessions`, then opens `SignalClient` with role `agent`, builds `Peer` with `getUserMedia({ audio: true })` for the local audio, sets `onTrack` to the remote stream, `onControl` to the channel and `ControlSender`. Status line as in the spec. Pointer tool: click sends `pointer`. Arrow tool: drag sends `arrow` on release. Mute toggles the local audio track. End calls `/end` and closes everything.

- [ ] **Step 1: Write the failing tests**

```ts
// live/web/test/controlSender.test.ts
import { describe, it, expect } from "vitest";
import { ControlSender } from "../src/agent/controlSender";
import { decode } from "../src/protocol/messages";

describe("ControlSender", () => {
  it("sends pointer and arrow and keeps local transients", () => {
    const sent: unknown[] = []; const s = new ControlSender({ send: (d) => sent.push(d), bufferedAmount: 0 }, { now: () => 0 });
    s.pointer(0.5, 0.5); s.arrow(0, 0, 1, 1, "#fff");
    expect(sent.map((x) => decode(x as string)?.t)).toEqual(["pointer", "arrow"]);
    expect(s.local().transients.map((t) => t.until)).toEqual([3000, 5000]);
  });
  it("sends freeze-start, chunks, freeze-end and records the ack", () => {
    const sent: unknown[] = []; const s = new ControlSender({ send: (d) => sent.push(d), bufferedAmount: 0 });
    const id = s.freeze(new Uint8Array(20000), 640, 480);
    expect(decode(sent[0] as string)).toMatchObject({ t: "freeze-start", frameId: id, bytes: 20000, chunks: 2, w: 640, h: 480 });
    expect(sent[1]).toBeInstanceOf(ArrayBuffer); expect(sent[2]).toBeInstanceOf(ArrayBuffer);
    expect(decode(sent[3] as string)).toEqual({ t: "freeze-end", frameId: id });
    s.onMessage(JSON.stringify({ t: "ack", frameId: id, ok: false })); expect(s.lastAck).toEqual({ frameId: id, ok: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w web test/controlSender.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `controlSender.ts`, `SessionPanel.tsx`, `Toolbar.tsx`, `Agent.tsx`; wire the route**

Freeze, pen, rect, text, snapshot, and analyze buttons exist in the toolbar in this task but their handlers are completed in Tasks 13 and 14. Wire them to no-op handlers here.

- [ ] **Step 4: Run the tests and the build**

Run: `cd live && npx vitest run -w web && npm run build -w web`
Expected: PASS and a clean build.

- [ ] **Step 5: Manual check with two browser tabs**

Run: `cd live && npm run dev`. Open `/agent`, click New session, open the customer link in a second tab, click Start camera. Chrome needs `--use-fake-device-for-media-stream` or a real webcam.
Expected: the agent tab shows the video and `live`; a click on the video shows a circle on both tabs.

- [ ] **Step 6: Commit**

```bash
git add live/web
git commit -m "live: add agent console with pointer, arrow, and audio"
```

---

### Task 13: Freeze frame and drawing tools

**Files:**
- Create: `live/web/src/agent/captureFrame.ts`
- Modify: `live/web/src/pages/Agent.tsx`, `live/web/src/components/VideoOverlay.tsx`
- Test: `live/web/test/captureFrame.test.ts`

**Interfaces:**
- Produces in `captureFrame.ts`: `targetSize(w: number, h: number, maxLong = 1280): { w: number; h: number }` (scales down so the long side is at most `maxLong`, keeps aspect, rounds to integers, never scales up), and `captureJpeg(video: HTMLVideoElement, quality = 0.7): Promise<{ bytes: Uint8Array; w: number; h: number }>` that draws the video onto an offscreen canvas at `targetSize` and encodes with `canvas.toBlob("image/jpeg", quality)`.
- Agent page: Freeze calls `captureJpeg`, shows the still image locally, and calls `sender.freeze`. While waiting for the ack, the status says `sending frame`. An ack with `ok: false` shows `freeze failed, try again` and returns to live. Pen: pointer drag collects fractions every move, sends one `shape` of kind `path` on release. Rect: drag sends a `rect` with two points. Text: click opens a small inline input; Enter sends a `text` shape at the click point. Clear sends `clear` and empties the local shapes. Resume sends `resume`, returns to live video, and empties the local shapes.
- `VideoOverlay` gains the `onDraw(points)` path for the pen and a `textPrompt` callback for the text tool.

- [ ] **Step 1: Write the failing test**

```ts
// live/web/test/captureFrame.test.ts
import { describe, it, expect } from "vitest";
import { targetSize } from "../src/agent/captureFrame";
describe("targetSize", () => {
  it("caps the long side at 1280 and keeps aspect", () => {
    expect(targetSize(1920, 1080)).toEqual({ w: 1280, h: 720 });
    expect(targetSize(1080, 1920)).toEqual({ w: 720, h: 1280 });
    expect(targetSize(640, 480)).toEqual({ w: 640, h: 480 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd live && npx vitest run -w web test/captureFrame.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `captureFrame.ts` and the freeze, pen, rect, text, clear, resume handlers**

- [ ] **Step 4: Run the tests and the build**

Run: `cd live && npx vitest run -w web && npm run build -w web`
Expected: PASS and a clean build.

- [ ] **Step 5: Manual check with two tabs**

Expected: Freeze shows the same still image on both tabs. A rectangle drawn on the agent tab appears on the customer tab. Resume returns both to live video.

- [ ] **Step 6: Commit**

```bash
git add live/web
git commit -m "live: add freeze frame and drawing tools"
```

---

### Task 14: Snapshot gallery and analyze suggestion layer

**Files:**
- Create: `live/web/src/components/Gallery.tsx`, `live/web/src/components/SuggestionLayer.tsx`, `live/web/src/api.ts`
- Modify: `live/web/src/pages/Agent.tsx`
- Test: `live/web/test/api.test.ts`

**Interfaces:**
- Produces in `api.ts`: `createSession(): Promise<{ code; customerUrl }>`, `getSession(code)`, `endSession(code)`, `uploadSnapshot(code, bytes: Uint8Array): Promise<{ id; url; takenAt }>`, `listSnapshots(code)`, `analyzeSnapshot(code, snapshotId): Promise<AnalysisResult>` (throws `Error(body.error)` on a non-2xx), `getIce()`. All use `fetch` with a `fetchImpl` parameter defaulting to `globalThis.fetch` for tests. Replace the direct `fetch` calls in Tasks 11 and 12 with these.
- `AnalysisResult` and `Part` types are copied into `live/web/src/api.ts` with the same shape as the server.
- `Gallery`: props `{ items: { id; url; takenAt }[]; selectedId?: string; onSelect(id): void }`. Thumbnails in a column; the selected one has a highlight; a click on the selected one opens it full size in a modal.
- `SuggestionLayer`: props `{ result: AnalysisResult; onSend(part: Part): void }`. Draws each `box` as a dashed rectangle with its label, and a `Send` button per part. Header shows `device.brand device.model (confidence %)` or `Device not identified`, and `notes`.
- Agent page: Snapshot captures with `captureJpeg`, uploads, and prepends the item to the gallery. Analyze is enabled when a snapshot is selected. It calls `analyzeSnapshot`, shows a spinner, and renders `SuggestionLayer` over the selected snapshot in the modal. `Send` on a part: if not frozen, freeze on that snapshot's bytes (fetch the JPEG from its url) first, then send a `rect` shape for the box and a `text` shape with the label at the box's top left, in the current color. A 502 shows the error text in a toast.

- [ ] **Step 1: Write the failing tests**

```ts
// live/web/test/api.test.ts
import { describe, it, expect } from "vitest";
import { analyzeSnapshot, uploadSnapshot } from "../src/api";

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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd live && npx vitest run -w web test/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `api.ts`, `Gallery.tsx`, `SuggestionLayer.tsx`, and the agent page changes**

- [ ] **Step 4: Run the tests and the build**

Run: `cd live && npm test && npm run build`
Expected: PASS and a clean build in both packages.

- [ ] **Step 5: Manual check**

Expected: Snapshot adds a thumbnail. Analyze on it shows the three mock parts. Send on `WAN port` freezes the customer on that snapshot and shows the rectangle and label.

- [ ] **Step 6: Commit**

```bash
git add live/web
git commit -m "live: add snapshot gallery and analyze suggestion layer"
```

---

### Task 15: End-to-end test with Playwright

**Files:**
- Create: `live/web/playwright.config.ts`, `live/web/e2e/live.spec.ts`
- Modify: `live/web/src/pages/Customer.tsx`, `live/web/src/pages/Agent.tsx` (add `data-testid` and a `window.__live` debug hook)

**Interfaces:**
- The customer page exposes `window.__live = { state: () => receiver.state() }` when `import.meta.env.MODE !== "production"` or when the URL has `?debug=1`. The agent page exposes `window.__live = { status: () => status, gallery: () => items }` the same way.
- `data-testid` values: `new-session`, `customer-link`, `start-camera`, `status`, `video-overlay`, `tool-pointer`, `tool-rect`, `freeze`, `snapshot`, `gallery-item`.
- `playwright.config.ts`: `webServer` runs `npm run build && npm start` from `live/` with `PORT=3100`, `DATA_DIR` set to a temp folder, and `url: http://localhost:3100/agent`. Use project `chromium` with `launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }`. `timeout` 60 s.

- [ ] **Step 1: Write the end-to-end test**

```ts
// live/web/e2e/live.spec.ts
import { test, expect } from "@playwright/test";

test("agent guides a customer end to end", async ({ browser }) => {
  const agentCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const custCtx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 400, height: 800 } });
  const agent = await agentCtx.newPage(); const cust = await custCtx.newPage();
  await agent.goto("/agent?debug=1"); await agent.getByTestId("new-session").click();
  const link = await agent.getByTestId("customer-link").textContent();
  await cust.goto(link!.replace(/\/s\//, "/s/") + "?debug=1"); await cust.getByTestId("start-camera").click();
  await expect(agent.getByTestId("status")).toHaveText(/live/, { timeout: 30000 });

  await agent.getByTestId("tool-pointer").click();
  const box = (await agent.getByTestId("video-overlay").boundingBox())!;
  await agent.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => cust.evaluate(() => (window as any).__live.state().transients.length)).toBe(1);

  await agent.getByTestId("freeze").click();
  await expect.poll(async () => cust.evaluate(() => (window as any).__live.state().frozen !== null), { timeout: 15000 }).toBe(true);
  await agent.getByTestId("tool-rect").click();
  await agent.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3); await agent.mouse.down();
  await agent.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6); await agent.mouse.up();
  await expect.poll(async () => cust.evaluate(() => (window as any).__live.state().shapes.length)).toBe(1);

  await agent.getByTestId("snapshot").click();
  await expect(agent.getByTestId("gallery-item")).toHaveCount(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd live && npm run test:e2e`
Expected: FAIL on a missing `data-testid`.

- [ ] **Step 3: Add the test ids, the debug hook, and the Playwright config**

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd live && npm run test:e2e`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add live/web
git commit -m "live: add end-to-end test"
```

---

### Task 16: README and demo run-through

**Files:**
- Create: `live/README.md`
- Modify: `README.md` (one new section at the top that points to `live/`)

**Interfaces:** none.

- [ ] **Step 1: Write `live/README.md`**

Sections, in this order: What it is (three sentences). Requirements (Node 22). Run in development (`npm install`, `npm run dev`, open `http://localhost:5173/agent`). Demo through a tunnel (`ngrok http 5173` and `cloudflared tunnel --url http://localhost:5173`; set `PUBLIC_URL` to the tunnel URL or open the console through the tunnel). TURN relay (the three variables and this command: `docker run -d --network=host coturn/coturn -n --log-file=stdout --lt-cred-mech --user=demo:demo --realm=demo --external-ip=$(curl -s ifconfig.me)`; then `TURN_URL=turn:<public-ip>:3478 TURN_USER=demo TURN_PASS=demo`). AI analysis (`ANTHROPIC_API_KEY`; without it the mock provider answers). Production (`npm run build`, `npm start`, `PORT`). Tests (`npm test`, `npm run test:e2e`). Manual demo checklist: laptop and phone on mobile data, with and without TURN, each step from the end-to-end test done by hand. Known limits: sessions are lost on restart; one agent and one customer per session; no recording.

- [ ] **Step 2: Add the pointer section to the root `README.md`**

Two sentences under a heading `Live visual support (2026)` with a link to `live/README.md`, placed above the old content.

- [ ] **Step 3: Run the full check**

Run: `cd live && npm test && npm run build && npm run test:e2e`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add live/README.md README.md
git commit -m "live: add README and demo instructions"
```
