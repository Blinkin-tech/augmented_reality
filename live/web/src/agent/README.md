# live/web/src/agent

## Overview
Agent-console side of a live visual support session. `useAgentSession` owns the session
lifecycle (create, signal, peer, end) and composes `useFreezeTools` (freeze frame, shapes,
clear, resume) and `useGallery` (snapshots, analysis, "send part"). `ControlSender` encodes
guidance for the customer over the guidance data channel and keeps the agent's local copy of
what the customer sees. `captureFrame` turns the live `<video>` into a JPEG. Message encoding
lives in `live/web/src/protocol/messages.ts`; chunking in `live/web/src/protocol/chunks.ts`;
transport in `live/web/src/rtc/`; REST calls in `live/web/src/api.ts`.

## Interface
- `targetSize(w, h, maxLong = 1280)` -> `{ w, h }` `[captureFrame.ts:targetSize]`
- `captureJpeg(video, quality = 0.7)` -> `Promise<{ bytes: Uint8Array; w; h }>` `[captureFrame.ts:captureJpeg]`
- `POINTER_MS = 3000`, `ARROW_MS = 5000` `[controlSender.ts:POINTER_MS]` `[controlSender.ts:ARROW_MS]`
- `interface ControlChannel { send(d: string | ArrayBuffer); bufferedAmount; readyState? }` `[controlSender.ts:ControlChannel]`
- `class ControlSender(ch, { now?, onAck? })` with `isOpen()`, `pointer(x, y)`, `arrow(x1, y1, x2, y2, color)`,
  `shape(s: Shape)`, `clear()`, `resume()`, `freeze(jpeg, w, h) -> frameId | undefined`, `onMessage(raw)`,
  `local() -> { shapes, transients }`, public fields `lastAck`, `resumedAt` `[controlSender.ts:ControlSender]`
- `type AgentSession = { code; customerUrl }`, `type AgentEvent = "peer-joined" | "peer-left" | "offer" | "joined"`
  `[useAgentSession.ts:AgentSession]` `[useAgentSession.ts:AgentEvent]`
- `nextAction(event, { hasPeer })` -> `"connect" | "disconnect" | "none"` `[useAgentSession.ts:nextAction]`
- `shownStatus(status, ready, closeReason = "")` -> `string` `[useAgentSession.ts:shownStatus]`
- `useAgentSession()` -> `{ session, status, lost, stream, muted, newSession, toggleMute, end, note, channelOpen,
  setVideoReady, pointer, arrow, tools, gallery, view }` `[useAgentSession.ts:useAgentSession]`
- `interface Frozen { image: ImageBitmap; w; h }` `[useFreezeTools.ts:Frozen]`
- `useFreezeTools(sender, ui, videoEl)` -> `{ frozen, textPrompt, reset, setVideoEl, onAck, freeze, freezeBytes,
  resume, clear, pen, rect, text, openText, submitText, cancelText }` `[useFreezeTools.ts:useFreezeTools]`
- `shouldRefreeze(frozen, frozenSnapshotId, selectedId)` -> `boolean` `[useGallery.ts:shouldRefreeze]`
- `partRect([x, y, w, h])` -> `[[x, y], [min(1, x+w), min(1, y+h)]]` `[useGallery.ts:partRect]`
- `useGallery(code, videoEl, tools, setNote)` -> `{ items, selectedId, openId, setOpenId, analyzing, result, reset,
  select, snapshot, analyze, sendPart }` `[useGallery.ts:useGallery]`

## Invariants
- A message is sent only while the channel is open (`readyState` undefined or `"open"`); `freeze` returns
  `undefined` and sends nothing on a closed channel `[controlSender.ts:ControlSender.send]` `[controlSender.ts:ControlSender.freeze]`.
- Freeze wire order is `freeze-start` (frameId, bytes, chunks, w, h), then one binary `ArrayBuffer` per
  `splitFrame` chunk, then `freeze-end`; `frameId` is `` `f${now}-${seq}` `` with a per-sender counter `[controlSender.ts:ControlSender.freeze]`.
- `onMessage`: `ack` updates `lastAck` and calls `onAck`; `resumed` sets `resumedAt` and clears local shapes;
  anything else is ignored `[controlSender.ts:ControlSender.onMessage]`.
- `clear` and `resume` empty the local shape list; pointer transients expire after `POINTER_MS`, arrows after
  `ARROW_MS`; `local()` returns only transients with `until > now`; pointer color is `#ffcc00` `[controlSender.ts:ControlSender.live]`.
- `nextAction`: `peer-joined` and `offer` -> `connect`, `peer-left` -> `disconnect`, `joined` -> `none`; `hasPeer`
  is not consulted, so every offer gets a fresh `Peer` `[useAgentSession.ts:nextAction]` `[useAgentSession.ts:newSession]`.
