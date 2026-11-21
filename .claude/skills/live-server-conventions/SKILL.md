---
name: live-server-conventions
description: "How to change the live visual support server in live/server: the module map, where a new route or store goes, how config and the data folder work, the vision provider interface, the test and build commands, and the commit style. Use before any edit under live/server, including pilot features such as agent login, a customer queue, or session records. Not for the web app; use live-web-conventions for that."
---

# Live server conventions

The server is Node 22, TypeScript compiled to CommonJS, Express 4, and `ws` 8. It serves
the built web app, relays WebRTC signaling, stores snapshots, and runs the analyze endpoint.

## Module map

| File | Responsibility |
|---|---|
| `live/server/src/index.ts` | `startServer(config)`: builds the deps, listens, attaches signaling, runs the expiry and heartbeat timers, returns `{ server, store, close() }`. Starts only when run as the main module. |
| `live/server/src/app.ts` | `createApp(deps)`: the Express composition root. Mounts the API router and static files. |
| `live/server/src/config.ts` | `loadConfig(env)`: `PORT`, `PUBLIC_URL`, `TURN_*`, `ANTHROPIC_API_KEY`, `DATA_DIR`. |
| `live/server/src/sessions.ts` | `SessionStore`: in-memory sessions, codes, `end`, `expire`. |
| `live/server/src/signaling.ts` | WebSocket relay on `/ws`: join rules, slot ownership, heartbeat, message validation. |
| `live/server/src/protocol/signal.ts` | `parseClientSignal`: pure validator for offer, answer, ice. |
| `live/server/src/snapshots.ts` | `SnapshotStore`: JPEG files under `DATA_DIR/<code>/`. |
| `live/server/src/routes/*.ts` | One router per resource: `sessions`, `ice`, `snapshots`, `analyze`. |
| `live/server/src/vision/provider.ts` | `VisionProvider` interface, zod schemas, `selectProvider`. |
| `live/server/src/vision/mock.ts`, `claude.ts` | The two providers. |

## How to add things

- **A new route**: create `live/server/src/routes/<resource>.ts` that exports a router
  factory taking the deps it needs. Mount it in `app.ts`. Validate the body by hand or with
  zod. Return JSON errors as `{ error: string }` with the right status code.
- **A new store or service**: one module, one class, constructor takes its config. Add it to
  `AppDeps` in `app.ts` and build it in `startServer`. Keep the constructor free of disk or
  network work, so tests can build the app cheaply.
- **A contract change** (message, field, status code, close code): update the tables in the
  `live-protocol-contracts` skill in the same commit, and list the change in your report.
- **Pilot persistence** (agent accounts, queue, session records): add a storage interface
  first, with an in-memory implementation and tests, then the database implementation
  behind the same interface. The demo must keep working with no database configured.
- **Secrets**: read them from config only. Never log them. Never return provider error text
  to a client; map it to a fixed message.

## Commands

Run these from the repository root unless stated.

```bash
cd live/server && npx vitest run                 # all server unit tests
cd live/server && npx vitest run test/<name>.test.ts   # one file
cd live && npm run build -w server               # type check and compile
cd live && npm test                              # both packages
```

Do not use `npx vitest run -w server` from `live/`; it hangs under this Vitest version.

Tests start a real server on port 0 and talk HTTP and WebSocket to it. Pass a temp
`DATA_DIR` through `loadConfig({ ... })` in tests that write snapshots. Close the server in
`afterAll`, so Vitest exits.

## Style

- Write the failing test first. Then the code. Then run the file, then the full suite.
- Small files with one responsibility. A file over 200 lines is a signal to split.
- Commit messages: imperative, prefixed `live:`. One logical change per commit.
- Keep `live/README.md` true when a command, a variable, or a limit changes.
