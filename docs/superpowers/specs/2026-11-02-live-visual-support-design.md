# Live Visual Support: Design Spec

Date: 2026-11-02
Status: approved in conversation, pending written review
Owner: Blinkin

## 1. Purpose

Build a browser-based remote visual support tool. A customer opens a link on a
phone. A support agent sees the phone camera in a desktop browser. The agent
draws guidance on the video. The customer sees the guidance on the phone.

The first use is a demo. One agent, one customer, one session at a time. The
demo runs on a laptop behind a tunnel. The core must be clean enough that a
pilot with several agents is an extension and not a rewrite.

The second step is a smart agent assistant. A vision model names the device and
labels its parts on a snapshot. The agent sees the labels as a suggestion. This
spec defines the extension point for that step. It does not build the full
assistant.

## 2. Scope

In scope:

- A customer page that streams the rear camera and microphone from a phone.
- An agent console that shows the stream and has guidance tools.
- Session creation with a short code, a link, and a QR code.
- Pointer, arrow, freeze frame, pen, rectangle, text, clear, resume.
- Snapshot capture and a gallery for the session.
- Two-way audio with mute.
- An "analyze" endpoint behind a provider interface, with a mock provider and
  a real provider.

Out of scope for this spec:

- Agent login, agent queue, session history across restarts.
- SMS delivery of the link.
- Recording of the video stream.
- Multi-tenant features, billing, contact center integration.
- Automated next-best-action or autonomous installation.

## 3. Architecture

### 3.1 Layout

All new code lives in a new folder `live/` in this repository. The old C++
demos stay untouched.

```
live/
  package.json          npm workspaces root, shared scripts
  server/               Node 20, TypeScript
    src/
      index.ts          HTTP server, static files, WebSocket upgrade
      sessions.ts       in-memory session store
      signaling.ts      WebSocket relay between agent and customer
      snapshots.ts      upload, list, serve snapshot files
      analyze.ts        analyze endpoint and provider selection
      vision/
        provider.ts     VisionProvider interface and result types
        mock.ts         MockVisionProvider
        claude.ts       ClaudeVisionProvider
    test/
  web/                  Vite, React 18, TypeScript
    src/
      pages/Agent.tsx   agent console
      pages/Customer.tsx customer page
      rtc/              peer connection setup, data channel
      protocol/         message types, encode, decode, coordinate math
      overlay/          canvas drawing of annotations
    test/
  data/                 snapshots at run time, ignored by git
  README.md
```

### 3.2 Processes

One Node process runs the server. It does three jobs:

1. It serves the built web app from `web/dist` in production.
2. It runs a WebSocket endpoint at `/ws` for signaling.
3. It exposes an HTTP API under `/api`.

In development, Vite serves the web app on port 5173. Vite forwards `/api` and
`/ws` to the server on port 3000. One tunnel on port 5173 covers the whole
demo. The README gives the ngrok and Cloudflare Tunnel commands.

### 3.3 Media path

Video and audio travel peer-to-peer over WebRTC. The server never receives
media. The customer sends video and audio. The agent sends audio only. The
customer opens one data channel named `control` for guidance messages.

ICE servers:

- Default: a public STUN server (`stun:stun.l.google.com:19302`).
- Optional TURN relay from environment variables `TURN_URL`, `TURN_USER`,
  `TURN_PASS`. The server sends the ICE server list to both browsers at join
  time, so the secret stays in one place.
- The README gives one Docker command for coturn.

### 3.4 Session store

Sessions live in memory. The server loses them on restart. This is acceptable
for the demo. The store sits behind a small interface so a database can
replace it later.

```ts
type SessionState = "waiting" | "live" | "ended";

interface Session {
  code: string;           // 6 characters, upper case letters and digits, no 0/O/1/I
  createdAt: number;      // epoch ms
  state: SessionState;
  agentSocket?: WebSocket;
  customerSocket?: WebSocket;
  snapshots: Snapshot[];
}

interface Snapshot {
  id: string;             // 8 random hex characters
  file: string;           // path under live/data/<code>/
  takenAt: number;
}
```

A session ends when the agent clicks "End" or 60 minutes after creation. A
timer in the store ends old sessions and closes their sockets.

