# overlay

## Overview
Canvas annotation layer drawn over the video element. `geometry.ts` computes the
letterboxed picture rectangle (`object-fit: contain`) and converts between element pixels
and picture fractions, so annotations are exchanged as resolution-independent `[0, 1]`
coordinates. `renderer.ts` paints persistent `Shape` annotations (from
`../protocol/README.md`) and short-lived pointer/arrow `Transient`s onto a 2D context.
Consumers: `../hooks/useOverlay.ts`, `../components/VideoOverlay.tsx`,
`../agent/controlSender.ts`, `../customer/controlReceiver.ts`.

## Interface
- `type Fit = { x: number; y: number; w: number; h: number }` [geometry.ts:Fit].
- `contentRect(elementW, elementH, frameW, frameH): Fit` [geometry.ts:contentRect].
- `toFrac(px, py, fit): [number, number] | undefined` [geometry.ts:toFrac].
- `toPx(fx, fy, fit): [number, number]` [geometry.ts:toPx].
- `type Transient = { kind: "pointer" | "arrow"; until: number; pts: [number, number][]; color: string }`
  [renderer.ts:Transient].
- `drawOverlay(ctx: CanvasRenderingContext2D, fit: Fit, shapes: Shape[], transients: Transient[], now: number): void`
  [renderer.ts:drawOverlay].
- Module-private helpers `drawArrow`, `drawShape` and constants `POINTER_COLOR = "#ffcc00"`,
  `POINTER_RADIUS = 24`, `POINTER_STROKE = 3`, `ARROW_STROKE = 4`, `ARROW_HEAD = 14`, `TEXT_PAD = 4`
  [renderer.ts] are not exported.

## Invariants
- `contentRect` returns the zero rect `{0, 0, 0, 0}` when any input is non-finite or `<= 0`; otherwise
  `scale = min(elementW / frameW, elementH / frameH)` and the picture is centred in the element
  [geometry.ts:contentRect].
- `toFrac` returns `undefined` when `fit.w <= 0`, `fit.h <= 0`, or the pixel lies outside the picture
  (bounds inclusive); results are fractions in `[0, 1]` [geometry.ts:toFrac].
- `toPx` is the inverse of `toFrac` with no clamping; out-of-range fractions map outside the picture
  [geometry.ts:toPx].
- `drawOverlay` clears the whole canvas first, then draws `shapes` in array order, then `transients`
  [renderer.ts:drawOverlay].
- A transient is skipped when `until <= now`; expiry is decided by the caller-supplied clock, nothing in
  this folder reads `Date.now` [renderer.ts:drawOverlay].
- Minimum points, otherwise the item is skipped silently: `path` and `rect` shapes need `>= 2`
  (`rect` uses the first two, normalised to top-left and absolute size), `text` needs `>= 1` and a
  non-empty `text`; `pointer` needs `>= 1` (circle at `pts[0]`), `arrow` needs `>= 2` (from `pts[0]` to the
  last point) [renderer.ts:drawShape, renderer.ts:drawOverlay].
- Shape and transient points are fractions converted with `toPx(fit)`; the renderer does not validate
  ranges (validation happens in `decode` of the protocol package) [renderer.ts:drawShape].
- Fixed styling: shapes stroke at width 3 in `s.color`; text is `bold 20px sans-serif`, white on a
  `rgba(0,0,0,0.6)` box padded by `TEXT_PAD`; pointer is a `#ffcc00` ring of radius 24; arrow uses
  `t.color` with a filled 14px head [renderer.ts:drawShape, renderer.ts:drawOverlay, renderer.ts:drawArrow].

## Side Effects
- `drawOverlay` draws on `ctx.canvas` and leaves `strokeStyle`, `fillStyle`, `lineWidth`, `lineCap`,
  `lineJoin`, `font`, and `textBaseline` modified; it does not `save()`/`restore()` the context
  [renderer.ts:drawOverlay, renderer.ts:drawShape, renderer.ts:drawArrow].
- `geometry.ts` is pure: no DOM, timer, network, or storage access.

## Verification
- Run: `cd live/web && npx vitest run` (unit tests for `geometry.ts` in `../../test/geometry.test.ts`;
  `renderer.ts` has no dedicated unit test in `live/web/test` and is covered only by the end-to-end run).
- End-to-end: `cd live && npm run test:e2e`.
