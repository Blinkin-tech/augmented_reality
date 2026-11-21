# routes

## Overview

Express 4 router factories for the live-support HTTP API. Each factory takes its
dependencies explicitly (`SessionStore`, `SnapshotStore`, `VisionProvider`,
`Config`) and returns an `express.Router` with paths relative to its mount point.
`../app.ts` mounts `sessionsRouter`, `snapshotsRouter`, and `analyzeRouter` under
`/api/sessions`, and `iceRouter` under `/api/ice`. Routers hold no state of their
own; all session and snapshot state lives in the stores they are given.

## Interface

- `sessionsRouter(deps: { store: SessionStore; config: Config }): express.Router`
  [sessions.ts:sessionsRouter]
- `snapshotsRouter(deps: { store: SessionStore; snapshots: SnapshotStore }): express.Router`
  [snapshots.ts:snapshotsRouter]
- `analyzeRouter(deps: { store: SessionStore; snapshots: SnapshotStore; vision: VisionProvider }): express.Router`
  [analyze.ts:analyzeRouter]
- `iceRouter(deps: { config: Config }): express.Router` [ice.ts:iceRouter]
- `buildIceServers(config: Config): RTCIceServerLike[]` [ice.ts:buildIceServers]
  (also used by `../index.ts` for the signaling handshake)
- `RTCIceServerLike { urls: string; username?: string; credential?: string }`
  [ice.ts:RTCIceServerLike]

Endpoints (paths relative to the mount point):

| Router | Method and path | Success | Errors |
| --- | --- | --- | --- |
| `sessionsRouter` | `POST /` | `201 { code, customerUrl }` | - |
| `sessionsRouter` | `GET /:code` | `200 { code, state, createdAt }` | `404` |
| `sessionsRouter` | `POST /:code/end` | `200 { ok: true }` | `404` |
| `snapshotsRouter` | `POST /:code/snapshots` (body `image/jpeg`) | `201 { id, url, takenAt }` | `415`, `404` |
| `snapshotsRouter` | `GET /:code/snapshots` | `200 [{ id, url, takenAt }]` | `404` |
| `snapshotsRouter` | `GET /:code/snapshots/:id` | `200` body `image/jpeg` | `404` |
| `analyzeRouter` | `POST /:code/analyze` (JSON `{ snapshotId }`) | `200 AnalysisResult` | `404`, `502` |
| `iceRouter` | `GET /` | `200 { iceServers }` | - |

## Invariants

- Every error response body is `{ error: string }`; `404` bodies use
  `"not found"` [sessions.ts:sessionsRouter] [snapshots.ts:snapshotsRouter]
  [analyze.ts:analyzeRouter].
- `customerUrl` is `${origin}/s/${code}` where `origin` is `config.publicUrl` with
  trailing slashes stripped, otherwise `${req.protocol}://${req.get("host")}`
  [sessions.ts:sessionsRouter].
- `POST /:code/snapshots` rejects with `415 "expected image/jpeg"` before the body
  is read; the raw body parser is limited to `5mb` [snapshots.ts:rawJpeg].
- Snapshot `url` values are built as `/api/sessions/${code}/snapshots/${id}` and
  therefore assume the `/api/sessions` mount in `../app.ts`
  [snapshots.ts:describe].
- `buildIceServers` always returns `stun:stun.l.google.com:19302` first and appends
  the TURN entry only when `config.turn` is set [ice.ts:buildIceServers].
- `POST /:code/analyze` returns `404` when the session is missing, `snapshotId` is
  not a string, or the snapshot bytes cannot be read; `502` with the thrown
  message when `vision.analyze` rejects; the mime passed to the provider is always
  `"image/jpeg"` [analyze.ts:analyzeRouter].
- `analyzeRouter` reads `req.body.snapshotId` and relies on an upstream JSON body
  parser (`api.use(express.json())` in `../app.ts`) [analyze.ts:analyzeRouter].
- Async handlers forward unexpected errors to `next(err)`; synchronous handlers
  do not [snapshots.ts:snapshotsRouter] [analyze.ts:analyzeRouter].

## Side Effects

- `POST /` creates a session in the store; `POST /:code/end` ends it, which closes
  any attached WebSockets (`SessionStore.end`) [sessions.ts:sessionsRouter].
- `POST /:code/snapshots` writes a JPEG to disk and appends to `session.snapshots`
  via `SnapshotStore.save`; `GET /:code/snapshots/:id` reads from disk via
  `SnapshotStore.read` [snapshots.ts:snapshotsRouter].
- `POST /:code/analyze` invokes `vision.analyze`, which is an outbound network call
  when the Claude provider is selected [analyze.ts:analyzeRouter].
- `iceRouter` only reads `config` [ice.ts:iceRouter].

## Verification

- Run: `cd live/server && npx vitest run`