## 4. HTTP API

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/sessions` | none | `{ code, customerUrl }` |
| GET | `/api/sessions/:code` | none | `{ code, state, createdAt }` or 404 |
| POST | `/api/sessions/:code/end` | none | `{ ok: true }` |
| POST | `/api/sessions/:code/snapshots` | JPEG bytes, `Content-Type: image/jpeg` | `{ id, url, takenAt }` |
| GET | `/api/sessions/:code/snapshots` | none | `Snapshot[]` with `url` for each |
| GET | `/api/sessions/:code/snapshots/:id` | none | JPEG bytes |
| POST | `/api/sessions/:code/analyze` | `{ snapshotId }` | `AnalysisResult` (section 8) |
| GET | `/api/ice` | none | `{ iceServers: RTCIceServer[] }` |

The `customerUrl` uses the `PUBLIC_URL` environment variable as its origin
when set. Otherwise it uses the request origin. The tunnel sets a different
public host than localhost, so the agent must set `PUBLIC_URL` or open the
console through the tunnel.

Snapshot upload size is limited to 5 MB. The server returns 413 above that.

## 5. Signaling protocol over WebSocket

Each browser connects to `/ws?code=<code>&role=agent|customer`. The server
rejects a connection when the code is unknown, when the session is ended, or
when the role slot is already in use. The rejection carries a close code and a
short reason.

Messages are JSON objects with a `type` field.

Server to client:

| type | fields | meaning |
|---|---|---|
| `joined` | `role`, `peerPresent`, `iceServers` | You are in the session. |
| `peer-joined` | none | The other side connected. |
| `peer-left` | none | The other side disconnected. |
| `ended` | none | The session ended. Close everything. |
| `error` | `message` | A bad message was ignored. |

Client to server, relayed to the peer unchanged:

| type | fields |
|---|---|
| `offer` | `sdp` |
| `answer` | `sdp` |
| `ice` | `candidate` |

The server validates the shape of each message. It drops anything else and
sends `error`. The relay carries no business logic.

The customer side always creates the offer. When either side reconnects, the
customer side creates a new offer after it receives `joined` with
`peerPresent: true` or after it receives `peer-joined`.

## 6. Guidance protocol over the data channel

All guidance travels over the `control` data channel. The agent sends. The
customer receives and renders. The customer sends only `ack` for frozen frame
chunks and `resumed` after a resume.

Coordinates are fractions of the frame width and height, from 0 to 1. Both
sides map them to their own video element size. This keeps the drawing on the
same part of the picture on a phone screen and on a desktop screen. The
overlay math accounts for letterboxing when the element aspect ratio differs
from the frame aspect ratio.

Messages are JSON strings. The frozen frame travels as binary chunks.

| t | fields | render on customer |
|---|---|---|
| `pointer` | `x`, `y` | circle at point, fades after 3 seconds |
| `arrow` | `x1`, `y1`, `x2`, `y2`, `color` | arrow, fades after 5 seconds |
| `freeze-start` | `frameId`, `bytes`, `chunks`, `w`, `h` | prepare to receive a JPEG |
| binary chunk | 16 KB max, first 4 bytes = chunk index | append to buffer |
| `freeze-end` | `frameId` | decode JPEG, show still image |
| `shape` | `id`, `kind` (`path` / `rect` / `text`), `points`, `color`, `text` | draw on the still image |
| `clear` | none | remove all shapes |
| `resume` | none | hide still image, show live video |
| `ack` | `frameId` (customer to agent) | frozen frame received |
| `resumed` | none (customer to agent) | live video shown again |

The agent captures the frozen frame from its own video element at the moment
of the click. The agent sends that JPEG to the phone. Both sides show the same
still image. This avoids a mismatch from network delay between the two
pictures. The JPEG is captured at the video's native size, up to 1280 pixels
on the long side, at quality 0.7.

Shapes on a frozen frame persist until `clear` or `resume`. Pointer and arrow
on live video fade on their own.

## 7. User interface

### 7.1 Agent console at `/agent`

- Top bar: "New session" button, session code, link with copy button, QR code.
- Center: the remote video with an overlay canvas. The canvas receives mouse
  and touch input for the tools.
- Toolbar: Pointer, Arrow, Freeze / Resume, Pen, Rectangle, Text, Clear,
  Snapshot, Mute, Analyze (section 8), End.
- Color picker for the pen, rectangle, text, and arrow.
- Right panel: snapshot gallery. A click opens the image in a larger view.
  The "Analyze" button acts on the selected snapshot.
- Status line: waiting for customer, connecting, live, customer reconnecting,
  ended.

### 7.2 Customer page at `/s/:code`

- Full-screen local camera preview with the overlay canvas on top.
- Bottom bar: Mute, End.
- A short consent text before the camera request: what the agent sees and
  that nothing is recorded by default.
- Error states: unknown code, session ended, camera refused with instructions
  (use HTTPS, allow camera in browser settings, try Chrome or Safari),
  connection failed after 20 seconds with a hint about the TURN relay.

The customer page requests the rear camera with `facingMode: environment`,
and falls back to any camera when that fails. Video constraints request
1280 by 720 at up to 30 frames per second. The page keeps the screen awake
with the Screen Wake Lock API when available.

## 8. AI extension point

### 8.1 Interface

```ts
interface VisionProvider {
  name: string;
  analyze(image: Buffer, mime: "image/jpeg"): Promise<AnalysisResult>;
}

