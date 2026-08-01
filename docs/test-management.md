# Test Management

A walkthrough of TestPulse's core workflow: projects, test cases, suites, runs, and the execution board.

> **Security note**: every action described below requires authentication,
> and most require a specific project role — see
> [Project roles and teams](#project-roles-and-teams) below and
> [Deployment: security status](deployment.md#security-status).

## Keys

Every project, test case, run, and suite has a short, human-readable **key**
alongside its internal id — the key is what appears in URLs, in request
bodies wherever you reference one of these four resource types, and
anywhere you'd type or say an identifier out loud (a CI config, a Slack
message, `record_property()` in a test script). It's never a UUID.

A **project key** is derived automatically from the project's name when it's
created — a multi-word name takes the initial letter of each word (capped
at five), e.g. "Customer Payments Api" → `CPA`; a single-word name takes its
first four letters, e.g. "Checkout" → `CHEC`. If that candidate is already
taken, a number is appended (`CPA`, `CPA2`, `CPA3`, …) until it's unique. A
project's key is assigned once, at creation, and never changes — renaming
the project afterward doesn't touch it, the same way a Jira project key
survives the project being renamed.

**Case, run, and suite keys** are sequential within their project, prefixed
with the project's own key: a case gets the bare form
`{projectKey}-{n}` (e.g. `CPA-42`), a run gets an `R` infix
(`CPA-R14`), and a suite gets an `S` infix (`CPA-S3`) — each counts up
independently, so a project's 42nd case and its 3rd run don't compete for
the same number. Like the project key, these are assigned once and never
reused or reassigned.

Every URL in the web UI that identifies a project, case, run, or suite uses
its key — `/projects/CPA`, `/projects/CPA/cases/CPA-42`, `/runs/CPA-R14` —
not a UUID. A URL with an unrecognized key shows the same not-found state as
any other broken link. Folders are the one exception: they stay addressed
by their internal id, in both the API and the URL, since a folder's own
identity was never part of this scheme.

## Finding your way around

TestPulse assumes you work in one project at a time. On every project-scoped page except the project's own landing page, the header shows the project's name next to the `TestPulse` wordmark, with a small caret fused onto it. Clicking the name goes straight to that project's own page; clicking the caret (or **⌘K**/**Ctrl+K** from anywhere) opens a small card anchored right below it — not a centered dialog — listing every other project with its suite/case counts and latest pass rate; it closes on Escape or an outside click, like any command palette. With only one accessible project, the name has nothing to switch to and renders as fully plain, non-interactive text instead — no caret, no hover feedback at all.

A project's landing page (`/projects/{key}`) opens with the project's name as the page heading and its key as a subtitle (`{key} · project overview`) — the header chip doesn't render here at all, since the heading already says which project you're in; a small chevron fused onto the heading itself (again absent with only one project) opens the same switch palette. Below that is a summary strip — the same status pill/pass-rate bar/suite+case totals/last-run shown on the project's card in the project list — so the health signal you used to pick this project is still there once you're inside it, instead of only living on the list you came from. Below that are three independent panels — **Library**, **Suites**, **Recent runs** — each showing its top few items with a "see all" link to the full view, so opening a project shows top-level structure at a glance rather than everything at once. Each panel's "see all" link is clickable to the full view, and every row shown is itself a direct link to that item — never just a name. Recent runs rows are color-coded by pass rate (the same teal/amber/coral bands used elsewhere), so a failing run stands out without opening it. Each panel has its own empty state (with a working link to its full page) when a project has nothing in it yet — except when the *whole project* is empty (no cases, no suites, no runs at all), in which case the three panels are replaced by a single **Get started** checklist: three steps (add a case, group it into a suite, run the suite), each with an icon and a short explanatory tip, so a brand-new project reads as an onboarding flow rather than three empty boxes.

Every other project-scoped page (Library, Suites, a case or run) shows a breadcrumb trail at the top of the main content reinforcing where you are — but it never repeats "Projects › {project}" (the header chip already covers that) or a trailing segment that would just repeat the page's own heading, so a page with nothing distinct to show above it (the Suites index, the Runs index, a run's own page) shows no breadcrumb at all. Where exactly one real ancestor remains — e.g. a specific suite's detail page, one level below the Suites index — it renders as a single "‹ Suites"-style back-link rather than a full trail. Deeper trails (browsing nested library sections) still work as before: every ancestor segment clickable to go back up, collapsing the middle behind a menu past five segments.

