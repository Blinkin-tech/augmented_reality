# Tools registry

Agents and skills reference a tool by its **role**, never by a hard tool name. When the
preferred tool is unavailable, fall back to the alternative. Reviewed on the dates below.

| Role | Preferred tool | Alternative (if unavailable) | Status | Last reviewed |
|------|----------------|------------------------------|--------|---------------|
| spec-process | EGM plugin (`google/elephant-goldfish-model`), skills `/egm:egm-brainstorm`, `/egm:egm-draft`, `/egm:egm-review`, `/egm:egm-drift-report`; installed at project scope in `.claude/settings.json` | the `superpowers:brainstorming` and `superpowers:writing-plans` skills, with the spec saved under `docs/designs/` | active (cloud review support is partial; reviews need fresh subagents) | 2026-11-21 |
| issue-tracker | GitHub Issues through `gh api` REST on `Blinkin-tech/augmented_reality`; labels `ready`, `in-progress` | human-gated: emit the issue text and pause | pending: Issues are disabled on the repository until the owner enables them in GitHub settings; labels exist | 2026-11-21 |
| browser-automation | Playwright MCP (`@playwright/mcp@0.0.86`, project `.mcp.json`) | the repository's Playwright scripts: `npm run test:e2e` and `.claude/skills/live-demo-recording/scripts/record-demo.mjs` | active; cannot set fake-camera flags itself, so launch Chromium from the script for media tests | 2026-11-21 |
| webrtc-debugging | Chrome DevTools MCP (`chrome-devtools-mcp@1.13.0`, project `.mcp.json`) | `page.evaluate` on `RTCPeerConnection.getStats()` from Playwright; `chrome://webrtc-internals` by hand | active; WebRTC stats exposure unconfirmed | 2026-11-21 |
| turn-provider | Metered Open Relay (REST credential API; free tier limits vary by page) | coturn in Docker, command in `live/README.md` | registered, no account yet; the owner adds the key through environment secrets | 2026-11-21 |
| device-image-source | Roboflow Universe sets: `argenie/ethernet-ports`, `personal-projects-ii76p/router_led_detection`, `modem/vdsl3625-modem`, `techsee/netgearled`, `router/router-detection` | snapshots from own sessions under `DATA_DIR` | registered; check each set's license before use; no set-top-box set found | 2026-11-21 |
| typescript-lsp | the official `typescript-lsp` plugin from the Claude plugin directory, installed on a laptop with `/plugin` | `cd live && npm run build` for tsc diagnostics | laptop only; Claude Code does not start plugin language servers in cloud sessions | 2026-11-21 |
| demo-recording | Playwright `recordVideo` plus ffmpeg (`/usr/bin/ffmpeg`), see `live-demo-recording` | stills only (`page.screenshot`) | active | 2026-11-21 |

Declined on 2026-11-21 and not registered: Toxiproxy, CDP network emulation, Cloudflare
Realtime TURN.
