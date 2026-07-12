# Test Management

A walkthrough of TestPulse's core workflow: projects, test cases, suites, runs, and the execution board.

> **Security note**: as of this writing there is no authentication — anyone
> who can reach the API can do all of this. See
> [Deployment: security status](deployment.md#security-status).

## Projects

Everything lives inside a project. Create one from the home page (`/`) with just a name. Projects can be renamed and archived (a soft flag — archiving never deletes data) via the API (`PATCH /api/v1/projects/{id}`); the UI surfaces archived status but archiving itself is API-only in this release.

## Test cases and versioning

Open a project (`/projects/{id}`) to author test cases: title, and optionally description, steps, expected result, priority, and tags (steps/description/etc. are set via the API for now — the UI form covers title, matching the "thin authoring, polished execution" design; see [architecture.md](architecture.md)).

**Every edit creates a new version.** Click **Edit** on a case, change the title, **Save** — the case's version badge increments (`v1` → `v2`), and the old content is never lost; it's retrievable via `GET /api/v1/cases/{id}/versions`. This matters because of what happens next.

## Folders vs. suites — two independent groupings

Every case lives in exactly one **folder** — a project-level, nestable tree for organizing cases (like a filesystem), starting from an automatically-created root. Pick a folder when creating a case (defaults to root if you don't), or create a new one with the **New folder** form. Folders are deliberately independent of **suites**: moving a case to a different folder never changes which suites it belongs to, and vice versa — folders answer "where does this case live," suites answer "what should run together." (Browsing the full folder tree and moving cases between folders is coming with the navigation redesign; today's UI covers creating folders and assigning one at case-creation time.)

## Suites

Group related cases with a suite (**New suite** form on the project page). Add cases to a suite via the dropdown + **Add**; remove with the **Remove** button next to a case in the suite listing — removing from a suite never deletes the case itself, since suite membership is just an n:m relationship (`suite_cases`).

## Runs: version pinning in practice

Create a run (**New run** form) — it includes *all current test cases* in the project as of that moment. This is the versioning model made concrete:

```
  t0: create case "Login works"        → v1
  t1: create a run                     → run item pins v1
  t2: edit the case → "Login works v2" → v2 (case's current version)
  t3: open the run                     → still shows v1's content,
                                          with a "newer version exists" note
```

Nothing about the run silently changes when the case is edited later — what a tester executes is exactly what was pinned, forever. If you want the run to reflect the new content, create a new run.

## The run execution board

Open a run (`/runs/{id}`) — this is the one screen in TestPulse designed for heavy daily use.

- **Left**: the run's items, each with a status chip (`pending`, `pass`, `failed`, `skipped`, `blocked`, `retest`) and a "(newer version available)" hint when applicable.
- **Right** (after clicking an item): the pinned case's steps and expected result, a **Your name** / **Comment** form, and verdict buttons — **Pass**, **Failed**, **Blocked**, **Skipped**.
- Recording a verdict appends to that item's result log (visible as **History**) and updates its status immediately — the board reflects the change without needing to reselect the item.
- A **Retest** button appears on failed items; marking retest sets the item back to an executable state (`retest` status) without erasing the prior failure from history.

## Run summary

Each run page shows a live item count by status (e.g. "4 items — 2 pass, 1 failed, 1 pending"), backed by `GET /api/v1/runs/{id}/summary`. Deeper analytics (trends, flaky-test detection) arrive in `add-reporting` (v0.3) — see [ROADMAP.md](../ROADMAP.md).
