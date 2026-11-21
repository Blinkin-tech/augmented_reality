# rtc

## Overview
Browser-side transport for a live visual support session. `signalClient.ts` keeps a JSON
WebSocket to the signaling server open with exponential-backoff reconnect, and `peer.ts`
wraps one `RTCPeerConnection` whose offer/answer/ICE exchange rides on that signaling
socket. `backoff.ts` holds the reconnect timing policy. The session hooks
`../agent/useAgentSession.ts` and `../customer/useCustomerSession.ts` compose these two
classes; nothing in this folder renders UI.

## Interface
- `nextDelay(attempt: number): number` [backoff.ts:nextDelay] - `min(1000 * 2 ** attempt, 10000)` ms.
- `giveUp(elapsedMs: number): boolean` [backoff.ts:giveUp] - `true` once `elapsedMs >= 60000`.
- `type SignalMessage = { type: "offer" | "answer" | "ice"; [k: string]: unknown }` [signalClient.ts:SignalMessage].
- `type SignalStatus = "connecting" | "open" | "reconnecting" | "lost"` [signalClient.ts:SignalStatus].
- `interface SignalHandlers` [signalClient.ts:SignalHandlers] - required `onJoined(m)`, `onPeerJoined()`,
  `onPeerLeft()`, `onSignal(m: SignalMessage)`, `onEnded()`, `onStatus(s: SignalStatus)`; optional
  `onError?(message)`, `onClosed?(code, reason)`.
- `interface SignalOptions` [signalClient.ts:SignalOptions] - injectable `WebSocketImpl`, `now`,
  `setTimeoutImpl`, `clearTimeoutImpl` (defaults: global `WebSocket`, `Date.now`, `setTimeout`, `clearTimeout`).
- `class SignalClient` [signalClient.ts:SignalClient] - `constructor(url, handlers, opts = {})`,
  `send(m: object): void`, `close(): void`.
- `interface PeerOptions` [peer.ts:PeerOptions] - `role: "agent" | "customer"`, `iceServers: RTCIceServer[]`,
  `signal: SignalClient`, `onTrack(stream)`, `onControl(channel: RTCDataChannel)`, `onState(s: RTCPeerConnectionState)`.
- `class Peer` [peer.ts:Peer] - `constructor(o: PeerOptions)`, `start(local?: MediaStream): Promise<void>`,
  `handleSignal(m: { type: string; [k: string]: unknown }): Promise<void>`, `close(): void`.

## Invariants
- Constructing a `SignalClient` synchronously calls `onStatus("connecting")` and opens the first socket
  [signalClient.ts:SignalClient.constructor].
- Events from a socket that is no longer `this.ws` are ignored, so a superseded socket cannot fire handlers
  [signalClient.ts:SignalClient.connect].
- On `open`, `attempt` and `downSince` reset to 0 and `onStatus("open")` fires [signalClient.ts:SignalClient.connect].
- Inbound frames are `JSON.parse`d; unparseable frames are dropped silently. Dispatch is by `type`:
  `joined` -> `onJoined(m)`, `peer-joined`, `peer-left`, `error` -> `onError?.(m.message)`,
  `offer`/`answer`/`ice` -> `onSignal(m)`; any other `type` is ignored [signalClient.ts:SignalClient.connect].
- Close handling (skipped entirely after `close()`) [signalClient.ts:SignalClient.connect]:
  code `4000` -> `onEnded()`, no reconnect, `onClosed` is not called;
  codes `4001`-`4999` -> `onClosed?.(code, reason)` before any status change;
  code `4404` -> `onStatus("lost")`, no reconnect;
  everything else -> `downSince` is set on the first failure, `giveUp(now - downSince)` yields
  `onStatus("lost")` with no retry, otherwise `onStatus("reconnecting")` and a reconnect is scheduled after
  `nextDelay(attempt++)`. Code `4409` ("role taken") deliberately follows the normal retry path.
- `send` is a no-op unless the current socket `readyState` is `OPEN` (1); messages are not queued
  [signalClient.ts:SignalClient.send].
- `close()` sets `closed`, cancels any pending reconnect timer, and closes the socket only when its
  `readyState` is `CONNECTING` or `OPEN` [signalClient.ts:SignalClient.close].
- Role asymmetry [peer.ts:Peer.start, peer.ts:Peer.handleSignal]: the `customer` adds all local tracks,
  creates the ordered data channel named `"control"`, and sends the `offer`; the `agent` adds only local
  audio tracks plus a `recvonly` video transceiver and sends the `answer`. An `offer` is ignored by a
  customer and an `answer` is ignored by an agent.
- Every data channel, created or received, has `binaryType` set to `"arraybuffer"` before `onControl`
  [peer.ts:Peer.constructor, peer.ts:Peer.start].
- ICE candidates that arrive before `remoteDescription` is set are queued in `pending` and flushed in
  order right after `setRemoteDescription`; `addIceCandidate` failures are swallowed
  [peer.ts:Peer.handleSignal, peer.ts:Peer.flush, peer.ts:Peer.add].
- Outbound signaling shapes: `{ type: "ice", candidate: RTCIceCandidateInit }`, `{ type: "offer", sdp }`,
  `{ type: "answer", sdp }` [peer.ts:Peer.constructor, peer.ts:Peer.start, peer.ts:Peer.handleSignal].
- `Peer.close()` is idempotent (`closed` flag) and closes the data channel before the connection
  [peer.ts:Peer.close].

## Side Effects
- Opens WebSocket connections to the constructor `url` and re-opens them on a timer during reconnect
  [signalClient.ts:SignalClient.connect].
- Writes JSON strings to the socket [signalClient.ts:SignalClient.send].
- Creates an `RTCPeerConnection` with the supplied `iceServers`, adds tracks/transceivers, creates or
  accepts a data channel, and sets local/remote descriptions [peer.ts:Peer].
- Invokes the caller-supplied handler callbacks (`SignalHandlers`, `PeerOptions`); no storage or disk access.

## Verification
- Run: `cd live/web && npx vitest run` (unit tests in `../../test/backoff.test.ts` and `../../test/signalClient.test.ts`).
- End-to-end: `cd live && npm run test:e2e`.
