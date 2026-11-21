---
name: live-web-conventions
description: "How to change the live visual support web app in live/web: the module map, the hook pattern with pure decision helpers, the guidance protocol and overlay geometry rules, test ids and the debug hook, and the unit, build, and end-to-end commands. Use before any edit under live/web, including pilot screens such as agent login, a queue view, or session history. Not for the server; use live-server-conventions for that."
---

# Live web conventions

The web app is Vite 5, React 18, TypeScript, and react-router 6. Two pages: the agent
console at `/agent` and the customer page at `/s/:code`.

## Module map

| Folder or file | Responsibility |
|---|---|
| `live/web/src/pages/Agent.tsx`, `Customer.tsx` | Thin pages. Layout and wiring only. |
| `live/web/src/agent/useAgentSession.ts` | Agent orchestration: session, signaling, peer, status, `nextAction` helper. |
| `live/web/src/agent/useFreezeTools.ts` | Freeze, shapes, text prompt, bitmap lifecycle. |
| `live/web/src/agent/useGallery.ts` | Snapshots, analyze, send part, `shouldRefreeze` helper. |
| `live/web/src/agent/controlSender.ts` | Encodes guidance messages and frame chunks; local shapes and transients. |
| `live/web/src/customer/useCustomerSession.ts` | Customer orchestration, `nextAction` helper, remote audio. |
| `live/web/src/customer/controlReceiver.ts` | Decodes guidance messages, assembles frozen frames, acks. |
| `live/web/src/rtc/signalClient.ts`, `peer.ts`, `backoff.ts` | WebSocket client with reconnect; RTCPeerConnection wrapper. |
| `live/web/src/protocol/messages.ts`, `chunks.ts` | The guidance message codec and the frame chunker. |
| `live/web/src/overlay/geometry.ts`, `renderer.ts` | Letterbox math and canvas drawing. |
| `live/web/src/components/*` | `VideoOverlay`, `Toolbar`, `SessionPanel`, `Gallery`, `SuggestionLayer`. |
| `live/web/src/api.ts` | All HTTP calls, with `fetchImpl` as the last parameter for tests. |
| `live/web/src/debugHook.ts` | `window.__live` for the end-to-end test; active with `?debug=1`. |

## Patterns to keep

- **Pure decision helpers.** Reconnect and freeze decisions live in exported pure functions
  (`nextAction`, `shouldRefreeze`, `targetSize`, `contentRect`). Test those with Vitest.
  Hooks stay thin and are proven by the end-to-end test.
- **Refs for live objects, state for the view.** Sockets, peers, and senders live in refs.
  A `bump` state update follows every mutation the view must show.
- **Every send checks the channel.** `ControlSender` sends nothing when `readyState` is not
  `open`. Status shows `live` only when the peer is connected, the channel is open, and the
  first video frame arrived.
- **A new Peer per offer.** Both sides build a fresh `RTCPeerConnection` for every offer.
  Never reuse one after a reconnect.
- **Fractions, not pixels.** Guidance coordinates are 0 to 1 of the picture area. Convert
  with `toFrac` and `toPx`; clicks in the letterbox bars are ignored.
- **Release bitmaps.** Every replaced or cleared frozen frame calls `close()` on its
  `ImageBitmap`.
- **Test ids.** Add `data-testid` to any control the end-to-end test clicks. Current ids:
  `new-session`, `customer-link`, `start-camera`, `status`, `video-overlay`, `tool-*`,
  `freeze`, `snapshot`, `analyze`, `gallery-item`, `suggestion-part`, `text-input`.
- **No new dependencies without a reason** stated in the report.

## Commands

```bash
cd live/web && npx vitest run                     # all web unit tests (jsdom)
cd live/web && npx vitest run test/<name>.test.ts # one file
cd live && npm run build -w web                   # type check and bundle
cd live && npm run test:e2e                       # Playwright; builds and starts the server on 3100
```

Do not use `npx vitest run -w web` from `live/`; it hangs. Never run `playwright install`;
the browser is at `/opt/pw-browsers/chromium` and the config points to it.

## Style

- Failing test first for every pure helper. Then the code. Then the full suite and the build.
- Keep pages under 120 lines and hooks under 220 lines. Split by concern when they grow.
- Commit messages: imperative, prefixed `live:`.
- Keep `live/README.md` true when a flow, a command, or a limit changes.
