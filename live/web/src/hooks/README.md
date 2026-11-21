# hooks

## Overview

Shared React hooks for the live visual support web client. The single hook here,
`useOverlay`, is the geometry and pointer-input layer under the annotation canvas:
it tracks the size of a container element, computes where the video picture sits
inside it (letterboxed "fit"), and converts raw pointer events into frame-relative
fractions in the range used by the control protocol. It has no knowledge of
sessions, WebRTC, or rendering; those live in `live/web/src/agent`,
`live/web/src/customer`, `live/web/src/rtc`, and `live/web/src/overlay`.

## Interface

- `useOverlay(box: RefObject<HTMLElement>, frame: { w; h }, input: OverlayInput)` ->
  `{ fit: Fit, size: { w; h }, handlers }` [useOverlay.ts:useOverlay]
  - `fit` is the picture rectangle inside the box, from
    `contentRect(size.w, size.h, frame.w, frame.h)` (`live/web/src/overlay/geometry.ts`).
  - `size` is the box's `clientWidth`/`clientHeight`.
  - `handlers` is either `{ onPointerDown, onPointerMove, onPointerUp }` or `{}`
    (see Invariants); spread it onto the element that should receive pointer input.
- `type Pt = [number, number]` - a frame-relative point, each axis a fraction
  [useOverlay.ts:Pt].
- `interface OverlayInput { tool?: string; onPointer?(fx, fy); onDrag?(from: Pt, to: Pt); onDraw?(points: Pt[]) }`
  [useOverlay.ts:OverlayInput].
- Consumed by `live/web/src/components/VideoOverlay.tsx`; see
  [../components/README.md](../components/README.md).

## Invariants

- `handlers` is the empty object unless at least one of `onPointer`, `onDrag`, or
  `onDraw` is provided; with no callbacks the hook attaches nothing
  [useOverlay.ts:handlers].
- Tool dispatch is by exact string value of `input.tool` [useOverlay.ts:onPointerDown,
  onPointerMove, onPointerUp]:
  - `"pointer"`: `onPointer(fx, fy)` fires on pointer down and on every move while
    the pointer is down.
  - `"arrow"`: `onDrag(start, end)` fires once on pointer up.
  - `"rect"`: `onDraw([start, end])` fires once on pointer up.
  - `"draw"`: every move point is accumulated; `onDraw(points)` fires on pointer up.
  - Any other value (including `undefined`) tracks the gesture but calls no callback.
    There is no `"pen"` or `"text"` tool at this layer; callers map those
    (see `live/web/src/pages/Agent.tsx`).
- Callbacks and `tool` are read from a ref at event time (`inputRef.current`), so
  the latest `input` is always used without rebinding handlers
  [useOverlay.ts:inputRef].
- Points are produced by `toFrac(x, y, fit)`; a pointer down or move that lands
  outside `fit` yields `undefined` and is ignored. On pointer up, an outside point
  falls back to the last tracked point, and nothing fires if no points were
  tracked [useOverlay.ts:at, onPointerUp].
- `fit` starts at the zero rectangle `EMPTY` and is recomputed whenever `size`,
  `frame.w`, or `frame.h` changes [useOverlay.ts:EMPTY].
- The gesture track is cleared on pointer up before any callback runs, so
  re-entrant calls see an empty gesture [useOverlay.ts:onPointerUp].

## Side Effects

- Creates a `ResizeObserver` on `box.current` and updates `size` on each resize;
  the observer is disconnected on cleanup or when `box` changes
  [useOverlay.ts:useEffect(ResizeObserver)].
- Calls `setPointerCapture(pointerId)` on the event target on pointer down when the
  platform supports it [useOverlay.ts:onPointerDown].
- Reads `getBoundingClientRect()` on the event target per pointer event
  [useOverlay.ts:at].
- React state updates only (`setSize`, `setFit`). No network, storage, or media
  access.

## Verification

- Run: `cd live/web && npx vitest run`
- End-to-end: `cd live && npm run test:e2e`
