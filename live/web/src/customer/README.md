# live/web/src/customer

## Overview
Customer-page side of a live visual support session. `useCustomerSession` loads the session by
code, gates on camera consent, joins signaling, builds the `Peer`, and exposes the agent's
guidance for rendering. `ControlReceiver` is the pure (no DOM) receiver for agent control
messages: it tracks the frozen frame, persistent shapes and timed transients, reassembles
chunked freeze frames, and answers with `ack` / `resumed`. Message decoding lives in
`live/web/src/protocol/messages.ts`; chunk reassembly in `live/web/src/protocol/chunks.ts`;
transport in `live/web/src/rtc/`; REST calls in `live/web/src/api.ts`.

## Interface
- `interface ControlReceiverOptions { send(m: ControlMessage); now?; decodeImage?; onChange? }` `[controlReceiver.ts:ControlReceiverOptions]`
- `class ControlReceiver(o: ControlReceiverOptions)` with `state() -> { frozen, shapes, transients }` and
  `onMessage(data: string | ArrayBuffer) -> Promise<void>` `[controlReceiver.ts:ControlReceiver]`
- `type Phase = "loading" | "notfound" | "ended" | "consent" | "denied" | "active"` `[useCustomerSession.ts:Phase]`
- `type SessionEvent = "joined-peer" | "joined-alone" | "peer-joined" | "peer-left" | "ws-open"` `[useCustomerSession.ts:SessionEvent]`
- `nextAction(event, { connected })` -> `"connect" | "disconnect" | "none"` `[useCustomerSession.ts:nextAction]`
- `useCustomerSession(code)` -> `{ phase, status, lost, stream, remote, muted, start, toggleMute, end, view, state }`
  `[useCustomerSession.ts:useCustomerSession]`

## Invariants
- Binary channel data is appended to the pending `FrameAssembler`; with no pending freeze it is dropped. Strings
  that `decode` rejects are ignored `[controlReceiver.ts:ControlReceiver.onMessage]`.
- `freeze-start` replaces any pending assembly with `new FrameAssembler(bytes, chunks)` and does not fire
  `onChange`; unknown message types also do not fire it `[controlReceiver.ts:ControlReceiver.onMessage]`.
- `freeze-end` always clears `pending` and always sends exactly one `ack`: `ok: false` when there is no pending
  frame, the `frameId` differs, the assembler is not `done()`, or image decoding throws; `ok: true` only after
  `frozen` is set `[controlReceiver.ts:ControlReceiver.finishFreeze]`.
- `resume` clears `frozen`, `shapes` and `pending` and sends `{ t: "resumed" }`; `clear` empties `shapes` only
  and leaves `frozen` in place `[controlReceiver.ts:ControlReceiver.onMessage]`.
- `shape` appends; `pointer` adds a `#ffcc00` transient expiring after `POINTER_MS` (3000 ms); `arrow` adds a
  transient in the message color expiring after `ARROW_MS` (5000 ms) `[controlReceiver.ts:POINTER_MS]` `[controlReceiver.ts:ARROW_MS]`.
- `state()` prunes expired transients (`until > now`) in place before returning `[controlReceiver.ts:ControlReceiver.state]`.
- Default image decoding is `createImageBitmap` on an `image/jpeg` Blob; `decodeImage` and `now` are injectable
  for tests `[controlReceiver.ts:defaultDecode]`.
- `nextAction`: `joined-peer` and `peer-joined` -> `connect`, `peer-left` -> `disconnect`, `joined-alone` and
  `ws-open` -> `none`; the `connected` flag never blocks a rebuild `[useCustomerSession.ts:nextAction]`.
- `phase` starts at `loading`; `getSession` returning nothing or throwing -> `notfound`; `state === "ended"` ->
  `ended`; otherwise `consent`. A stale response after unmount or code change is ignored `[useCustomerSession.ts:useCustomerSession]`.
- `start` requests `environment`-facing video at ideal 1280x720 plus audio; `OverconstrainedError` retries with
  `{ video: true, audio: true }`; any other failure sets `phase` to `denied` without joining signaling `[useCustomerSession.ts:start]`.
- `connect` closes the previous `Peer` and resets `conn` to `new` before creating a fresh one `[useCustomerSession.ts:start]`.
- Raw status values are `waiting for agent`, `connecting`, `live`, `agent reconnecting`, `reconnecting`,
  `connection lost`, `ended`; `lost` is `status === "connection lost"` `[useCustomerSession.ts:useCustomerSession]`.
- Shown status appends `(closeReason)` when the socket reported a close reason, and `(relay may be needed)` when
  `phase === "active"` and status has not started with `live` or become `ended` within `TURN_HINT_MS` (20000 ms)
  `[useCustomerSession.ts:TURN_HINT_MS]`.
- Receiver replies are sent only while the data channel `readyState === "open"`, serialized with
  `JSON.stringify` `[useCustomerSession.ts:start]`.
- `view` and `state()` fall back to `{ frozen: null, shapes: [], transients: [] }` before a channel exists
  `[useCustomerSession.ts:useCustomerSession]`.

## Side Effects
- HTTP via `live/web/src/api.ts`: `getSession(code)` on mount/code change; `endSession(code)` from `end`
  `[useCustomerSession.ts:useCustomerSession]` `[useCustomerSession.ts:end]`.
- Opens a WebSocket `${ws|wss}://${location.host}/ws?role=customer&code=<code>` through `SignalClient`
  (`live/web/src/rtc/signalClient.ts`) and an `RTCPeerConnection` through `Peer` (`live/web/src/rtc/peer.ts`) `[useCustomerSession.ts:start]`.
- Requests camera and microphone with `getUserMedia`; stops all tracks on `stop` (unmount, `onEnded`, `end`);
  `toggleMute` flips audio `track.enabled` `[useCustomerSession.ts:start]` `[useCustomerSession.ts:toggleMute]`.
- Requests a screen wake lock (`navigator.wakeLock.request("screen")`), ignoring failure `[useCustomerSession.ts:start]`.
- Sends `ack` and `resumed` messages on the guidance data channel `[controlReceiver.ts:ControlReceiver.finishFreeze]`
  `[controlReceiver.ts:ControlReceiver.onMessage]`.
- Decodes JPEG bytes into an `ImageBitmap` `[controlReceiver.ts:defaultDecode]`.
- Schedules one `setTimeout` for the relay hint, cleared on phase/status change `[useCustomerSession.ts:useCustomerSession]`.
- Mutates React state (phase, status, streams, mute, slow, closeReason) and forces re-renders through
  `onChange` -> `bump` `[useCustomerSession.ts:start]`.

## Verification
- Run: `cd live/web && npx vitest run`
- Unit coverage for this folder: `live/web/test/controlReceiver.test.ts`, `live/web/test/customerSession.test.ts`.
- End-to-end: `cd live && npm run test:e2e`
