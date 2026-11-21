# pages

## Overview

Route-level screens for the live visual support client: the agent console and
the customer camera view. Each page is a thin composition layer. It owns only
local UI state (active tool, color, measured frame size), takes all session,
media, and annotation state from one session hook (`useAgentSession` in
`live/web/src/agent`, `useCustomerSession` in `live/web/src/customer`), and
renders the components in `live/web/src/components`
([../components/README.md](../components/README.md)). Routing is set up in
`live/web/src/App.tsx`.

## Interface

- `Agent()` [Agent.tsx:Agent] - agent console. Composes `SessionPanel`,
  `VideoOverlay`, `Toolbar`, `Gallery`, and `SuggestionLayer` around
  `useAgentSession()`; local state is `tool: Tool` (default `"pointer"`),
  `color` (default `"#ffcc00"`), and `frame: { w; h }`.
- `Customer()` [Customer.tsx:Customer] - customer view. Reads `code` from
  `useParams()` (defaults to `""`), calls `useCustomerSession(code)`, and renders
  one screen per `s.phase`.
- Module-private copy: `CAMERA_TEXT` (camera refused guidance) and
  `CONSENT_TEXT` (consent notice) [Customer.tsx:CAMERA_TEXT, CONSENT_TEXT].
- Test hooks (`data-testid`): `status`, `video-overlay`, `text-input`
  [Agent.tsx]; `start-camera` [Customer.tsx]. ARIA: `role="status"` on both
  pages; `aria-label="Gallery"`, `aria-label="Text"` [Agent.tsx].

## Invariants

- Agent maps the toolbar tool to the overlay tool: `pen` -> `"draw"`,
  `text` -> `"pointer"`, others pass through; the overlay receives `undefined`
  (no gestures dispatched) unless `a.channelOpen`, and the toolbar's tools are
  disabled on the same condition [Agent.tsx:overlayTool, Toolbar props].
- Agent resets `pen`/`rect`/`text` back to `pointer` whenever `t.frozen` becomes
  false [Agent.tsx:useEffect(t.frozen)].
- Agent resets `frame` to `0x0` when `a.stream` is absent and reports
  `a.setVideoReady(frame.w > 0 && frame.h > 0)` on every frame-size change
  [Agent.tsx:useEffect(a.stream), useEffect(frame)].
- Agent gesture routing: `onPointer` is `t.openText` when the tool is `text`,
  else `a.pointer`; `onDrag` -> `a.arrow(from, to, color)`; `onDraw` ->
  `t.rect(pts, color)` for `rect`, else `t.pen(pts, color)` [Agent.tsx:VideoOverlay props].
- Agent text entry: the input appears only while `t.textPrompt` is set, placed
  at its fractional `x`/`y`; Enter calls `t.submitText(value, color)`, Escape
  calls `t.cancelText()` [Agent.tsx:text-input].
- Agent: `canAnalyze` is `!!g.selectedId`; the gallery `busy` flag and toolbar
  `analyzing` both mirror `g.analyzing`; `SuggestionLayer` renders only while
  `g.result` is set and sends via `g.sendPart(part, color)`; the agent's
  `VideoOverlay` is rendered with `muted={false}` [Agent.tsx:Agent].
- Customer phase screens are checked in this order: `loading`, `notfound`,
  `ended`, `denied`, `consent`; any other phase renders the active camera view
  [Customer.tsx:Customer]. The consent screen is the only place `s.start` is
  called (the "Start camera" button).
- Customer renders `VideoOverlay` muted, with `frozen={s.view.frozen}` and no
  gesture callbacks, so the customer surface is display-only [Customer.tsx:VideoOverlay].

## Side Effects

- Both pages call `installDebugHook(...)` (`live/web/src/debugHook.ts`) in an
  effect with no dependency array, so it runs after every render. Agent exposes
  `status` and `gallery` getters; Customer exposes `state`
  [Agent.tsx:useEffect(installDebugHook), Customer.tsx:useEffect(installDebugHook)].
- Both pages render a Reload button when the session hook reports `lost`, which
  calls `location.reload()` [Agent.tsx, Customer.tsx].
- Customer assigns `s.remote ?? null` to the `<audio>` element's `srcObject`
  whenever `s.remote` or `s.phase` changes [Customer.tsx:useEffect(audio)].
- All network, signaling, WebRTC, media-device, snapshot, and analysis effects
  are delegated to `useAgentSession` / `useCustomerSession` and are documented
  with those modules, not here.

## Verification

- Run: `cd live/web && npx vitest run`
- End-to-end: `cd live && npm run test:e2e`