interface AnalysisResult {
  provider: string;
  device: { brand: string; model: string; confidence: number } | null;
  parts: Part[];
  notes: string;         // short free text for the agent
}

interface Part {
  label: string;         // "WAN port", "Power LED", "Reset button"
  kind: "port" | "button" | "led" | "display" | "other";
  box: [number, number, number, number];   // x, y, w, h as fractions 0..1
  confidence: number;
}
```

### 8.2 Providers

- `MockVisionProvider`: returns a fixed device and three parts after a short
  delay. Used when no API key is set. The demo works without any key.
- `ClaudeVisionProvider`: calls the Anthropic Messages API through the
  official TypeScript SDK with the image as a base64 block. It uses model
  `claude-opus-5-5` and structured output to get JSON in the `AnalysisResult`
  shape. It is selected when `ANTHROPIC_API_KEY` is set. The provider enables
  the server-side refusal fallback. Any API error returns a 502 with a
  message and never crashes the server.

### 8.3 Console behavior

The agent selects a snapshot and clicks "Analyze". The console draws the
returned boxes and labels on the snapshot in a suggestion layer. Only the
agent sees this layer. Each box has a "Send" button. A click sends the box as
a `shape` of kind `rect` and a `text` label to the customer, on a frozen frame
of that snapshot. This keeps the agent in control of what the customer sees.

## 9. Error handling

- Unknown session code: the customer page shows a clear message.
- Role slot in use: the WebSocket closes with code 4409 and reason
  "role taken". The console shows the reason.
- Camera refused: the customer page shows instructions. No retry loop.
- WebSocket drop: the client reconnects with exponential backoff, from 1 to 10
  seconds, up to 60 seconds total. The other side shows "reconnecting". After
  60 seconds the client shows "connection lost" with a reload button.
- ICE failure: after 20 seconds without `connected`, the page shows a hint
  about the TURN relay. The connection attempt continues in the background.
- Bad messages: the server and both clients validate message shapes and drop
  bad ones. Validation uses a small hand-written checker, not a schema library.
- Frozen frame chunk loss: the data channel is ordered and reliable, so loss
  does not occur. A `freeze-end` with a byte count mismatch discards the frame
  and sends `ack` with `ok: false`. The agent shows "freeze failed, try again".
- Snapshot upload failure: the console shows a toast. The frame is not lost;
  the agent can retry.

## 10. Testing

Test runner: Vitest for unit tests in both packages. Playwright for one
end-to-end test.

Server unit tests:

- Session store: create, get, end, expiry timer, code format.
- Signaling: two in-process WebSocket clients join one session; offer, answer,
  and ice relay to the peer; role rejection; `peer-left` on close.
- Snapshots: upload, list, serve, size limit.
- Analyze: mock provider path returns the fixed result; missing snapshot gives
  404; provider error gives 502.

Web unit tests:

- Protocol: encode and decode of every message; chunking of a frozen frame
  and reassembly; byte count mismatch detection.
- Overlay math: fraction to pixel and back, with letterboxing in both
  directions.

End-to-end test:

- Start the server. Open an agent context and a customer context in Chromium
  with fake media flags. Create a session, open the customer link, wait for
  `live`. Click a pointer on the agent canvas. Assert that the customer page
  rendered a pointer at the same fraction. Freeze, draw a rectangle, assert
  the customer shows the still image and the rectangle. Take a snapshot, assert
  it appears in the gallery.

Manual demo check in the README: one laptop, one phone on mobile data, through
the tunnel, with and without TURN.

## 11. Build and run

- `npm install` at `live/`.
- `npm run dev`: starts the server on 3000 and Vite on 5173 together.
- `npm run build`: builds `web/dist` and compiles the server.
- `npm start`: runs the server in production mode on `PORT`, default 3000.
- `npm test`: runs unit tests in both packages.
- `npm run test:e2e`: runs the Playwright test against a built server.

Environment variables: `PORT`, `PUBLIC_URL`, `TURN_URL`, `TURN_USER`,
`TURN_PASS`, `ANTHROPIC_API_KEY`, `DATA_DIR` (default `live/data`).

## 12. Decisions recorded

| Decision | Choice | Reason |
|---|---|---|
| First use | Demo, one session at a time | Smallest build that shows the idea on a real phone |
| Video path | Direct WebRTC, own signaling | Free, in our control, no external account |
| Stack | TypeScript, Node, React, Vite | One language, largest WebRTC ecosystem |
| Hosting | Laptop with a tunnel | Fastest for a demo |
| Invite | Link and QR code | No SMS provider needed |
| Frozen frame source | Agent captures and sends | Both sides show the identical image |
| Coordinates | Fractions 0 to 1 | Same place on any screen size |
| AI first step | Device and part recognition | Direct path from snapshot to labeled overlay |
| AI visibility | Agent-only suggestion, agent sends | Agent stays in control |
| Repo layout | New `live/` folder | Old demos stay for reference |