- `shownStatus` reports `connecting` instead of `live` until `channelOpen && videoReady`; a non-empty
  `closeReason` is appended as `status (reason)` `[useAgentSession.ts:shownStatus]`.
- Raw status values are `no session`, `waiting for customer`, `connecting`, `live`, `customer reconnecting`,
  `reconnecting`, `connection lost`, `ended`; `lost` is `status === "connection lost"` `[useAgentSession.ts:useAgentSession]`.
- `connect` closes the previous `Peer` and drops the sender (resets freeze tools, `channelOpen=false`) before
  building a new one; `newSession` resets stream, mute, sender, note, close reason and gallery first `[useAgentSession.ts:newSession]`.
- If `createSession` fails the hook stops captured audio tracks and sets `connection lost` `[useAgentSession.ts:newSession]`.
- `onAck` ignores acks whose `frameId` differs from the pending freeze; `ok` -> status `live`; not ok -> frozen
  cleared, note `freeze failed, try again`, status `live` `[useFreezeTools.ts:onAck]`.
- `freeze` is a no-op while a freeze is in flight (`busy`); with no video element or closed sender it sets note
  `customer not connected`; any capture/send error sets note `freeze failed, try again` `[useFreezeTools.ts:freeze]`.
- `freezeBytes` throws `customer not connected` when the sender is missing/closed and `not sent` when
  `ControlSender.freeze` returns `undefined`; on success status becomes `sending frame` `[useFreezeTools.ts:freezeBytes]`.
- Replacing or dropping the frozen frame closes the previous `ImageBitmap`; unmount releases it `[useFreezeTools.ts:replaceFrozen]`.
- Shapes get `id` from `crypto.randomUUID()`; `rect` keeps only the first two points; `submitText` sends only a
  non-blank label and always closes the prompt `[useFreezeTools.ts:addShape]` `[useFreezeTools.ts:submitText]`.
- `shouldRefreeze` is true when not frozen or when the frozen snapshot differs from the selection `[useGallery.ts:shouldRefreeze]`.
- `analyze` results, errors and the `analyzing` flag are discarded when `select`/`reset` bumped `gen` after the
  call started; `sendPart` is a no-op without a selected item or while another send is in flight `[useGallery.ts:analyze]` `[useGallery.ts:sendPart]`.
- `snapshot` requires `code`, a video element and `videoWidth > 0` (else note `no video frame`); new items are
  prepended `[useGallery.ts:snapshot]`.
- `targetSize` caps the long side at `maxLong` (default 1280) and rounds; `captureJpeg` throws
  `video has no frame` on zero dimensions and `jpeg encode failed` when `toBlob` yields null `[captureFrame.ts:targetSize]` `[captureFrame.ts:captureJpeg]`.

## Side Effects
- Opens a WebSocket `${ws|wss}://${location.host}/ws?role=agent&code=<code>` through `SignalClient`
  (`live/web/src/rtc/signalClient.ts`) and an `RTCPeerConnection` through `Peer` (`live/web/src/rtc/peer.ts`) `[useAgentSession.ts:newSession]`.
- HTTP via `live/web/src/api.ts`: `createSession`, `endSession` `[useAgentSession.ts:newSession]` `[useAgentSession.ts:end]`;
  `uploadSnapshot`, `analyzeSnapshot` `[useGallery.ts:snapshot]` `[useGallery.ts:analyze]`; `fetch(item.url)` for the
  selected snapshot image `[useGallery.ts:sendPart]`.
- Requests the microphone with `getUserMedia({ audio: true })`; stops tracks on stop/failure; `toggleMute`
  flips `track.enabled` `[useAgentSession.ts:newSession]` `[useAgentSession.ts:toggleMute]`.
- Writes JSON strings and binary chunks to the guidance data channel `[controlSender.ts:ControlSender.send]` `[controlSender.ts:ControlSender.freeze]`.
- Creates an off-screen `<canvas>` and encodes JPEG with `toBlob` `[captureFrame.ts:captureJpeg]`; creates and closes
  `ImageBitmap`s `[useFreezeTools.ts:freezeBytes]` `[useGallery.ts:sendPart]`.
- Schedules `setTimeout` re-render bumps (`ms + 20`) for transient expiry, tracked and cleared on unmount `[useAgentSession.ts:expireAt]`.
- Mutates React state (status, note, stream, frozen, gallery items) and forces re-renders via `bump` `[useAgentSession.ts:useAgentSession]`.

## Verification
- Run: `cd live/web && npx vitest run`
- Unit coverage for this folder: `live/web/test/agentSession.test.ts`, `live/web/test/captureFrame.test.ts`,
  `live/web/test/controlSender.test.ts`, `live/web/test/gallery.test.ts`.
- End-to-end: `cd live && npm run test:e2e`
