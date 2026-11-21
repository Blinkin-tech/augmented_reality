# live/web/src Blueprint

## System Overview

The browser side of the live visual support product, built with Vite 5, React 18, and
TypeScript. Two routes: the agent console at `/agent` and the customer page at `/s/:code`.
The customer streams camera and microphone to the agent over WebRTC; the agent sends
guidance (pointer, arrow, frozen frame, shapes, labels) back over an ordered data channel.
Signaling goes through a WebSocket to the server at `/ws`; everything else goes through the
HTTP API under `/api`. Session logic lives in hooks that keep live objects in refs and
expose pure decision helpers; pages are thin; components are presentational.

## Local Interface & Invariants

- `App()` [App.tsx:App]: a `Routes` tree with `/agent` → `Agent` and `/s/:code` → `Customer`.
- `main.tsx` mounts `App` inside `BrowserRouter` and `StrictMode` and imports `styles.css`.
- `installDebugHook(hook)` [debugHook.ts:installDebugHook]: sets `window.__live` to the
  given getters when `import.meta.env.MODE !== "production"` or the URL has `?debug=1`.
  Read-only; used by the end-to-end test and the demo recording script.
- `api.ts`: every HTTP call to the server, each with `fetchImpl` as the last parameter
  (default `globalThis.fetch`): `createSession`, `getSession` (undefined on 404),
  `endSession`, `uploadSnapshot`, `listSnapshots`, `analyzeSnapshot`, `getIce`. Non-2xx
  throws `Error(body.error ?? "HTTP <status>")`. Exports the shared types `Part`,
  `AnalysisResult`, `SnapshotItem`, which must match the server schema in
  `live/server/src/vision/provider.ts`.
- `styles.css`: global dark layout only; no component styles.

## Subdirectories & System Boundaries

- agent: [`./agent/README.md`](./agent/README.md) - Agent console hooks (session, freeze
  tools, gallery) and the guidance `ControlSender`.
- customer: [`./customer/README.md`](./customer/README.md) - Customer session hook and the
  guidance `ControlReceiver`.
- components: [`./components/README.md`](./components/README.md) - Presentational React
  components: `VideoOverlay` (shared), `Toolbar`, `SessionPanel`, `Gallery`,
  `SuggestionLayer`.
- pages: [`./pages/README.md`](./pages/README.md) - Route screens `Agent` and `Customer`.
- hooks: [`./hooks/README.md`](./hooks/README.md) - `useOverlay`: element size, letterbox
  fit, pointer events to fractional points.
- overlay: [`./overlay/README.md`](./overlay/README.md) - Letterbox geometry and the canvas
  renderer for shapes and transients.
- protocol: [`./protocol/README.md`](./protocol/README.md) - The guidance message codec and
  frame chunking, shared by sender and receiver.
- rtc: [`./rtc/README.md`](./rtc/README.md) - `SignalClient` with reconnect and `Peer`
  over `RTCPeerConnection`.

## Global Invariants

- Guidance coordinates are fractions from 0 to 1 of the picture area; `decode` rejects
  anything else, and the overlay converts with `toFrac` and `toPx`.
- Every inbound data-channel message goes through `protocol/messages.decode` before use;
  every outbound send is a no-op when the channel is not open.
- The customer always creates the offer and the `control` data channel; the agent answers.
  Both sides build a new `Peer` for every offer and never reuse one after a reconnect.
- The agent shows `live` only when the peer is connected, the channel is open, and the
  first video frame arrived.
- Frozen frames are captured by the agent, sent as chunks, and shown identically on both
  sides; every replaced frozen `ImageBitmap` is closed.
- The server contracts (signaling messages, close codes, HTTP routes, analysis result) are
  tabled in `.claude/skills/live-protocol-contracts/references/contracts.md` and must change
  on both sides in one commit.

## Global Side Effects

- Network: WebSocket to `/ws`, HTTP to `/api/**`, WebRTC media and data to the peer, and
  STUN or TURN servers from `GET /api/ice`.
- Media devices: camera and microphone on the customer, microphone on the agent; a screen
  wake lock on the customer.
- Browser: canvas drawing, `ImageBitmap` creation, clipboard write for the session link,
  `window.__live` in non-production or with `?debug=1`.

## System Verification

- Run: `cd live/web && npx vitest run` (unit, jsdom)
- Run: `cd live && npm run build -w web` (type check and bundle)
- Run: `cd live && npm run test:e2e` (Playwright against the production build on port 3100)
