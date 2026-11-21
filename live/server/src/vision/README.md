# vision

## Overview

Image-analysis providers behind a single `VisionProvider` interface. `provider.ts`
owns the zod (`zod/v4`) schemas for the analysis result and the `selectProvider`
switch; `claude.ts` implements the interface against the Anthropic Messages API
with structured output; `mock.ts` returns a fixed demo result when no API key is
configured. `../routes/analyze.ts` is the only caller of `analyze`.

## Interface

- `PartSchema` [provider.ts:PartSchema] - `{ label: string; kind: "port" | "button" | "led" | "display" | "other"; box: [number, number, number, number]; confidence: number }`.
- `AnalysisOutputSchema` [provider.ts:AnalysisOutputSchema] - `{ device: { brand, model, confidence } | null; parts: Part[]; notes: string }`.
- `AnalysisResultSchema` [provider.ts:AnalysisResultSchema] - `AnalysisOutputSchema` plus `provider: string`.
- Types `Part`, `AnalysisOutput`, `AnalysisResult` inferred from the schemas
  [provider.ts:Part] [provider.ts:AnalysisOutput] [provider.ts:AnalysisResult].
- `VisionProvider { name: string; analyze(image: Buffer, mime: "image/jpeg"): Promise<AnalysisResult> }`
  [provider.ts:VisionProvider]
- `selectProvider(config: Config): VisionProvider` [provider.ts:selectProvider]
- `class ClaudeVisionProvider implements VisionProvider` [claude.ts:ClaudeVisionProvider]
  - `constructor(client: MessagesClient, model = "claude-opus-5-5")`; `name = "claude"`.
- `class MockVisionProvider implements VisionProvider` [mock.ts:MockVisionProvider]
  - `name = "mock"`.

## Invariants

- `box` is a 4-tuple and every element, plus `confidence`, is bounded to `[0, 1]`;
  `device` is nullable; `kind` is restricted to the five enum values
  [provider.ts:PartSchema] [provider.ts:AnalysisOutputSchema].
- `selectProvider` returns `ClaudeVisionProvider` when `config.anthropicApiKey` is
  set and `MockVisionProvider` otherwise [provider.ts:selectProvider].
- `ClaudeVisionProvider.analyze` sends one `beta.messages.create` request with
  `max_tokens: 4096`, `betas: ["server-side-fallback-2026-07-01"]`,
  `fallbacks: "default"`, `system: SYSTEM_PROMPT`,
  `output_config.format = zodOutputFormat(AnalysisOutputSchema)`, and a single
  user message holding the base64 image followed by `INSTRUCTION`
  [claude.ts:ClaudeVisionProvider.analyze].
- `ClaudeVisionProvider.analyze` rejects with exactly one of three messages:
  `"vision provider error"` (the API call threw), `"analysis refused"`
  (`stop_reason === "refusal"`), or `"invalid analysis output"` (no text block or
  `AnalysisOutputSchema.parse` failed) [claude.ts:ClaudeVisionProvider.analyze].
- A successful Claude result is `AnalysisOutputSchema.parse(JSON.parse(text))`
  spread with `provider: this.name`; unvalidated model output is never returned
  [claude.ts:ClaudeVisionProvider.analyze].
- `MockVisionProvider.analyze` ignores its inputs, waits `DELAY_MS = 300`, and
  returns a fixed `Demo` / `Router X1` device with three parts and the note
  `"Mock result. Set ANTHROPIC_API_KEY for real analysis."` [mock.ts:DELAY_MS]
  [mock.ts:MockVisionProvider.analyze].
- `MessagesClient` is the narrow type `{ beta: { messages: Pick<..., "create"> } }`,
  so tests can inject a stub instead of a real SDK client [claude.ts:MessagesClient].

## Side Effects

- `ClaudeVisionProvider.analyze` makes an outbound network call to the Anthropic
  Messages API through the injected client [claude.ts:ClaudeVisionProvider.analyze].
- `selectProvider` instantiates `new Anthropic({ apiKey })` when a key is present;
  no network traffic occurs until `analyze` is called [provider.ts:selectProvider].
- `MockVisionProvider.analyze` schedules a 300 ms `setTimeout` [mock.ts:MockVisionProvider.analyze].

## Verification

- Run: `cd live/server && npx vitest run`
