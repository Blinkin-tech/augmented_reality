# protocol

## Overview
Wire format for the in-session `control` data channel. `messages.ts` defines the guidance
message union and a strict JSON codec; `chunks.ts` splits a frozen frame's bytes into
indexed binary chunks and reassembles them on the far side. Both modules are pure and
environment-free; the senders and receivers live in `../agent/controlSender.ts` and
`../customer/controlReceiver.ts`, and the overlay renderer in `../overlay/README.md`
consumes the `Shape` type.

## Interface
- `type ControlMessage` [messages.ts:ControlMessage] - discriminated on `t`:
  `pointer { x, y }`, `arrow { x1, y1, x2, y2, color }`,
  `freeze-start { frameId, bytes, chunks, w, h }`, `freeze-end { frameId }`,
  `shape { id, kind: "path" | "rect" | "text", points: [number, number][], color, text? }`,
  `clear`, `resume`, `ack { frameId, ok }`, `resumed`.
- `type Shape = Extract<ControlMessage, { t: "shape" }>` [messages.ts:Shape].
- `encode(m: ControlMessage): string` [messages.ts:encode] - `JSON.stringify`.
- `decode(raw: string): ControlMessage | undefined` [messages.ts:decode].
- `CHUNK_SIZE = 16384` [chunks.ts:CHUNK_SIZE].
- `splitFrame(bytes: Uint8Array): Uint8Array[]` [chunks.ts:splitFrame].
- `class FrameAssembler` [chunks.ts:FrameAssembler] - `constructor(expectedBytes, expectedChunks)`,
  `add(chunk: ArrayBuffer): void`, `done(): boolean`, `result(): Uint8Array | undefined`.

## Invariants
- `decode` never throws: invalid JSON, non-object input, an unknown `t`, or any failed field check
  returns `undefined` [messages.ts:decode].
- `decode` rebuilds a fresh object containing only the known fields for that `t`; extra fields on the
  wire are dropped [messages.ts:decode].
- Coordinates (`x`, `y`, `x1`..`y2`, every `points` entry) must be finite numbers in `[0, 1]`
  [messages.ts:frac]. `bytes`, `chunks`, `w`, `h` must be non-negative integers [messages.ts:count].
  `frameId` and shape `id` must be non-empty strings [messages.ts:id]; `color` and optional `text`
  must be strings [messages.ts:str].
- `shape.points` must be an array of two-element `[fx, fy]` tuples and `kind` one of
  `path | rect | text`; `text` is included on the decoded object only when present
  [messages.ts:decode].
- `clear`, `resume`, and `resumed` carry no payload; `ack.ok` must be a boolean [messages.ts:decode].
- Chunk layout: a 4-byte big-endian `uint32` chunk index followed by up to `CHUNK_SIZE - 4` (16380)
  payload bytes; an empty frame still produces exactly one chunk [chunks.ts:splitFrame].
- `splitFrame` copies payload into new buffers, so output chunks do not alias the input
  [chunks.ts:splitFrame].
- `FrameAssembler.add` ignores chunks shorter than the header and indices `>= expectedChunks`; a repeated
  index replaces the earlier part [chunks.ts:FrameAssembler.add].
- `add` stores a `Uint8Array` view over the caller's `ArrayBuffer`, not a copy; callers must not reuse or
  mutate that buffer afterwards [chunks.ts:FrameAssembler.add].
- `done()` is true when the part count equals `expectedChunks`; `result()` returns `undefined` if any
  index `0..expectedChunks-1` is missing or the concatenated length differs from `expectedBytes`
  [chunks.ts:FrameAssembler.done, chunks.ts:FrameAssembler.result].

## Side Effects
- None. All functions are pure; `FrameAssembler` mutates only its private `parts` map
  [chunks.ts:FrameAssembler]. No network, storage, or DOM access.

## Verification
- Run: `cd live/web && npx vitest run` (unit tests in `../../test/protocol.test.ts`).
- End-to-end: `cd live && npm run test:e2e`.
