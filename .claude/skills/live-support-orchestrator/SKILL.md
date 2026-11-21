---
name: live-support-orchestrator
description: "Entry point for all work on the live visual support product in this repo (the live/ folder and its design docs) — invoke before responding to any request here. Coordinates the server developer, the web developer, the QA verifier, and the demo runner, hands design to the EGM spec process, and tracks work in GitHub Issues. Keywords: feature, bug, fix, pilot, agent login, queue, session records, signaling, WebRTC, overlay, analyze, demo, record, README. Also use for follow-ups: re-run, run again, update, modify, supplement, improve the previous result, only the server again, only the web again, based on the previous result, and everyday requests such as 'make the pointer bigger' or 'why does the phone disconnect'."
model: inherit
---

# Live support orchestrator

Coordinates the agents that change, verify, and demonstrate the live visual support
product. The deliverable of a run is a reviewed change on a branch, with a pull request
and an issue update.

## Execution mode: subagent

Agents run through the `Agent` tool. Results come back as return values and as files under
`_agents_workspace/`. No agent talks to another; the orchestrator passes files between them.
If team tools exist in a future session, this orchestrator still runs in subagent mode; the
work does not need live exchange.

## Agents

| Agent | subagent_type | Role | Skill | Output |
|-------|---------------|------|-------|--------|
| live-server-dev | `live-server-dev` | changes under `live/server` | `live-server-conventions`, `live-protocol-contracts` | commits + `_agents_workspace/{NN}_server_report.md` |
| live-web-dev | `live-web-dev` | changes under `live/web` | `live-web-conventions`, `live-protocol-contracts` | commits + `_agents_workspace/{NN}_web_report.md` |
| live-qa | `live-qa` | cross-boundary verification | `live-protocol-contracts` | `_agents_workspace/{NN}_qa_report.md` |
| live-demo-runner | `live-demo-runner` | build, e2e, recording | `live-demo-recording` | `_agents_workspace/demo/...` + `_agents_workspace/{NN}_demo_report.md` |

Tools are referenced by role from `references/tools.md`. Read it at the start of a run.

## Workflow

### Phase 0: intake and triage  (always entered first; this skill is the repo entry point)

This skill runs for every prompt. Triage before anything else:

- Trivial, conversational, or outside the live support product (for example a question
  about the old C++ folders) → answer directly, or take the obviously small action, and
  stop. Do not create `_agents_workspace/` and do not spawn agents.
- A question about the code → answer it from the files, with `file:line`, and stop.
- In-domain work (a feature, a bug, a pilot capability, a demo run, a README change) → run
  the context check and continue.

**Context check**, in-domain work only:
- `_agents_workspace/` absent → initial run; go to Phase 1.
- `_agents_workspace/` present and the request changes part of the previous result
  ("only the web again", "fix the QA finding") → partial re-run; re-invoke only the affected
  agent with its prior report path in the prompt, then continue from Phase 4.
- `_agents_workspace/` present and the request is new work → move the old folder to
  `_agents_workspace/archive/{YYYYMMDD_HHMMSS}/`, then go to Phase 1.
- On the first run ever, add `_agents_workspace/` to `.gitignore` if it is not there.

**Issue tracking (GitHub Issues, auto-invokable through `gh api` REST):**
- Query ready work:
  `gh api -X GET "repos/Blinkin-tech/augmented_reality/issues?state=open&labels=ready&per_page=20" -q '.[] | "\(.number) \(.title)"'`
  If an item matches the request, carry its number through the run.
- New work: create the issue first, so the tracker owns the state from the start:
  `gh api -X POST repos/Blinkin-tech/augmented_reality/issues -f title="<title>" -f body="<goal and acceptance>" -f "labels[]=ready" -q .number`
- Claim it: `gh api -X PUT repos/Blinkin-tech/augmented_reality/issues/<n>/labels --input - <<< '{"labels":["in-progress"]}'`
- If the API answers 410 or the repository reports `has_issues: false`, Issues are still
  disabled. Tell the user to enable Issues in the GitHub repository settings, continue the
  run without an issue number, and say so in the summary. Never keep a status file of your
  own; the tracker is the single owner of work state.
- Pure demo runs and README fixes need no issue.

**Spec process (EGM plugin, semi-auto):** → SDD: EGM
- Decide if the request needs design. It does when it adds a capability, changes a
  contract, or touches the pilot scope (agent login, queue, session records). A bug fix or
  a demo run does not.
- If design is needed and no approved document exists under `docs/designs/<feature>.md`,
  hand in to EGM with a contextual prompt built from the goal, the constraints you hold
  (the contract map, the README limits), and the issue number:
  1. `/egm:egm-brainstorm` with the goal → `concepts_brief.md`.
  2. `/egm:egm-draft` from the brief → `design_draft.md`, section by section with the user.
  3. `/egm:egm-review design_draft.md` → fresh reviewers; the user picks the fixes.
  4. When the user approves, save it as `docs/designs/<feature>.md` and commit it.
  EGM reviews need fresh subagents. If the environment cannot spawn them, EGM stops; then
  emit the review prompt to the user and pause.
