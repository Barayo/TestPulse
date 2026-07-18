# Test Management

A walkthrough of TestPulse's core workflow: projects, test cases, suites, runs, and the execution board.

> **Security note**: as of this writing there is no authentication — anyone
> who can reach the API can do all of this. See
> [Deployment: security status](deployment.md#security-status).

## Finding your way around

TestPulse assumes you work in one project at a time. The header shows `TestPulse › {active project}`: the project name is a direct link to that project's own page, and — once your account has more than one project — a small switch icon next to it (or **⌘K**/**Ctrl+K** from anywhere) opens a searchable palette listing every other project with its suite/case counts and latest pass rate. The palette closes on Escape or an outside click, like any command palette.

A project's landing page (`/projects/{id}`) opens with a summary strip — the same status pill/pass-rate bar/suite+case totals/last-run shown on the project's card in the project list — so the health signal you used to pick this project is still there once you're inside it, instead of only living on the list you came from. Below that are three independent panels — **Library**, **Suites**, **Recent runs** — each showing its top few items with a "see all" link to the full view, so opening a project shows top-level structure at a glance rather than everything at once. Each panel's entire header (not just "see all") is clickable to the same destination, and every row shown is itself a direct link to that item — never just a name. Recent runs rows are color-coded by pass rate (the same teal/amber/coral bands used elsewhere), so a failing run stands out without opening it. Each panel has its own empty state (with a working link to its full page) when a project has nothing in it yet — except when the *whole project* is empty (no cases, no suites, no runs at all), in which case the three panels are replaced by a single **Get started** checklist: three steps (add a case, group it into a suite, run the suite), each with an icon and a short explanatory tip, so a brand-new project reads as an onboarding flow rather than three empty boxes. A breadcrumb trail at the top of the main content (`Projects › {project} › …`) reinforces where you are, with every ancestor segment clickable to go back up — including intermediate section names when browsing nested sections.

## Projects

Everything lives inside a project. Create one from the home page (`/`): click **+ New project**, or **+ Create your first project** if none exist yet. Projects can be renamed and archived (a soft flag — archiving never deletes data) via the API (`PATCH /api/v1/projects/{id}`); the UI surfaces archived status but archiving itself is API-only in this release. **+ New project** lives in its own header row, separate from the project list, so a future role gate (`add-project-rbac`) can hide it for non-admins without a layout change.

The project list can be ordered by name, suite count, case count, or creation date, in either direction, via the **Sort by** control in the toolbar — the choice is remembered in your browser across visits, applies the same way in both view modes, and stays available on mobile.

## The library

Click "see all"/"go to Library" on the landing's Library panel (or any row shown there) to open the explorer: a section tree on the left for navigation, and the selected section's direct contents — subsections *and* any cases that live directly in it — on the right. This two-pane layout is deliberate: a single indented tree breaks down once a section has real content (tens of cases), while splitting "where am I" from "what's here" scales without a redesign.

Every case lives in exactly one **section** — a project-level, nestable tree, starting from an automatically-created root labeled **Library** in the UI (the root always exists and can't be deleted or renamed; that "Library" label is purely how it's displayed, not a separate concept to manage). Create a subsection two ways, both with no "parent" field to fill in (the parent is always wherever you triggered creation): click **+ New section** in the currently open section, or right-click a section in the tree and choose **New section** to add a child without navigating into it. Sections are deliberately independent of **suites**: moving a case to a different section never changes which suites it belongs to, and vice versa — sections answer "where does this case live," suites answer "what should run together." Move a case by dragging its row onto a section (in the tree or shown inline in the content list), or via each case's **Move to…** button, which opens a picker listing every section by its full path — both call the same underlying move (`PUT /api/v1/cases/{id}/folder`) and are no-ops if you drop onto the case's current section. Cases created before any section exists default into the root — the landing page's Library panel surfaces these as an **Unsectioned** row so they're never invisible there.

## Test cases and versioning

Click **+ New test case** in the library explorer to open a side drawer: a title and a list of steps, each with a required **Action** and an optional **Expected result**. Click an existing case to view it read-only — title, version, the suites it belongs to, its steps, and its full version history — with an **Edit** button that switches the steps back to editable.

**Every edit creates a new version.** Click **Edit**, change the title or steps, **Save changes** — the case's current version increments (`v1` → `v2`), the old content is never lost, and both versions are listed in the drawer's version history (backed by `GET /api/v1/cases/{id}/versions`). This matters because of what happens next.

A case can also carry `priority` (low/medium/high/critical), `tags` (freeform keywords), `platform` and `testType` (free text — no fixed taxonomy, since these vary too much team to team), and `automated` (boolean, defaults to `false`). All five are optional and editable from the same drawer used for title and steps — priority via a dropdown, tags as a comma-separated list, platform/testType as free text, automated as a checkbox — and are shown as badges/labels once a case is saved. Editing a case only ever touches the fields the drawer shows; its description and expected result (no UI for those two yet) carry over unchanged.

## Suites

Click "see all"/"go to Suites" on the landing's Suites panel to reach the full suites page: a clean list (name + case count) plus a **New suite** form. Click a suite row to open its own drawer with full case membership — add cases via the dropdown + **Add**; remove with the **Remove** button next to a case in the drawer's list. Removing from a suite never deletes the case itself, since suite membership is just an n:m relationship (`suite_cases`). Clicking a suite row on the landing's Suites panel opens straight to that suite's drawer instead of the plain list.

## Runs: version pinning in practice

Click "see all"/"go to Runs" on the landing's Recent runs panel to reach the full runs page and create one (**New run** form) — it includes *all current test cases* in the project as of that moment. This is the versioning model made concrete:

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
