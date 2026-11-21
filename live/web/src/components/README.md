# components

## Overview

Presentational React components for the live visual support client. They render
the shared video-plus-annotation surface and the agent-side controls, and report
user intent through callback props. None of them talk to the network, WebRTC, or
the session store; the pages in `live/web/src/pages` wire them to the session
hooks in `live/web/src/agent` and `live/web/src/customer`. `VideoOverlay` is used
by both the agent and the customer; the other four are agent-only.

## Interface

- `VideoOverlay(props: VideoOverlayProps)` [VideoOverlay.tsx:VideoOverlay]
  - Props: `stream?: MediaStream`, `frozen?: { image; w; h } | null`,
    `shapes: Shape[]`, `transients: Transient[]`, `tool?: string`,
    `frameSize: { w; h }`, `muted?: boolean`, `onPointer?`, `onDrag?`, `onDraw?`,
    `onFrameSize?(size)`, `onVideoEl?(el)` [VideoOverlay.tsx:VideoOverlayProps].
  - Layers: a `<video>`, a still canvas for the frozen frame, and an overlay
    canvas drawn by `drawOverlay` (`live/web/src/overlay/renderer.ts`). Pointer
    geometry comes from `useOverlay` ([../hooks/README.md](../hooks/README.md)).
  - `Shape` is `live/web/src/protocol/messages.ts`; `Transient` is
    `live/web/src/overlay/renderer.ts`.
- `Toolbar(props: ToolbarProps)` and `type Tool = "pointer" | "arrow" | "pen" | "rect" | "text"`
  [Toolbar.tsx:Toolbar, Tool, ToolbarProps]. Callbacks: `onTool`, `onColor`,
  `onFreeze`, `onResume`, `onClear`, `onSnapshot`, `onAnalyze`, `onMute`, `onEnd`.
- `SessionPanel({ session?, onNew })` where `session = { code, customerUrl }`
  [SessionPanel.tsx:SessionPanel, SessionPanelProps].
- `Gallery(props: GalleryProps)` with `items: SnapshotItem[]`, `selectedId?`,
  `onSelect(id)`, `openId?`, `onOpen(id | undefined)`, `children?`, `busy?`
  [Gallery.tsx:Gallery, GalleryProps]. `SnapshotItem` is `live/web/src/api.ts`.
- `SuggestionLayer({ result: AnalysisResult, onSend(part: Part) })`
  [SuggestionLayer.tsx:SuggestionLayer]; the prop type is inline, not exported.
  `AnalysisResult` and `Part` are `live/web/src/api.ts`.
- Test hooks (`data-testid`): `tool-<name>`, `freeze`, `snapshot`, `analyze`
  [Toolbar.tsx]; `new-session`, `customer-link` [SessionPanel.tsx];
  `gallery-item` [Gallery.tsx]; `suggestion-part` [SuggestionLayer.tsx].
  ARIA: `aria-label="Color"` [Toolbar.tsx]; `role="dialog" aria-label="Snapshot"`,
  `role="progressbar" aria-label="Analyzing"`, `aria-label="Close"` [Gallery.tsx].

## Invariants

- Toolbar renders tools in the fixed order `pointer, arrow, pen, rect, text`
  [Toolbar.tsx:TOOLS]. `pen`, `rect`, and `text` are disabled while `frozen` is
  false [Toolbar.tsx:NEEDS_FREEZE]; every tool is disabled when `toolsDisabled`.
  `aria-pressed` is true only on the active tool. The freeze button calls
  `onResume` when `frozen`, else `onFreeze`. Analyze is disabled unless
  `canAnalyze` and not `analyzing` [Toolbar.tsx:Toolbar].
- VideoOverlay: when `frozen` is set, the frame dimensions come from
  `frozen.w/h` rather than `frameSize`, the video is hidden, and the still canvas
  is shown [VideoOverlay.tsx:frame]. The overlay canvas accepts pointer events
  only when `useOverlay` returned handlers (some callback prop was given)
  [VideoOverlay.tsx:handlers]. Both canvases are sized at
  `window.devicePixelRatio` [VideoOverlay.tsx:sizeCanvas]. `muted` defaults to
  `true`. The `requestAnimationFrame` loop runs only while some transient has
  `until > Date.now()`; otherwise one frame is drawn [VideoOverlay.tsx:alive, tick].
- Gallery: clicking an item that is already `selectedId` calls `onOpen(id)`;
  any other click calls `onSelect(id)`. The modal shows only when `openId`
  matches an item; the backdrop and Close call `onOpen(undefined)`, while clicks
  inside the image box do not close it. `children` render inside the
  relatively-positioned image box; `busy` adds the progress overlay
  [Gallery.tsx:Gallery].
- SuggestionLayer: `part.box` is `[left, top, width, height]` as fractions of the
  image, rendered as percentages. A missing `result.device` renders
  "Device not identified". Each part row has a Send button calling
  `onSend(part)` [SuggestionLayer.tsx:SuggestionLayer].
- SessionPanel renders the code, link, Copy, and QR only when `session` is set;
  the Copy handler assumes a session is present [SessionPanel.tsx:copy].

## Side Effects

- VideoOverlay assigns `video.srcObject` when it differs from `stream`; draws to
  the still canvas (`drawImage`) and overlay canvas (`drawOverlay`); schedules and
  cancels `requestAnimationFrame`; calls `video.play()` on `loadedmetadata` and
  swallows rejection; invokes `onFrameSize` on `loadedmetadata` and `resize`;
  invokes `onVideoEl` from the ref callback [VideoOverlay.tsx:VideoOverlay].
- SessionPanel writes `session.customerUrl` to `navigator.clipboard` and ignores
  failure [SessionPanel.tsx:copy]; renders a QR via `qrcode.react` `QRCodeSVG`;
  the customer link opens in a new tab [SessionPanel.tsx:SessionPanel].
- Toolbar, Gallery, and SuggestionLayer: none beyond invoking the callback props.
- No component performs network, storage, or media-device access.

## Verification

- Run: `cd live/web && npx vitest run`
- End-to-end: `cd live && npm run test:e2e`