- If the document exists, treat it as the input contract. Reference it by path; never copy
  it into `_agents_workspace/`.
- Earlier designs under `docs/superpowers/specs/` are history. New designs go to
  `docs/designs/`.

### Phase 1: prepare  (orchestrator-owned)
1. Create `_agents_workspace/` and save the request as `_agents_workspace/00_input.md`
   with the issue number and the design path in its header.
2. Split the work into a server part and a web part. Write one brief per part:
   `_agents_workspace/01_server_brief.md`, `_agents_workspace/01_web_brief.md`. Each brief
   holds the goal, the acceptance checks, the contract changes (from the design), and the
   files expected to change. A part with no work gets no brief.
3. Record the base commit: `git rev-parse HEAD`.

### Phase 2: implement in parallel  (orchestrator-owned)
Invoke the implementers in one message, each with `run_in_background: true`:

| Agent | Input | Output | model | run_in_background |
|-------|-------|--------|-------|-------------------|
| live-server-dev | `01_server_brief.md`, design path, issue number | `02_server_report.md` + commits | inherit | true |
| live-web-dev | `01_web_brief.md`, design path, issue number | `02_web_report.md` + commits | inherit | true |

When a contract changes, tell both agents the exact new shape in both briefs, so the two
sides land together. Wait for both results.

### Phase 3: verify  (orchestrator-owned)
Invoke `live-qa` with the two reports, the design path, and the git range from the base
commit to HEAD. It writes `03_qa_report.md`. On `Needs fixes`: send the Critical and
Important findings verbatim to the responsible implementer, wait, then re-run QA on the fix
range. Cap at three rounds; after that, list the open findings to the user and ask.

### Phase 4: demonstrate  (orchestrator-owned)
When the change touches the call flow or the user asked for a demo, invoke
`live-demo-runner`. It writes the video and `04_demo_report.md`. A failed end-to-end test
sends the run back to Phase 3 with the failing step as a finding.

### Phase 5: integrate and finish  (orchestrator-owned)
1. Run the full check once more: `cd live && npm test && npm run build`.
2. Drift check: `/egm:egm-drift-report docs/designs` when a design exists for this work.
   Reconcile each difference: update the document or open a follow-up issue. Never
   rewrite human-authored design prose silently.
3. Keep `live/README.md` true for any command, variable, or limit that changed.
4. Push the branch and open or update the pull request with `gh api` (REST; `gh pr`
   fails here). Attach the demo video path and the QA verdict in the body.
5. Write status back to the issue:
   `gh api -X POST repos/Blinkin-tech/augmented_reality/issues/<n>/comments -f body="Done in <PR url>. QA: <verdict>. Demo: <path>."`
   then close it: `gh api -X PATCH repos/Blinkin-tech/augmented_reality/issues/<n> -f state=closed`.
   Never delete issues; never rewrite human-authored issue text.
6. Keep `_agents_workspace/`. Report a summary: what changed, test results, QA verdict,
   PR link, issue link, open items.

## Data passing
- Return-value-based for each agent's short status.
- File-based for everything else, under `_agents_workspace/` with the numbered names above.
- Design documents and issues are referenced by path or number, never copied.

## Error handling

| Situation | Strategy |
|-----------|----------|
| One implementer fails | retry once with its own report path; on a second failure continue with the other part, note the gap, and ask the user |
| Both implementers fail | stop; tell the user with both reports |
| QA cannot run a suite | treat as `Needs fixes` unless the cause is environmental; then say so and continue |
| QA loop reaches three rounds | stop; list open findings; ask the user |
| EGM review cannot spawn reviewers | emit the review prompt; pause for the user |
| `gh api` denied or Issues disabled | continue without the tracker; report the exact error and the manual step |
| Demo fails | back to Phase 3 with the failing step; do not ship a broken call flow |
| Agents disagree on a contract | QA's reading of `references/contracts.md` wins; record both views in the summary |

## Test scenarios
- **Normal:** "Add a 'customer is typing' indicator" → Phase 0 creates an issue; the design
  is small, so EGM brainstorm and draft produce `docs/designs/typing-indicator.md`; Phase 2
  runs server and web in parallel; Phase 3 QA checks the new data-channel message on both
  sides; Phase 4 records the demo; Phase 5 opens the PR, closes the issue.
- **Partial re-run:** "QA said the web side drops the message; fix only that" → Phase 0 finds
  `_agents_workspace/`; re-invokes `live-web-dev` with `02_web_report.md`; QA re-runs on the
  fix range; continues from Phase 4.
- **Error:** the web implementer reports `BLOCKED` on a Playwright race → the orchestrator
  retries once with the report path; on a second block it asks the user whether to accept
  the race as a known limit or to redesign the status gating; the server part still goes
  through QA.
- **Triage:** "What does close code 4409 mean?" → answered from
  `live-protocol-contracts/references/contracts.md` with the line; no workspace, no agents.
