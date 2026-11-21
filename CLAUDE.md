## Harness: live visual support

**Goal:** Reviewed, demonstrated changes to the live visual support product in `live/`, from
a design document to a pull request, toward the pilot (agent login, customer queue, session
records).

**Spec process:** EGM (Elephant-Goldfish Model plugin, project scope) — the orchestrator
activates `/egm:egm-brainstorm`, `/egm:egm-draft`, and `/egm:egm-review` for any work that
adds a capability or changes a contract; hand-back is an approved document under
`docs/designs/<feature>.md`; after implementation it runs `/egm:egm-drift-report docs/designs`.

**Issue tracking:** GitHub Issues on `Blinkin-tech/augmented_reality` — the orchestrator
pulls ready work with `gh api` on issues labeled `ready`, labels `in-progress` on claim, and
closes with a comment that names the pull request. Issues are disabled on the repository
until the owner enables them in the GitHub settings; the labels already exist.

**Entry point — applies to every prompt in this repo:** You MUST invoke the
`live-support-orchestrator` skill *before* responding to any request — new work, a
follow-up, a re-run, a question, or a change to a previous result. It is the single entry
point; do not craft a response outside it. The orchestrator decides what happens next: it
answers trivial or out-of-domain requests directly and runs the full team only when the
work warrants it.

**Change history:**
| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-11-21 | Initial setup | All | — |