## Project roles and teams

Access to a project is opt-in. A **Tenant Admin** (instance-wide) creates projects, manages user accounts, teams, and roles, and assigns project membership — with implicit access to every project regardless of membership. Everyone else needs an explicit role on a project, assigned directly or via a **team** (a named group managed at `/settings/teams`); a user with neither has no access to that project at all, not even read.

Roles are fully custom and instance-wide, managed by the Tenant Admin at `/settings/roles`: create, rename, or delete a role, and toggle ten independent, concrete permission flags on it — **Read**; **Create/Edit/Delete Case**; **Create/Delete Section**; **Create Suite**; **Edit Suite Membership** (add/remove a case from a suite); **Create Run**; **Record Result** (log a verdict or mark retest); and **Manage Project** (edit the project's own settings — rename, description, archive). Each flag names one concrete action rather than a broad bucket, so a role can (for example) create cases without being able to delete them, or run tests without being able to author suites. A `rank` field is a display/sort order only; there is no fixed hierarchy between roles. A fresh instance is seeded with three default roles that reproduce the previous fixed model's net behavior exactly, so an instance that never visits `/settings/roles` sees no behavior change:

A **Reset to defaults** button on the Roles page restores Tester/Contributor/Project Admin to these factory flags, behind a confirmation dialog stating exactly what it does. This is scoped to those three names only, not a wipe: an existing role named Tester/Contributor/Project Admin has its flags overwritten back to the defaults *in place* (any project or team already assigned it keeps that assignment), and any of the three that's missing gets recreated. Any other role — custom-named, or renamed away from a default — and every project/team assignment anywhere, is left untouched.

| Seeded role | Flags |
|---|---|
| **Tester** | Read, Create Run, Record Result |
| **Contributor** | Tester's flags + Create/Edit Case, Create Section, Create Suite, Edit Suite Membership |
| **Project Admin** | Contributor's flags + Delete Case, Delete Section, Manage Project |

A user's effective permissions on a project are the **union** of every role granted to them — directly or via any team they belong to — not just the "highest" one; there's no ranking to pick a winner from once roles are fully custom. So a user holding two different roles on the same project (e.g. one direct, one via a team) gets every permission flag either role grants. Assigning project membership itself — deciding who holds which role on a given project — is Tenant-Admin-only; a role with Manage Project can administer the project's settings but not reassign who's on it. Users and teams are assigned per project at `/projects/{key}/members`. Deleting a role removes it from every project/team assignment that referenced it, immediately revoking any access that depended solely on it. An API token (agent) always acts at its creator's current permission level, resolved fresh on every request — never its own separate access.

## Projects

Everything lives inside a project. A Tenant Admin creates one from the home page (`/`): click **+ New project**, or **+ Create your first project** if none exist yet — both are hidden for everyone else, since project creation is Tenant-Admin-only. Projects can be renamed and archived (a soft flag — archiving never deletes data) via the API (`PATCH /api/v1/projects/{key}`, Project Admin or above); the UI surfaces archived status but archiving itself is API-only in this release.

The project list can be ordered by name, suite count, case count, or creation date, in either direction, via the **Sort by** control in the toolbar — the choice is remembered in your browser across visits, applies the same way in both view modes, and stays available on mobile. The list itself only ever shows projects you have a role on (or every project, if you're a Tenant Admin).

Opening a project lands on its dashboard: a **summary strip** — a donut health ring plus status label ("Healthy"/"In progress"/"At risk"/"No runs yet"), suite/case count tiles, and a last-run preview (time, run name, pass rate) — above three panels (Library, Suites, Recent runs) each capped to their top items with a "see all" link. Recent runs is deliberately the most visually weighted of the three (a wider column, an accent border, two-line rows), reflecting that "what happened lately" is the page's highest-frequency scan. Library rows show a magnitude bar sized relative to the panel's largest section, and a section with subsections can be expanded inline (a small preview of its immediate children, not a full tree) without leaving the page. Suites rows show the same pass-rate health bar Recent runs uses, with "Never run" instead of a fake 0% for a suite with no runs yet. A project with no content at all shows a three-step getting-started checklist instead of three empty panels.

## The library

Click "see all"/"go to Library" on the landing's Library panel (or any row shown there) to open the explorer: a section tree on the left for navigation, and the selected section's direct contents — subsections *and* any cases that live directly in it — on the right. This two-pane layout is deliberate: a single indented tree breaks down once a section has real content (tens of cases), while splitting "where am I" from "what's here" scales without a redesign.

Every case lives in exactly one **section** — a project-level, nestable tree, starting from an automatically-created root labeled **Library** in the UI (the root always exists and can't be deleted or renamed; that "Library" label is purely how it's displayed, not a separate concept to manage). Create a subsection two ways, both with no "parent" field to fill in (the parent is always wherever you triggered creation): click **+ New section** in the currently open section, or right-click a section in the tree and choose **New section** to add a child without navigating into it. Sections are deliberately independent of **suites**: moving a case to a different section never changes which suites it belongs to, and vice versa — sections answer "where does this case live," suites answer "what should run together." Move a case by dragging its row onto a section (in the tree or shown inline in the content list), or via **Move to…** in that case row's own **⋯** menu, which opens a picker listing every section, indented by depth, with a per-section case count (the full path is available as a hover tooltip, for disambiguating same-named sections at different depths) — both call the same underlying move (`PUT /api/v1/cases/{key}/folder`) and are no-ops if you drop onto the case's current section. Cases created before any section exists default into the root — the landing page's Library panel surfaces these as an **Unsectioned** row so they're never invisible there.

Every section row — in the tree and in the content list — shows its **direct case count** (not a recursive rollup of subsections, matching the project landing page's own suite/case counts) and, when any of its direct cases is **critical** priority, a small critical indicator. The content list's section rows additionally show an **automation-coverage meter** (a single-tone bar plus "N/M automated," or "empty" for a section with no direct cases yet) — deliberately not a pass/fail health band, since a manual-heavy section isn't "unhealthy" the way a low pass rate is; that distinction belongs to Suites/Runs, not the authoring repository. Each case row shows compact pills for priority, platform, test type, and Auto/Manual, a **Flaky** pill when the case's current version is currently flaky (see below), plus a **Stale** pill (reusing the same amber tokens as Suites' "in-progress" band, for a different meaning) in place of the usual "updated N ago" readout once a case has gone untouched for 90+ days.

A toolbar above the content list adds a title search box and dropdown filters (tag, priority, platform, test type, automated, flaky) that narrow the current section's case rows without touching the tree or navigation — the same filter-safe selection guarantees `SuiteCaseGrid` already established. A **Search entire Library** toggle flattens the search/filter results across every section in the project at once, labeling each match with its section path, so a case can be found without walking the tree section by section. A section with genuinely nothing in it (no subsections, no cases at all) reads as "Nothing here yet" regardless of any active filter; a section that has cases but none currently match the filters shows a distinct "No cases match your filters" state with a **Clear filters** action, so the two situations are never conflated.

**Flaky-test detection**: a case's current version is flagged **currently flaky** when its executions on that version include both a pass and a failed/blocked result — a real, computed rate (`min(passCount, failedOrBlockedCount) / (passCount + failedOrBlockedCount)`, as a 0-100 percentage), not just a boolean. Flakiness is scoped to the case's *current* version only, so editing a flaky case resets it — a fresh version starts with no executions and therefore no flakiness, matching how the rest of the app treats a version as the unit of "what changed." The Flaky filter and pill are powered by a single project-scoped query (`GET /projects/{projectKey}/flaky-cases`), computed server-side rather than fetched per case, so it stays fast regardless of project size. This is a first-class promotion of the "Flaky" badge that's always lived inside a case version's execution-history dialog — that per-version badge (a different, narrower question: "was this exact version ever flaky") is unchanged; the Library's filter/pill answer the broader "which cases need attention right now" question without opening any dialog.

Below a 768px viewport, the section tree pane is hidden entirely rather than squeezed alongside the content list — a two-pane split doesn't work single-handed on a phone. The content list still renders full width, and both directions of navigation stay reachable without the tree: **up**, via the breadcrumb trail (tapping any ancestor segment jumps straight to it, same as clicking it in the tree would on desktop), and **sideways**, via a **Browse sections** button that opens the same indented, count-annotated picker "Move to…" uses — pick any section to jump there directly, not just an ancestor of the current one.

**Deleting a case or section** lives behind that same per-row **⋯** menu — closed by default, so a delete action is never one accidental click away. Clicking a case row's **⋯** always offers **Move to…**; **Delete** appears in it only for a user with Delete Case. A section row's **⋯** trigger doesn't render at all without Delete Section — there's nothing else in that row's menu today, so no permission means no trigger, not just a disabled one. Right-clicking a row opens the same menu at the cursor — a shortcut alongside the visible trigger, never the browser's own context menu. The section tree's **New section** action works the same way: a visible **⋯** on every tree node, plus right-click as a shortcut. Selecting **Delete** opens a confirmation naming what's about to be removed. Deleting a section is a **cascading soft delete**: the section and every section and case anywhere in its subtree are removed from listings, the tree, and the project's case list in one action — not a hard delete, and not the old reparent-to-parent behavior. The confirmation dialog states exactly how many cases and subsections are in the subtree before you confirm, computed server-side (`GET /api/v1/folders/{folderId}/delete-preview`). A deleted case's version history is preserved and still shows up wherever a past run pinned it, the same guarantee an individually-deleted case already had. The root section can never be deleted.

## Test cases and versioning

Creating a case requires Create Case; editing or moving one requires Edit Case; creating a section requires Create Section (the seeded Contributor/Project Admin roles have all three). Deleting a case or section requires Delete Case/Delete Section respectively (seeded Project Admin only). Reading requires only Read (every seeded role has it).

Click **+ New test case** in the library explorer to open a side drawer: a title and a list of steps, each with a required **Action** and an optional **Expected result**. Click an existing case to open its own page (`/projects/{key}/cases/{caseKey}`) instead of a drawer — title and steps run full-width as the main content, with a sidebar for properties, results, and version history alongside them, so the case definition itself gets real room rather than being squeezed into a fixed-width panel. Below 768px the sidebar's three sections collapse into stacked, independently-expandable groups in the same order, rather than a separate mobile layout. An **Edit** button switches the page into the same title/steps/classification editor the create drawer uses, without losing the sidebar: Results and Version History stay visible read-only, and only the Properties section becomes an inline form. A header **⋯** menu offers **Move to…** (the same folder picker the Library row menu uses) and **Delete**, so acting on the case you're looking at never requires going back to its row in the Library first.

**Every edit creates a new version.** Click **Edit**, change the title or steps, **Save changes** — the case's current version increments (`v1` → `v2`), the old content is never lost, and both versions are listed in the page's version history (backed by `GET /api/v1/cases/{key}/versions`). This matters because of what happens next.

**Each version row shows a terse change signal** — computed client-side from data already loaded, no extra request — naming what changed relative to the previous version ("Title changed," "Priority, Platform changed," or "4 fields changed" once it's more than two; the first version says "Initial version"). **Click a row to expand an inline diff** — the same field-by-field comparison (title, description, expected result, classification fields, and steps, added/removed/changed, unchanged fields left out as noise) right in the sidebar, no dialog. From there, **View executions** opens a dialog listing every run execution that pinned that version (run name and verdict, backed by `GET /api/v1/cases/{key}/executions`) as a link to that execution's own run item page, and marks the version **Flaky** when its executions include both a pass and a failed/blocked result — the fastest way to tell whether a specific edit introduced inconsistent behavior.

A case can also carry `priority` (low/medium/high/critical), `tags` (freeform keywords), `platform` and `testType` (free text — no fixed taxonomy, since these vary too much team to team), and `automated` (boolean, defaults to `false`). All five are optional and editable from the same editor used for title and steps — priority via a dropdown, tags as a comma-separated list, platform/testType as free text, automated as a checkbox. On the case detail page, these render as pills in the Properties sidebar section — the same classification-pill vocabulary the Library and Suites pages use (see [Design system](design-system.md) for the pattern), not plain `Label: value` text. Editing a case only ever touches the fields the editor shows; its description and expected result (no UI for those two yet) carry over unchanged.

The Results sidebar section is a placeholder today — chrome and a one-line explanation, no data yet. Case-level result history (success rate, verdict trend) is separate, later work.

## Suites

Creating a suite requires Create Suite; adding, removing a case, or renaming requires Edit Suite Membership; deleting a suite requires Manage Project (the same admin-gated permission that governs reopening a closed run) — a small, deliberate footprint rather than an eleventh dedicated permission flag for a capability used in exactly one place.

Click "see all"/"go to Suites" on the landing's Suites panel, or the Suites tab, to reach the suites index: each suite renders as a card with its name, a pass-rate health bar (or **Never run** for a suite with no runs yet, never a misleading 0%), its case count, and how long ago its most recent run happened. **+ New suite** opens a small name-only dialog; confirming navigates straight into the new suite's own page — there's no separate "create empty on a list, then populate inline" step. Every card also carries the same **Run suite**/**Rename**/**Delete** actions the detail page's Actions sidebar offers — via a right-click anywhere on the card, or its visible "⋯" trigger — so none of the three requires navigating into the suite first.

Every suite has its own dedicated page (`/projects/{projectKey}/suites/{suiteKey}`), matching the same full-entity-page shell a case or a run item gets: breadcrumbs, a filterable case grid as the primary content, and a properties sidebar (case count, pass rate, last run, created date, and **Run suite**/**Rename**/**Delete** actions). The case grid combines a section tree, a title search box, and the tag/priority/platform/test-type filters, all composable — scoping to a section narrows to that section *and its descendants*, matching how the Library browser treats a section as a subtree. Checking or unchecking cases and clicking **Save changes** commits only what actually changed — cases added and removed — leaving everything else untouched. Removing a case from a suite never deletes the case itself, since suite membership is just an n:m relationship (`suite_cases`) — an unchecked case still shows up (just unchecked) the next time you open the suite. Selection survives every axis: toggle a case, then change the section scope, a filter, or the search term that hides it, and it's still checked once you navigate back. A **Selected only** toggle reviews the current selection independent of scope/filter/search. The case list itself is virtualized (a fixed row height, tags capped at 2 plus a `+N` overflow badge) so opening the picker on a project with hundreds of cases and no scope or filter applied — the default state — never renders more than a small, bounded number of rows at once. Deleting a suite removes the suite only — its former member cases stay untouched in the Library, and any run that was created from it keeps its full history with the suite reference simply cleared.

A suite's pass rate and last-run time reflect its most recently created run — open or closed, the same "latest run" semantic the project list already uses for a project's own pass rate — computed via one batched query alongside the suite list itself, not a separate request per suite.

## Runs: version pinning in practice

Creating a run requires Create Run; recording a verdict or marking retest requires Record Result — the seeded Tester role, the least-privileged default, already has both.

Click "see all"/"go to Runs" on the landing's Recent runs panel to reach the runs page, which lists the project's runs first, grouped into two sections — **Open**, then **Closed** — each labeled with a count and ordered newest-first, so active work never gets buried under archival or CI-imported noise. Each row shows the run's name, a pass-rate health bar (or "not run yet" if it has no items), and a relative created date; the Closed section shows at most 10 rows initially, with a "Show N more" control to reveal the rest. A **+ New run** button in the header, not an always-open creation form, opens the picker on its own dedicated page (`/projects/{key}/runs/new`). That **New run** form's case picker is the same section-tree/search/filter/virtualized picker used for suite membership (`CasePicker`, shared between both) — the picker opens with nothing selected, and **Create run** stays disabled until at least one case is checked, so a run's scope is always an explicit choice rather than a silent "every case in the project" default. An optional **Suite** selector seeds the selection with that suite's current member cases (editable afterward, and left at "All sections" in the tree since a suite's cases can span multiple sections); leaving it on "No suite — ad hoc run" creates a run from just the hand-picked selection, with no separate ad hoc-specific UI — it's simply the picker's natural empty-suite state, matching `Run.suiteKey` already being nullable at the domain level. Creating a run from this page navigates straight to the new run's own execution board, with a one-shot "Run created successfully" confirmation.

A suite's own detail page also offers a **Run suite** action in its Actions sidebar: it opens a small dialog showing the suite's current case count and an editable name, and creates the run immediately on confirm — a fast path that reuses the suite's already-defined scope rather than inventing one, so it never fires blind. Since you're likely still reviewing the suite (and might fire another run), this path stays on the suite page instead of navigating away, showing an inline "Run created — View run →" confirmation banner. A **Customize selection** link in that same dialog hands off to the dedicated New run page, pre-seeded with the suite's cases and name, for anyone who wants to adjust the selection before creating the run — one shared picker implementation behind both entry points, not two.

This is the versioning model made concrete:

```
  t0: create case "Login works"        → v1
  t1: create a run                     → run item pins v1
  t2: edit the case → "Login works v2" → v2 (case's current version)
  t3: open the run                     → still shows v1's content,
                                          with a "newer version exists" note
```

Nothing about the run silently changes when the case is edited later — what a tester executes is exactly what was pinned, forever. If you want the run to reflect the new content, create a new run.

## The run execution board

Open a run (`/runs/{key}`) — this is the one screen in TestPulse designed for heavy daily use.

- Below the run name, a compact meta row shows either **From suite: {name}** (linking to that suite's own detail page) or **Ad hoc run — not created from a suite** — the absence of a suite reads as a deliberate state, not a bug — alongside a **Created {date}** line.
- A **status breakdown** across all six possible statuses (`pending`, `pass`, `failed`, `skipped`, `blocked`, `retest`) plus the overall pass rate, above the item list.
- Single-select **status filter chips** (one per status present, with counts, plus an **All**) narrow the item list to one status at a time for triage; a "Showing N of M items" line reflects the active filter.
- An optional **Group by status** toggle reorders the (possibly filtered) list into status-labeled sections in the same pass/failed/blocked/skipped/retest/pending order as the breakdown above, without hiding anything the filter hasn't already excluded.
- The item list: each row shows a status chip, the test name/platform/tags captured from JUnit imports when present, and a "(newer version available)" hint when applicable.
- Selecting an item navigates to its own page (`/runs/{runKey}/items/{caseKey}`) — the same single-window, content+sidebar pattern as a case's own detail page, not an inline panel — showing the pinned case's steps and expected result, a **Your name** / **Comment** form, verdict buttons (**Pass**, **Failed**, **Blocked**, **Skipped**), item properties, and result **History** in the sidebar.
- Recording a verdict updates the item's status immediately, without leaving the item's page.
- A **Retest** button appears on failed items; marking retest sets the item back to an executable state (`retest` status) without erasing the prior failure from history.
- Right-clicking an item row opens a shortcut menu: open its execution page (same as clicking the row), **Assign to…**, or jump straight to the case's own page in the Library without visiting the execution page first.

### Assigning items

Each row shows who it's assigned to, or **Unassigned**. **Assign to…** (from
the row's right-click menu) opens a small dialog with a free-text field —
still free text, not yet a real person/team reference — that also suggests
assignees already used elsewhere in the run for quick reuse. An **assignee
filter** row, alongside the status filter, offers one chip per distinct
assignee present plus an explicit **Unassigned** and **All**; it composes
with the status filter, so both can narrow the list together.

A checkbox per row (plus a header **Select all**, scoped to whatever the
active filter currently shows) enables **bulk assignment**: select several
items and a bulk action bar appears with an **Assign selected…** action that
assigns them all in one dialog.

Creating a run (`/projects/{projectKey}/runs/new`) has an optional
**Default assignee** field — every item in the new run is assigned to that
person immediately after creation, the same as using **Assign to…**
afterward, just without the extra clicks.

### Keyboard shortcuts

Both the board and an item's own page support keyboard-driven triage, with a
persistent shortcuts legend at the bottom of the page and a full list via
`?`:

- On the board, `j`/`k` (or `↓`/`↑`) move a focus cursor up and down the
  visible (filtered or grouped) item list, and `Enter` opens the focused
  item — the same destination as clicking it. The focused row is shown with
  a filled background tint and a left accent bar, not just an outline, so
  it stays legible next to the row's own status color.
- On an item's own page, `P`/`F`/`B`/`S` record **Pass**/**Failed**/
  **Blocked**/**Skipped**, and `R` marks retest when the item is currently
  `failed` — the same actions as their on-screen buttons, and subject to the
  same **Record Result** permission and open-run requirement. Recording a
  verdict **via a keyboard shortcut** immediately advances to the run's next
  `pending` item, or back to the board once none remain — a fast triage flow
  distinct from the on-screen buttons, which still record and leave you on
  the item's page. `j`/`k` (or `↓`/`↑`) also work here, moving to the
  previous/next item in the run regardless of its status.
- Shortcuts are ignored while a text field (comment, "record on behalf of")
  has focus, so typing is never interpreted as a shortcut.

## Closing and reopening a run

A run is **open** or **closed**, shown as a badge next to its name. Runs are created open. Any actor who can record results (Record Result permission) can click **Close run** to seal it: once closed, its items become read-only — recording a verdict, marking retest, and adding an item are all rejected until it's reopened. This matters once results carry real authorship: a closed run is a stable, final record of who executed what.

Reopening is more privileged than closing — it requires **Manage Project** (the same permission that gates renaming or archiving the project itself), since undoing a seal should be rare and deliberate. Clicking **Reopen** without that permission shows an inline message pointing at asking a project admin instead of silently failing.

## Run summary

The status breakdown at the top of the run page — pass rate plus a segmented count per status — is backed by `GET /api/v1/runs/{key}/summary`. Deeper analytics (trends, flaky-test detection) arrive in `add-reporting` (v0.3) — see [ROADMAP.md](../ROADMAP.md).
