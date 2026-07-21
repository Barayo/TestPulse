# Test Management

A walkthrough of TestPulse's core workflow: projects, test cases, suites, runs, and the execution board.

> **Security note**: every action described below requires authentication,
> and most require a specific project role — see
> [Project roles and teams](#project-roles-and-teams) below and
> [Deployment: security status](deployment.md#security-status).

## Finding your way around

TestPulse assumes you work in one project at a time. The header shows `TestPulse › {active project}`: the project name is a direct link to that project's own page, and — once your account has more than one project — a small switch icon next to it (or **⌘K**/**Ctrl+K** from anywhere) opens a searchable palette listing every other project with its suite/case counts and latest pass rate. The palette closes on Escape or an outside click, like any command palette.

A project's landing page (`/projects/{id}`) opens with a summary strip — the same status pill/pass-rate bar/suite+case totals/last-run shown on the project's card in the project list — so the health signal you used to pick this project is still there once you're inside it, instead of only living on the list you came from. Below that are three independent panels — **Library**, **Suites**, **Recent runs** — each showing its top few items with a "see all" link to the full view, so opening a project shows top-level structure at a glance rather than everything at once. Each panel's entire header (not just "see all") is clickable to the same destination, and every row shown is itself a direct link to that item — never just a name. Recent runs rows are color-coded by pass rate (the same teal/amber/coral bands used elsewhere), so a failing run stands out without opening it. Each panel has its own empty state (with a working link to its full page) when a project has nothing in it yet — except when the *whole project* is empty (no cases, no suites, no runs at all), in which case the three panels are replaced by a single **Get started** checklist: three steps (add a case, group it into a suite, run the suite), each with an icon and a short explanatory tip, so a brand-new project reads as an onboarding flow rather than three empty boxes. A breadcrumb trail at the top of the main content (`Projects › {project} › …`) reinforces where you are, with every ancestor segment clickable to go back up — including intermediate section names when browsing nested sections.

## Project roles and teams

Access to a project is opt-in. A **Tenant Admin** (instance-wide) creates projects, manages user accounts, teams, and roles, and assigns project membership — with implicit access to every project regardless of membership. Everyone else needs an explicit role on a project, assigned directly or via a **team** (a named group managed at `/settings/teams`); a user with neither has no access to that project at all, not even read.

Roles are fully custom and instance-wide, managed by the Tenant Admin at `/settings/roles`: create, rename, or delete a role, and toggle ten independent, concrete permission flags on it — **Read**; **Create/Edit/Delete Case**; **Create/Delete Section**; **Create Suite**; **Edit Suite Membership** (add/remove a case from a suite); **Create Run**; **Record Result** (log a verdict or mark retest); and **Manage Project** (edit the project's own settings — rename, description, archive). Each flag names one concrete action rather than a broad bucket, so a role can (for example) create cases without being able to delete them, or run tests without being able to author suites. A `rank` field is a display/sort order only; there is no fixed hierarchy between roles. A fresh instance is seeded with three default roles that reproduce the previous fixed model's net behavior exactly, so an instance that never visits `/settings/roles` sees no behavior change:

A **Reset to defaults** button on the Roles page restores Tester/Contributor/Project Admin to these factory flags, behind a confirmation dialog stating exactly what it does. This is scoped to those three names only, not a wipe: an existing role named Tester/Contributor/Project Admin has its flags overwritten back to the defaults *in place* (any project or team already assigned it keeps that assignment), and any of the three that's missing gets recreated. Any other role — custom-named, or renamed away from a default — and every project/team assignment anywhere, is left untouched.

| Seeded role | Flags |
|---|---|
| **Tester** | Read, Create Run, Record Result |
| **Contributor** | Tester's flags + Create/Edit Case, Create Section, Create Suite, Edit Suite Membership |
| **Project Admin** | Contributor's flags + Delete Case, Delete Section, Manage Project |

A user's effective permissions on a project are the **union** of every role granted to them — directly or via any team they belong to — not just the "highest" one; there's no ranking to pick a winner from once roles are fully custom. So a user holding two different roles on the same project (e.g. one direct, one via a team) gets every permission flag either role grants. Assigning project membership itself — deciding who holds which role on a given project — is Tenant-Admin-only; a role with Manage Project can administer the project's settings but not reassign who's on it. Users and teams are assigned per project at `/projects/{id}/members`. Deleting a role removes it from every project/team assignment that referenced it, immediately revoking any access that depended solely on it. An API token (agent) always acts at its creator's current permission level, resolved fresh on every request — never its own separate access.

## Projects

Everything lives inside a project. A Tenant Admin creates one from the home page (`/`): click **+ New project**, or **+ Create your first project** if none exist yet — both are hidden for everyone else, since project creation is Tenant-Admin-only. Projects can be renamed and archived (a soft flag — archiving never deletes data) via the API (`PATCH /api/v1/projects/{id}`, Project Admin or above); the UI surfaces archived status but archiving itself is API-only in this release.

The project list can be ordered by name, suite count, case count, or creation date, in either direction, via the **Sort by** control in the toolbar — the choice is remembered in your browser across visits, applies the same way in both view modes, and stays available on mobile. The list itself only ever shows projects you have a role on (or every project, if you're a Tenant Admin).

## The library

Click "see all"/"go to Library" on the landing's Library panel (or any row shown there) to open the explorer: a section tree on the left for navigation, and the selected section's direct contents — subsections *and* any cases that live directly in it — on the right. This two-pane layout is deliberate: a single indented tree breaks down once a section has real content (tens of cases), while splitting "where am I" from "what's here" scales without a redesign.

Every case lives in exactly one **section** — a project-level, nestable tree, starting from an automatically-created root labeled **Library** in the UI (the root always exists and can't be deleted or renamed; that "Library" label is purely how it's displayed, not a separate concept to manage). Create a subsection two ways, both with no "parent" field to fill in (the parent is always wherever you triggered creation): click **+ New section** in the currently open section, or right-click a section in the tree and choose **New section** to add a child without navigating into it. Sections are deliberately independent of **suites**: moving a case to a different section never changes which suites it belongs to, and vice versa — sections answer "where does this case live," suites answer "what should run together." Move a case by dragging its row onto a section (in the tree or shown inline in the content list), or via each case's **Move to…** button, which opens a picker listing every section by its full path — both call the same underlying move (`PUT /api/v1/cases/{id}/folder`) and are no-ops if you drop onto the case's current section. Cases created before any section exists default into the root — the landing page's Library panel surfaces these as an **Unsectioned** row so they're never invisible there.

## Test cases and versioning

Creating a case requires Create Case; editing or moving one requires Edit Case; creating a section requires Create Section (the seeded Contributor/Project Admin roles have all three). Deleting a case or section requires Delete Case/Delete Section respectively (seeded Project Admin only). Reading requires only Read (every seeded role has it).

Click **+ New test case** in the library explorer to open a side drawer: a title and a list of steps, each with a required **Action** and an optional **Expected result**. Click an existing case to open its own page (`/projects/{id}/cases/{caseId}`) instead of a drawer — title and steps run full-width as the main content, with a sidebar for properties, results, and version history alongside them, so the case definition itself gets real room rather than being squeezed into a fixed-width panel. Below 768px the sidebar's three sections collapse into stacked, independently-expandable groups in the same order, rather than a separate mobile layout. An **Edit** button switches the page into the same title/steps/classification editor the create drawer uses.

**Every edit creates a new version.** Click **Edit**, change the title or steps, **Save changes** — the case's current version increments (`v1` → `v2`), the old content is never lost, and both versions are listed in the page's version history (backed by `GET /api/v1/cases/{id}/versions`). This matters because of what happens next.

A case can also carry `priority` (low/medium/high/critical), `tags` (freeform keywords), `platform` and `testType` (free text — no fixed taxonomy, since these vary too much team to team), and `automated` (boolean, defaults to `false`). All five are optional and editable from the same editor used for title and steps — priority via a dropdown, tags as a comma-separated list, platform/testType as free text, automated as a checkbox. On the case detail page, every one of these renders as a `Label: value` row in the Properties sidebar section, except priority, which stays a badge (see [Design system](design-system.md) for the pattern). Editing a case only ever touches the fields the editor shows; its description and expected result (no UI for those two yet) carry over unchanged.

The Results sidebar section is a placeholder today — chrome and a one-line explanation, no data yet. Case-level result history (success rate, verdict trend) is separate, later work.

## Suites

Creating a suite requires Create Suite; adding or removing a case from one requires Edit Suite Membership.

Click "see all"/"go to Suites" on the landing's Suites panel to reach the full suites page: a clean list (name + case count) plus a **New suite** form. Click a suite row to open its own drawer with full case membership — add cases via the dropdown + **Add**; remove with the **Remove** button next to a case in the drawer's list. Removing from a suite never deletes the case itself, since suite membership is just an n:m relationship (`suite_cases`). Clicking a suite row on the landing's Suites panel opens straight to that suite's drawer instead of the plain list.

## Runs: version pinning in practice

Creating a run requires Create Run; recording a verdict or marking retest requires Record Result — the seeded Tester role, the least-privileged default, already has both.

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
