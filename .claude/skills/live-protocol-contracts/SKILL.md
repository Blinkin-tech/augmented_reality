---
name: live-protocol-contracts
description: "The contract map of the live visual support product and the method to verify it across boundaries: WebSocket signaling messages and close codes, the data-channel guidance messages and frame chunks, the HTTP API routes and bodies, and the analysis result schema. Use whenever a change touches a message, a route, a status code, a type shared by server and web, or a reconnect rule; and use for every QA pass. Both implementers and the QA agent read this."
---

# Live protocol contracts

The product has four seams. Each seam has a producer and a consumer in different files. A
change on one side without the other is the most common defect in this codebase, so read
both sides together, every time.

## The four seams

| Seam | Producer | Consumer | Table |
|---|---|---|---|
| Signaling over WebSocket | `live/server/src/signaling.ts` | `live/web/src/rtc/signalClient.ts` | `references/contracts.md` section 1 |
| Guidance over the data channel | `live/web/src/agent/controlSender.ts` | `live/web/src/customer/controlReceiver.ts`, both through `live/web/src/protocol/messages.ts` | section 2 |
| HTTP API | `live/server/src/routes/*.ts` | `live/web/src/api.ts` | section 3 |
| Analysis result | `live/server/src/vision/provider.ts` (zod) | `live/web/src/api.ts` types, `SuggestionLayer` | section 4 |

Read `references/contracts.md` for the exact messages, fields, codes, and constants. When a
contract changes, update that file in the same commit as the code.

## How to change a contract

1. Change the table in `references/contracts.md` first. Write the new message or field
   with its type and its range.
2. Change the producer and the consumer in the same task. If two agents own the two sides,
   the orchestrator schedules both and QA verifies the pair.
3. Add or update the codec test (`live/web/test/protocol.test.ts`) or the server validator
   test (`live/server/test/signaling.test.ts`) so the new shape is pinned.
4. List the change in the implementer report as a table: message, field, before, after.

## How to verify a seam (QA method)

For each seam the change touches, do all of these, and write one line per check in the
QA report:

- **Shape.** Extract what the producer sends. Extract what the consumer decodes or types.
  Compare field by field: names, casing, optional fields, number ranges.
- **Codes.** Compare status codes and close codes on both sides. The client must map every
  code the server emits.
- **State.** List the state transitions each side performs on connect, drop, rejoin, and
  end. Compare with the server slot rules. A transition one side performs and the other
  does not expect is a finding.
- **Timing.** Distinguish an immediate acknowledgement from the eventual result. The
  freeze flow has both: `freeze-end` is sent at once; `ack` arrives later.
- **Validation.** Confirm every inbound message on both sides goes through the validator
  (`parseClientSignal` on the server, `decode` in the web) before use.
- **Tests.** Confirm the pinned tests still assert the new shape. A test that only checks
  existence is not a contract test.

Report a boundary finding with both file locations, for example
`signaling.ts:53 sends 4409; signalClient.ts:70 treats 4409 as lost`.
