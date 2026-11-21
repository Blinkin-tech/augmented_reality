# Changelog

One entry per delivered run, newest first. Each entry names the date, the issue when one
exists, the pull request, and what changed in one or two lines. The orchestrator appends
entries; people edit them freely.

## 2026-11-21

- Harness: added the documentation steps. Each run now appends an entry here and refreshes
  the per-folder READMEs for the source folders it touched. Seeded the per-folder READMEs
  under `live/server/src` and `live/web/src` with the EGM bootstrap. Added a code map to
  `live/README.md`. PR: [Blinkin-tech/augmented_reality#1](https://github.com/Blinkin-tech/augmented_reality/pull/1).
- Harness: added the agent harness under `.claude/` (server dev, web dev, QA, demo runner,
  orchestrator), the EGM plugin and two MCP servers at project scope, and the `CLAUDE.md`
  entry point. Labels `ready` and `in-progress` created on GitHub.
- Final review fix wave: the customer now hears the agent; the dev tunnel works and the
  README recommends tunneling the production server; a server-initiated end stops the
  camera; the agent rebuilds its peer on every offer; a server heartbeat frees dead slots
  and `role taken` retries; `live` shows only when the guidance channel is open and the
  first frame arrived; part boxes are clamped; a reload button appears on `connection lost`.
  Open item: a second tab on the same link retries every second instead of stopping after
  60 seconds.

## 2026-11-03

- Live visual support demo built from the design spec in 16 reviewed tasks: Node server
  (sessions, WebSocket signaling, snapshots, analyze endpoint with mock and Claude vision
  providers) and React web app (customer page with camera and audio, agent console with
  pointer, arrow, freeze frame, pen, rectangle, text, clear, resume, snapshot gallery,
  analyze suggestion layer). Unit tests in both packages, one Playwright end-to-end test,
  and `live/README.md` with the demo steps.

## 2026-11-02

- Design spec and implementation plan written under `docs/superpowers/` after a
  brainstorming session on the TechSee concept: a demo-scale live visual support tool with
  direct WebRTC, a TypeScript stack, and an AI extension point for device recognition.
