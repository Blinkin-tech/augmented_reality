# Contract tables

Source of truth for the shapes shared by server and web. Update this file in the same
commit as any contract change.

## 1. Signaling over WebSocket

Path: `/ws?code=<code>&role=agent|customer`. The server relays; it holds no media.

Server to client:

| type | fields | meaning |
|---|---|---|
| `joined` | `role`, `peerPresent`, `iceServers` | You are in the session. `iceServers` is the same list as `GET /api/ice`. |
| `peer-joined` | none | The other side connected. May arrive twice in a reconnect race; clients tolerate it. |
| `peer-left` | none | The other side disconnected. |
| `error` | `message` | A bad client message was dropped. |

Client to server, relayed unchanged to the peer after validation by `parseClientSignal`:

| type | fields |
|---|---|
| `offer` | `sdp` |
| `answer` | `sdp` |
| `ice` | `candidate` |

Close codes:

| code | reason | client behavior |
|---|---|---|
| 4000 | `session ended` | stop; show ended |
| 4404 | `unknown session` | stop; status `lost` with the reason |
| 4409 | `role taken` | retry inside the 60 s backoff window; then `lost` |
| other | | reconnect with backoff 1 s doubling to 10 s; give up after 60 s |

Rules: one agent and one customer per session. A slot is taken while its socket is OPEN or
CONNECTING. The server pings every 10 s and terminates a socket that misses a pong.
`maxPayload` is 65536 bytes. The customer always creates the offer. Each side builds a new
`RTCPeerConnection` for every offer.

## 2. Guidance over the data channel

Channel name `control`, ordered and reliable, `binaryType = "arraybuffer"`. Coordinates are
fractions 0 to 1 of the picture area. Validation: `decode` in
`live/web/src/protocol/messages.ts` rejects unknown `t`, missing fields, and any coordinate
outside 0 to 1.

| t | fields | direction | customer rendering |
|---|---|---|---|
| `pointer` | `x`, `y` | agent to customer | circle, fades after 3 s |
| `arrow` | `x1`, `y1`, `x2`, `y2`, `color` | agent to customer | arrow, fades after 5 s |
| `freeze-start` | `frameId`, `bytes`, `chunks`, `w`, `h` | agent to customer | prepare a `FrameAssembler` |
| binary chunk | 4-byte big-endian index, then payload; chunk at most 16384 bytes | agent to customer | append |
| `freeze-end` | `frameId` | agent to customer | decode; show the still; send `ack` |
| `shape` | `id`, `kind` (`path`, `rect`, `text`), `points`, `color`, `text?` | agent to customer | draw on the still |
| `clear` | none | agent to customer | remove all shapes |
| `resume` | none | agent to customer | hide the still; send `resumed` |
| `ack` | `frameId`, `ok` | customer to agent | `ok: false` on a byte-count mismatch |
| `resumed` | none | customer to agent | live video shown again |

Frozen frame: captured by the agent from its own video element, long side at most 1280 px,
JPEG quality 0.7, sent as chunks. Both sides show the identical image.

## 3. HTTP API

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/sessions` | none | 201 `{ code, customerUrl }` |
| GET | `/api/sessions/:code` | none | `{ code, state, createdAt }` or 404 `{ error }` |
| POST | `/api/sessions/:code/end` | none | `{ ok: true }` or 404 |
| POST | `/api/sessions/:code/snapshots` | JPEG bytes, `Content-Type: image/jpeg`, max 5 MB | 201 `{ id, url, takenAt }`; 415 wrong type; 413 too large |
| GET | `/api/sessions/:code/snapshots` | none | `[{ id, url, takenAt }]` |
| GET | `/api/sessions/:code/snapshots/:id` | none | JPEG bytes or 404 |
| POST | `/api/sessions/:code/analyze` | `{ snapshotId }` | 200 `AnalysisResult`; 404; 502 `{ error }` |
| GET | `/api/ice` | none | `{ iceServers }` |

Session code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, matched in any case.
Snapshot id: 8 hex characters. `customerUrl` origin is `PUBLIC_URL` when set, else the
request origin. Sessions expire 60 minutes after creation.

Web side: every call lives in `live/web/src/api.ts` with `fetchImpl` as the last parameter.
Non-2xx throws `Error(body.error ?? "HTTP <status>")`, except `getSession`, which returns
`undefined` on 404.

## 4. Analysis result

Server schema in `live/server/src/vision/provider.ts` (zod, `zod/v4` import). Web type in
`live/web/src/api.ts`. They must match field for field.

```ts
type Part = {
  label: string;
  kind: "port" | "button" | "led" | "display" | "other";
  box: [number, number, number, number]; // x, y, w, h as fractions 0..1
  confidence: number;                    // 0..1
};
type AnalysisResult = {
  provider: string;                      // "mock" or "claude"
  device: { brand: string; model: string; confidence: number } | null;
  parts: Part[];
  notes: string;
};
```

The web clamps `x + w` and `y + h` to 1 before it sends a `rect` shape, because `decode`
rejects coordinates above 1.
