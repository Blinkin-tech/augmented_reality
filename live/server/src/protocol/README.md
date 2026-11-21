# protocol

## Overview

Wire-format parsing for the WebSocket signaling channel. `signal.ts` defines the
three client-to-server message shapes (SDP offer, SDP answer, ICE candidate) and a
tolerant parser that turns one raw text frame into a typed value or `undefined`.
The module has no imports; its only consumer is `../signaling.ts`, which forwards
the parsed value verbatim to the peer socket.

## Interface

- `ClientSignal` [signal.ts:ClientSignal] - discriminated union
  `{ type: "offer"; sdp: string } | { type: "answer"; sdp: string } | { type: "ice"; candidate: unknown }`.
- `parseClientSignal(raw: string): ClientSignal | undefined`
  [signal.ts:parseClientSignal] - `JSON.parse`s `raw` and narrows it to a
  `ClientSignal`, or returns `undefined` when the frame is not a recognised signal.

## Invariants

- The parser never throws: invalid JSON, non-object JSON, and `null` all return
  `undefined` [signal.ts:parseClientSignal].
- `offer` and `answer` are accepted only when `sdp` is a string; `ice` is accepted
  only when a `candidate` key is present (any value, including `null`)
  [signal.ts:parseClientSignal].
- The returned object is rebuilt from the recognised fields only; extra properties
  on the incoming message are dropped [signal.ts:parseClientSignal].
- Any other `type` value returns `undefined`; there are no server-to-client shapes
  in this module (those are built inline in `../signaling.ts`)
  [signal.ts:parseClientSignal].

## Side Effects

- None.

## Verification

- Run: `cd live/server && npx vitest run`
