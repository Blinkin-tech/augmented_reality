# server/src

## Overview

Node 22 / TypeScript (CommonJS) backend for the live visual support product: an
Express 4 HTTP API, a `ws` WebSocket signaling relay for WebRTC, an in-memory
session store, and a disk-backed snapshot store, wired together by
`startServer`. All state is process-local: sessions live in a `Map`, snapshots
live under `config.dataDir`, and nothing survives a restart. Child folders hold
the signaling wire format (`protocol`), the HTTP routers (`routes`), and the image
analysis providers (`vision`).

## Interface

- `Config { port; publicUrl?; dataDir; turn?; anthropicApiKey? }` and
  `loadConfig(env: NodeJS.ProcessEnv): Config` [config.ts:Config] [config.ts:loadConfig]
- `AppDeps { store; config; snapshots; vision }` and `createApp(deps): express.Express`
  [app.ts:AppDeps] [app.ts:createApp]
- `startServer(config, opts?: { heartbeatMs? }): Promise<{ server; store; close() }>`
  [index.ts:startServer]; runs `loadConfig(process.env)` and listens when the file
  is the main module [index.ts:require.main].
- `Snapshot { id; file; takenAt }`, `Session { code; createdAt; state; snapshots; agentSocket?; customerSocket? }`
  [sessions.ts:Snapshot] [sessions.ts:Session]
- `generateCode(): string`, `normalizeCode(input): string` [sessions.ts:generateCode] [sessions.ts:normalizeCode]
- `class SessionStore` with `create()`, `get(code)`, `end(code): boolean`, `expire(): string[]`
  [sessions.ts:SessionStore]
- `class SnapshotStore(dataDir)` with `save(session, jpeg)`, `read(session, id)`, `list(session)`
  [snapshots.ts:SnapshotStore]
- `HEARTBEAT_MS = 10_000` and `attachSignaling(server, { store, iceServers, heartbeatMs? }): WebSocketServer`
  [signaling.ts:HEARTBEAT_MS] [signaling.ts:attachSignaling]
- Subdirectories:
  - [protocol](./protocol/README.md) - `ClientSignal` union and `parseClientSignal`.
  - [routes](./routes/README.md) - `sessionsRouter`, `snapshotsRouter`, `analyzeRouter`, `iceRouter`, `buildIceServers`.
  - [vision](./vision/README.md) - `VisionProvider`, analysis zod schemas, `selectProvider`, Claude and mock providers.

## Invariants

- `createApp` sets `trust proxy`, mounts an `/api` router with `express.json()`,
  `/api/sessions` (sessions, snapshots, analyze routers) and `/api/ice`; static
  files from `../../web/dist` with an SPA fallback are served only when
  `NODE_ENV !== "development"` and that directory exists, and the fallback skips
  `/api` and `/ws` paths [app.ts:createApp].
- `loadConfig` defaults `port` to `3000` and `dataDir` to `<server>/../data`;
  `turn` is set only when `TURN_URL`, `TURN_USER`, and `TURN_PASS` are all
  present; `anthropicApiKey` comes from `ANTHROPIC_API_KEY` [config.ts:loadConfig].
- Session codes are 6 characters from a 32-symbol alphabet that omits `I`, `O`,
  `0`, `1`; `create` regenerates until unique; `get` trims and upper-cases its
  input [sessions.ts:ALPHABET] [sessions.ts:CODE_LENGTH] [sessions.ts:SessionStore.create] [sessions.ts:normalizeCode].
- `Session.state` is `"waiting" | "live" | "ended"`; a new session is `waiting`;
  ending sets `ended` and closes both sockets with code `4000 "session ended"`;
  ended sessions stay in the map and are never deleted [sessions.ts:Session] [sessions.ts:SessionStore.endSession].
- `expire()` ends every non-ended session with `createdAt <= now - ttlMs` and
  returns their codes; `startServer` uses `ttlMs` of one hour and calls `expire`
  every 60 s on an unref'd timer [sessions.ts:SessionStore.expire] [index.ts:SESSION_TTL_MS] [index.ts:EXPIRE_INTERVAL_MS].
- Signaling listens on path `/ws` with `maxPayload` 64 KiB; a connection must
  carry query params `code` and `role` (`agent` or `customer`). Missing or ended
  session or bad role closes with `4404 "unknown session"`; an occupied slot
  (`OPEN` or `CONNECTING`) closes with `4409 "role taken"` [signaling.ts:attachSignaling] [signaling.ts:inUse].
- On join the server sends `{ type: "joined", role, peerPresent, iceServers }`;
  when the peer is present the session becomes `live` and the peer receives
  `{ type: "peer-joined" }` [signaling.ts:attachSignaling].
- Incoming frames are parsed with `parseClientSignal`; invalid frames get
  `{ type: "error", message: "invalid message" }` back, valid ones are forwarded
  only to the peer slot (never echoed) [signaling.ts:attachSignaling].
- On socket close the slot is cleared only if it still holds that socket, the
  peer receives `{ type: "peer-left" }`, and state returns to `waiting` unless
  already `ended` [signaling.ts:attachSignaling].
- A heartbeat pings every client each `heartbeatMs ?? HEARTBEAT_MS`; a client
  that has not ponged since the previous tick is terminated [signaling.ts:attachSignaling].
- Snapshot ids are 8 hex characters; files are `${dataDir}/${code}/${id}.jpg`;
  `read` returns `undefined` for an unknown id or a failed file read; `list`
  returns the live `session.snapshots` array, not a copy [snapshots.ts:SnapshotStore].
- `startServer.close()` clears the expiry timer, terminates all WebSocket clients,
  closes the `WebSocketServer`, and closes the HTTP server including open
  connections [index.ts:startServer].

## Side Effects

- `startServer` binds a TCP listener on `config.port` and starts the expiry
  interval; the main-module branch logs the port with `console.log` [index.ts:startServer] [index.ts:require.main].
- `SnapshotStore.save` creates directories and writes files under `dataDir`;
  `read` reads from disk [snapshots.ts:SnapshotStore.save] [snapshots.ts:SnapshotStore.read].
- `createApp` checks `fs.existsSync` on `web/dist` at construction and may serve
  static files from it [app.ts:createApp].
- `SessionStore.end` / `expire` close live WebSockets [sessions.ts:SessionStore.endSession].
- `attachSignaling` sends frames, pings, and terminates sockets; it mutates
  `Session.state`, `agentSocket`, and `customerSocket` [signaling.ts:attachSignaling].
- `selectProvider` (see [vision](./vision/README.md)) makes outbound Anthropic API
  calls when `ANTHROPIC_API_KEY` is set [index.ts:startServer].

## Verification

- Run: `cd live/server && npx vitest run`
- Build: `cd live && npm run build -w server`
