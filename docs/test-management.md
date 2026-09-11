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

Below those three panels, a fourth, full-width **Reports** panel summarizes the project's overall health without navigating away: the project-wide status breakdown bar and pass rate, plus a flaky-case-count teaser. Its single action always reads **Open Reports** (not "see all N") since it summarizes rather than lists, taking you to the dedicated Reports page at `/projects/{key}/reports`. That page assembles three sections: the same project-wide **status breakdown** (across every run in the project, open and closed), a **flaky cases** list sorted by descending flakiness rate with each row linking to that case's own page, and an entry point into **run comparison** (the same picker reachable from a run's own page). It's assembly, not a new analytics surface — every signal it shows already exists elsewhere (a run's own status chart, a suite's pass-rate trend, the Library's Flaky filter); this page is just the one place that puts the project-scoped pieces together.

Every other project-scoped page (Library, Suites, a case or run) shows a breadcrumb trail at the top of the main content reinforcing where you are — but it never repeats "Projects › {project}" (the header chip already covers that) or a trailing segment that would just repeat the page's own heading, so a page with nothing distinct to show above it (the Suites index, the Runs index, a run's own page) shows no breadcrumb at all. Where exactly one real ancestor remains — e.g. a specific suite's detail page, one level below the Suites index — it renders as a single "‹ Suites"-style back-link rather than a full trail. Deeper trails (browsing nested library sections) still work as before: every ancestor segment clickable to go back up, collapsing the middle behind a menu past five segments.

## Project roles and teams

Access to a project is opt-in. A **Tenant Admin** (instance-wide) creates projects, manages user accounts, teams, and roles, and assigns project membership — with implicit access to every project regardless of membership. Everyone else needs an explicit role on a project, assigned directly or via a **team** (a named group managed alongside Users on the People page, `/settings/people`); a user with neither has no access to that project at all, not even read.

A Tenant Admin reaches Administration via the header's **Admin** link — a direct door
into `/settings/people`, not a menu to pick from. Once inside, a persistent
**People / Roles / Instance** tab strip stays visible across all three pages, so moving
between them never requires going back out. API tokens (below) stay outside this
shell: a token page only ever shows its own creator's tokens, so it's reached from
the account menu (Profile) instead, not treated as instance administration.

Roles are fully custom and instance-wide, managed by the Tenant Admin at `/settings/roles`: create, rename, or delete a role, and toggle thirteen independent, concrete permission flags on it — **Read**; **Create/Edit/Delete Case**; **Create/Edit/Delete Section** (Edit Section gates moving/reparenting a section, `add-library-folder-selection`); **Create Suite**; **Edit Suite Membership** (add/remove a case from a suite); **Create Run**; **Record Result** (log a verdict or mark retest); **Manage Project** (edit the project's own settings — rename, description, archive); and, separately, **Delete Run** and **Delete Project** (`add-data-retention` — permanently and irreversibly remove a run, or an already-archived project). The last two are kept independent of Manage Project/Create Run deliberately: a role that can rename or archive a project, or create and seal runs, doesn't automatically gain the power to permanently destroy one. Each flag names one concrete action rather than a broad bucket, so a role can (for example) create cases without being able to delete them, or run tests without being able to author suites. A `rank` field is a display/sort order only; there is no fixed hierarchy between roles. A fresh instance is seeded with three default roles that reproduce the previous fixed model's net behavior exactly, so an instance that never visits `/settings/roles` sees no behavior change:

A **Reset to defaults** button on the Roles page restores Tester/Contributor/Project Admin to these factory flags, behind a confirmation dialog stating exactly what it does. This is scoped to those three names only, not a wipe: an existing role named Tester/Contributor/Project Admin has its flags overwritten back to the defaults *in place* (any project or team already assigned it keeps that assignment), and any of the three that's missing gets recreated. Any other role — custom-named, or renamed away from a default — and every project/team assignment anywhere, is left untouched.

| Seeded role | Flags |
|---|---|
| **Viewer** | Read only |
| **Tester** | Read, Create Run, Record Result |
| **Contributor** | Tester's flags + Create/Edit Case, Create Section, Create Suite, Edit Suite Membership |
| **Project Admin** | Contributor's flags + Delete Case, Delete Section, Manage Project, Delete Run, Delete Project |

A user's effective permissions on a project are the **union** of every role granted to them — directly or via any team they belong to — not just the "highest" one; there's no ranking to pick a winner from once roles are fully custom. So a user holding two different roles on the same project (e.g. one direct, one via a team) gets every permission flag either role grants. Assigning project membership itself — deciding who holds which role on a given project — is Tenant-Admin-only; a role with Manage Project can administer the project's settings but not reassign who's on it. Users and teams are assigned per project at `/projects/{key}/members`. Deleting a role removes it from every project/team assignment that referenced it, immediately revoking any access that depended solely on it. An API token (agent) by default acts at its creator's current permission level, resolved fresh on every request — never its own separate access — but can instead be **scoped** at creation to a single project and a single role (see [API tokens](#api-tokens) below), capping it below the creator's own access rather than inheriting all of it.

### Password management

Only an account owner ever sets their own password's real value — via **Change password** on `/settings/profile` (current password required), or a self-service reset email at `/forgot-password` when the instance has SMTP configured. A Tenant Admin managing another account cannot choose its password directly; from the Edit-user dialog on `/settings/people`, they instead either **send a password reset email** (when SMTP is configured) or, on an instance without SMTP, **generate a temporary password** — a random, admin-generated value that forces the account to set a real password of its own before it can do anything else. A Tenant Admin can also flag an account as **requiring a password change at next login** independently, e.g. after a suspected compromise; the account stays fully usable until its *next* login, at which point every request except reading its own profile, logging out, and changing its password is rejected until it does.

## API tokens

Any authenticated user can create an API token for an agent/integration
from the account menu's **API tokens** link, or `POST /api/v1/tokens`. The full token
value (`tp_<secret>`) is shown exactly once at creation time and never
again — only its name and a short prefix are shown afterward.

By default a token is **unscoped**: it acts as its creator's current
permission level, resolved fresh on every request — a full-access
credential for whatever the creator can currently do, everywhere they can
do it.

Creating a token can instead **scope** it to a single project and a
single role, capping it well below the creator's own access:

- Pick a project, then a role to grant on that project — typically the
  seeded read-only **Viewer** role for a single-purpose integration (a CI
  system polling results, a dashboard), or any other role for a narrower
  write capability (e.g. only recording run results).
- The role can't exceed what the creator currently holds on that
  project — a role granting a permission the creator lacks is rejected at
  creation time.
- Enforcement happens on every request, not just at creation: the token's
  effective permissions are the *intersection* of the role's flags and
  the creator's *current* permissions on that project, so it automatically
  narrows if the creator's own access is later reduced, and it stops
  authenticating entirely if its role is deleted. A scoped token never
  gets Tenant Admin's implicit all-project access, even if its creator is
  a Tenant Admin.

A token — scoped or not — is revoked from the same page, or by its
creator or any Tenant Admin via `DELETE /api/v1/tokens/{tokenId}`.

## Public project access

A Project Admin (a role with **Manage Project**) can flip **Public access**
on for a project at `/projects/{key}/settings`, making its cases, sections,
suites, runs, and results readable by anyone with the link, no account
required. There's no separate public page or URL shape to know about: an
anonymous visitor and a signed-in member browsing the same project see the
same pages at the same URLs (`/projects/{key}`, its suites, runs, library,
case, and run-item pages) — the only difference is that every write
control (create, edit, delete, run, comment, assign) is simply absent for
the anonymous visitor, the same way it's already absent for a member who
lacks the matching permission. It's off by default for every project.
Membership and everyone's exact identity stay hidden from anonymous
visitors too: version and result history that would normally credit a
specific person shows no name at all for them, rather than guessing or
exposing one.

Old `/public/{key}` links (from before this project's pages were unified)
still work — they redirect straight to `/projects/{key}`, existence-blind:
the redirect never checks whether the project exists or is public before
firing, so it leaks nothing a direct visit to `/projects/{key}` wouldn't
already reveal.

A Tenant Admin can additionally disable the entire capability
instance-wide at `/settings/instance` — a hard switch above every
project's own setting, off by default only in the sense that flipping it
off makes no project reachable anonymously regardless of that project's
own flag, without touching or clearing any project's own setting (turning
it back on restores exactly what was public before, with no extra step).
This exists for future multi-tenant hosting, where an operator may want to
guarantee no project is ever public. On a normal single-tenant instance
there is usually no reason to touch it — it's on by default, which is
exactly what makes the seeded Sample Project reachable immediately after
install (see [Getting Started](getting-started.md)).

A visitor with no direct link finds every public project at the
**root URL (`/`)** — the same page authenticated users land on after
login, now also serving as the anonymous discovery surface, reachable
from the login page's "Browse public projects without an account" link
(shown only when the instance-wide switch above is on). With exactly one
public project it redirects straight there; with several it shows a card
per project (name, description, and a Sample badge where it applies);
with none, a plain "no public projects" message, indistinguishable from
the instance-wide switch being off — the same non-disclosure stance every
individual project's page already takes. Logging in from any project page
returns the visitor to that same page, now authenticated, instead of
always landing on the projects root.

## Color theme

A Tenant Admin can set the instance's color theme at `/settings/instance`
under **Appearance** (`add-color-theme-customization`): four built-in
presets — Teal (the default), Indigo, Ocean, Forest — shown as swatches
that apply immediately, instance-wide, with no separate save step. This
applies to every visitor, not just admins: a signed-in user of any role
and an anonymous public-project visitor both see it, the next time their
page loads. The choice is independent of, and composes with, each
person's own personal Light/Dark preference (see [Finding your way
around](#finding-your-way-around)) — any combination of instance palette
and personal light/dark mode renders correctly.

A fifth **Custom** option opens a full palette editor: 10 color fields for
Light mode and 10 for Dark (background, foreground, card, primary, primary
text, muted, muted text, accent, border, input — every other visual token
is derived from these), each with a live WCAG contrast-ratio readout
against its real-world pairing, and a live preview panel showing how the
values render on an actual button, card, and a few other real surfaces.
Custom requires an explicit **Save custom palette** step rather than
applying per keystroke, unlike the presets — typing a color value
shouldn't flash a half-finished palette to every visitor. The contrast
readouts are informational, not a blocking gate: an admin can save a
low-contrast combination if they choose to.

Chart pass/fail colors and status-pill colors are unaffected by the
instance theme, preset or custom — they carry meaning (a failed test, an
at-risk project) that should stay consistent regardless of which brand
palette is active.

Per-person avatar colors, unlike those, *do* follow the instance theme —
each of the 6 avatar identity colors is derived from the palette's brand
primary color, rather than pinned to Teal's own hues. This is computed,
never something an admin sets directly: for a built-in preset it's
generated once and shipped as static styling; for a custom palette it's
derived at render time from whichever primary color the admin chose.
Every derived color is guaranteed to meet WCAG AA contrast regardless of
the source hue. A person's assignment to one of the 6 identity slots (by
name/email) never changes — only which colors that slot renders as.

## Projects

Everything lives inside a project. A Tenant Admin creates one from the home page (`/`): click **+ New project**, or **+ Create your first project** if none exist yet — both are hidden for everyone else, since project creation is Tenant-Admin-only. Projects can be renamed, described, and archived/unarchived (Project Admin or above) via an **Archive project** switch on the project's Settings page — archiving is a soft flag, never a delete, and fully reversible: flipping it back off restores the project exactly as it was, with no lingering "archived" residue. An archived project shows an **Archived** badge on its card and next to its name wherever it's referenced.

**Permanently deleting a project** is a separate, more consequential step, only available once a project is archived: a **Delete project** card appears on Settings below Archive (absent — not just disabled — while the project is active), gated on the **Delete Project** permission independent of Manage Project. Confirming (a dialog naming the project and its live suite/case counts) is irreversible: the project disappears from every list immediately, and everything scoped to it — sections, cases, versions, suites, runs, items, results, membership — is permanently purged in the background over the following seconds-to-minutes, not synchronously (`add-data-retention` D4/D6). Deletion authority follows whoever administers the project day-to-day (Project Admin), deliberately asymmetric with creation, which stays Tenant-Admin-only.

A Tenant Admin can also configure an **instance-wide auto-archive threshold** at `/settings/instance` (a "Auto-archive inactive projects" pill selector, same shape as [Run retention](#run-retention) below — `add-data-retention` D9): once set, a background worker periodically archives every non-archived, non-exempt project whose activity is older than the threshold. "Activity" is the newest of the project's own creation date, its most recently created run, case edit, or suite — not just how old the project itself is, so a long-lived but still-busy project is never flagged. Unlike run retention, this is never destructive: archiving stays fully reversible, one click away, exactly as if a person had archived it manually. A Tenant Admin can exempt an individual project from the policy on that project's own Settings page — deliberately **not** a Project-Admin-facing self-service control: this codebase's only other instance/project two-tier setting (`publicProjectsEnabled`/a project's own `publicAccess`) is a one-directional gate where the instance-wide actor can only *restrict*, never grant, and the exemption follows the same direction — only a Tenant Admin can move a project out of the org-wide default, never a Project Admin moving it back in on their own initiative.

The project list can be ordered by name, suite count, case count, or creation date, in either direction, via the **Sort by** control in the toolbar — the choice is remembered in your browser across visits, applies the same way in both view modes, and stays available on mobile. The list itself only ever shows projects you have a role on (or every project, if you're a Tenant Admin).

Opening a project lands on its dashboard: a **summary strip** — a donut health ring plus status label ("Healthy"/"In progress"/"At risk"/"No runs yet"), suite/case count tiles, and a last-run preview (time, run name, pass rate) — above three panels (Library, Suites, Recent runs) each capped to their top items with a "see all" link. Recent runs is deliberately the most visually weighted of the three (a wider column, an accent border, two-line rows), reflecting that "what happened lately" is the page's highest-frequency scan. Library rows show a magnitude bar sized relative to the panel's largest section, and a section with subsections can be expanded inline (a small preview of its immediate children, not a full tree) without leaving the page. Suites rows show the same pass-rate health bar Recent runs uses, with "Never run" instead of a fake 0% for a suite with no runs yet. A project with no content at all shows a three-step getting-started checklist instead of three empty panels.

## The library

Click "see all"/"go to Library" on the landing's Library panel (or any row shown there) to open the explorer: a section tree on the left for navigation, and the selected section's direct contents — subsections *and* any cases that live directly in it — on the right. This two-pane layout is deliberate: a single indented tree breaks down once a section has real content (tens of cases), while splitting "where am I" from "what's here" scales without a redesign. On desktop, the tree panel's width is adjustable — drag the divider between it and the content list, or focus it and use the Left/Right arrow keys (Home/End jump to the minimum or maximum) — clamped between 200px and 480px and defaulting to 256px; the chosen width is remembered on that device across reloads.

Every case lives in exactly one **section** — a project-level, nestable tree, starting from an automatically-created root labeled **Library** in the UI (the root always exists and can't be deleted or renamed; that "Library" label is purely how it's displayed, not a separate concept to manage). Create a subsection two ways, both with no "parent" field to fill in (the parent is always wherever you triggered creation): click **+ New section** in the currently open section, or right-click a section in the tree and choose **New section** to add a child without navigating into it. Sections are deliberately independent of **suites**: moving a case to a different section never changes which suites it belongs to, and vice versa — sections answer "where does this case live," suites answer "what should run together." Move a case by dragging its row onto a section (in the tree or shown inline in the content list), or via **Move to…** in that case row's own **⋯** menu, which opens a picker listing every section, indented by depth, with a per-section case count (the full path is available as a hover tooltip, for disambiguating same-named sections at different depths) — both call the same underlying move (`PUT /api/v1/cases/{key}/folder`) and are no-ops if you drop onto the case's current section. Cases created before any section exists default into the root — the landing page's Library panel surfaces these as an **Unsectioned** row so they're never invisible there.

A section itself can be moved (reparented) the same way a case can, gated on a separate **Edit Section** permission rather than Create/Delete Section (`add-library-folder-selection`): **Move to…** on a section row's own **⋯** menu opens the same picker, filtered to exclude the section's own subtree — moving a section into itself or one of its descendants is rejected server-side (`PUT /api/v1/folders/{folderId}`) as a 400, not silently accepted or left to corrupt the tree. The root section can never be moved, the same way it can never be deleted.

**A section's URL is built from its own and its ancestors' names, not an internal ID** (`add-folder-slug-urls`) — e.g. `/projects/{key}/library/authentication/two-factor`, mirroring the breadcrumb shown above it, so a link is actually followable and shareable rather than an opaque identifier. Because of this, **a section's name (and the slug derived from it) must be unique among its siblings under the same parent** — creating or moving a section into a name that collides with an existing sibling there is rejected with a clear error, even when the two names only differ by case or by whitespace/hyphen punctuation (they'd otherwise produce identical URLs). Moving a section is remembered as a **single prior identity**: a bookmark to a section's old URL still resolves after one move, redirecting to its current URL with a brief confirmation that it moved — but a bookmark from before *two* moves ago no longer resolves, since only the most recent prior location is kept. Renaming a section in place isn't supported yet; a section's name (and therefore its URL) currently only changes via **Move to…**, or when it's created.

Every section row — in the tree and in the content list — shows its **direct case count** (not a recursive rollup of subsections, matching the project landing page's own suite/case counts) and, when any of its direct cases is **critical** priority, a small critical indicator. The content list's section rows additionally show an **automation-coverage meter** (a single-tone bar plus "N/M automated," or "empty" for a section with no direct cases yet) — deliberately not a pass/fail health band, since a manual-heavy section isn't "unhealthy" the way a low pass rate is; that distinction belongs to Suites/Runs, not the authoring repository. Each case row shows a priority pill, platform and test type as plain text (attributes, not status — they don't get the pill treatment), Auto/Manual, a **Flaky** pill when the case's current version is currently flaky (see below), plus a **Stale** pill (reusing the same amber tokens as Suites' "in-progress" band, for a different meaning) in place of the usual "updated N ago" readout once a case has gone untouched for 90+ days. Suite membership tags cap at two with a "+N" overflow, and a long title truncates — both keep the row a single line regardless of how many suites a case belongs to.

A toolbar above the content list adds a title search box and dropdown filters (tag, priority, platform, test type, automated, flaky) that narrow the current section's case rows without touching the tree or navigation — the same filter-safe selection guarantees `SuiteCaseGrid` already established. A **Search entire Library** toggle flattens the search/filter results across every section in the project at once, labeling each match with its section path, so a case can be found without walking the tree section by section. A section with genuinely nothing in it (no subsections, no cases at all) reads as "Nothing here yet" regardless of any active filter; a section that has cases but none currently match the filters shows a distinct "No cases match your filters" state with a **Clear filters** action, so the two situations are never conflated.

**Flaky-test detection**: a case's current version is flagged **currently flaky** when its executions on that version include both a pass and a failed/blocked result — a real, computed rate (`min(passCount, failedOrBlockedCount) / (passCount + failedOrBlockedCount)`, as a 0-100 percentage), not just a boolean. Flakiness is scoped to the case's *current* version only, so editing a flaky case resets it — a fresh version starts with no executions and therefore no flakiness, matching how the rest of the app treats a version as the unit of "what changed." The Flaky filter and pill are powered by a single project-scoped query (`GET /projects/{projectKey}/flaky-cases`), computed server-side rather than fetched per case, so it stays fast regardless of project size. This is a first-class promotion of the "Flaky" badge that's always lived inside a case version's execution-history dialog — that per-version badge (a different, narrower question: "was this exact version ever flaky") is unchanged; the Library's filter/pill answer the broader "which cases need attention right now" question without opening any dialog.

Below a 768px viewport, the section tree pane is hidden entirely rather than squeezed alongside the content list — a two-pane split doesn't work single-handed on a phone. The content list still renders full width, and both directions of navigation stay reachable without the tree: **up**, via the breadcrumb trail (tapping any ancestor segment jumps straight to it, same as clicking it in the tree would on desktop), and **sideways**, via a **Browse sections** button that opens the same indented, count-annotated picker "Move to…" uses — pick any section to jump there directly, not just an ancestor of the current one.

**Deleting a case or section** lives behind that same per-row **⋯** menu — closed by default, so a delete action is never one accidental click away. Clicking a case row's **⋯** always offers **Move to…**; **Delete** appears in it only for a user with Delete Case. A section row's **⋯** menu offers **Move to…** (gated on Edit Section) and **Delete** (gated on Delete Section) independently of each other — either, both, or neither can appear depending on the actor's permissions, and the trigger itself doesn't render at all without at least one of the two. Right-clicking a row opens the same menu at the cursor — a shortcut alongside the visible trigger, never the browser's own context menu. The section tree's **New section** action works the same way: a visible **⋯** on every tree node, plus right-click as a shortcut. Selecting **Delete** opens a confirmation naming what's about to be removed. Deleting a section is a **cascading soft delete**: the section and every section and case anywhere in its subtree are removed from listings, the tree, and the project's case list in one action — not a hard delete, and not the old reparent-to-parent behavior. The confirmation dialog states exactly how many cases and subsections are in the subtree before you confirm, computed server-side (`GET /api/v1/folders/{folderId}/delete-preview`). A deleted case's version history is preserved and still shows up wherever a past run pinned it, the same guarantee an individually-deleted case already had. The root section can never be deleted.

**Selecting several rows at once** works without checkboxes, across both sections and cases: **Shift+Click** a row to select it and set it as the range anchor, then Shift+Click another row — of either kind — to select every row between the two, in the order they render (subsections before cases within a section, `add-library-folder-selection`). A plain click still opens a case or navigates into a section, unchanged. The same range model works from the keyboard — arrow keys (or j/k) move a focus indicator through the rows, scrolling it into view; **Space** selects the focused row and sets the anchor; **Shift+Space** extends the range to the focused row; **Enter** opens a focused case or navigates into a focused section. A persistent hint at the bottom of the list names these shortcuts, and **?** opens the full list in a dialog. Once at least one row is selected, a floating bar at the bottom of the screen shows the count, a **Select all {N}** link (hidden once everything visible is already selected), and **Move to…**/**Create suite from N cases…**/**Delete** actions that apply to the whole selection at once; **Clear** empties the selection. The bar splits a mixed selection by kind internally — cases go through the case move/delete endpoints, sections through the section ones — so there's still no separate bulk API. Deleting a selection that includes one or more sections sums each selected section's own subtree preview (`GET /api/v1/folders/{folderId}/delete-preview`) into the confirmation's total case/subsection count, in addition to any directly-selected cases; selecting both an ancestor section and one of its own descendants together double-counts the descendant, a known and accepted imprecision that only ever overstates what a destructive action will remove, never understates it. Right-clicking a row that's part of a real multi-selection (more than one row selected) opens the same bulk actions as a context menu at the cursor instead of that row's own single-item menu — the same pattern the Run execution board already uses; a lone selected row, or a right-click on a row outside the current selection, still gets that row's ordinary single-item menu, and opening either menu never changes what's selected.

**Create suite from N cases…** (`add-suite-from-library-selection`) turns the selection directly into a new suite: click it, name the suite, and confirming creates it, adds every resolved case as a member, clears the Library selection, and navigates straight to the new suite's own page — the same "commit and land on the result" shape as Suites' own **+ New suite**. Unlike Move to…/Delete, a selected section isn't split off and dropped — it recursively contributes every case anywhere in its subtree, at any depth, the same way a section row's own case count already implies. The button's count (and the confirmation dialog's) is always this *resolved* total: directly-selected cases plus every case pulled in from selected sections, deduplicated, which is why it can read higher than the footer's own "{count} selected" once a section is involved. The action is hidden entirely — not just disabled — whenever that resolved total is zero, which in practice only happens when every selected section is empty.

## Test cases and versioning

Creating a case requires Create Case; editing or moving one requires Edit Case; creating a section requires Create Section; moving (reparenting) a section requires Edit Section (the seeded Contributor/Project Admin roles have all four). Deleting a case or section requires Delete Case/Delete Section respectively (seeded Project Admin only). Reading requires only Read (every seeded role has it).

Click **+ New test case** in the library explorer to open a dedicated creation page (`/projects/{key}/cases/new`, scoped to the section you were browsing) — not a drawer: a title, a **Format** picker, and a body region that changes with it — **Steps** (the default): a list of steps, each with a required **Action** and an optional **Expected result**; **Free text**: a single description field for exploratory/manual scenarios that don't fit a step list; **Gherkin**: a `Given`/`When`/`Then` scenario, entered as plain text (no syntax highlighting) and rendered read-only with its keywords bolded. Switching format while the current one has unsaved content prompts for confirmation first, since content doesn't carry over between formats — nothing is lost until you confirm. Creating a case navigates straight to its own new page. Click an existing case to open that same shape of page (`/projects/{key}/cases/{caseKey}`) — title and content run full-width as the main content, with a sidebar for properties, results, and version history alongside them, so the case definition itself gets real room rather than being squeezed into a fixed-width panel; creating, viewing, and editing a case are all the same page in different states. Below 768px the sidebar's three sections collapse into stacked, independently-expandable groups in the same order, rather than a separate mobile layout. An **Edit** button switches the page into the same title/format/classification editor the create page uses, without losing the sidebar: Results and Version History stay visible read-only, and only the Properties section becomes an inline form. A header **⋯** menu offers **Move to…** (the same folder picker the Library row menu uses) and **Delete**, so acting on the case you're looking at never requires going back to its row in the Library first.

**Custom fields** let a Project Admin extend a project's case classification beyond the fixed priority/platform/test type/tags set, from a **Custom fields** card on the project's Settings page (`/projects/{key}/settings`). Each field has a name and a type — **text** (free entry) or **select** (a closed, admin-defined list of options) — chosen once at creation and never changeable afterward; only the name can be renamed later. Reordering (both the field list itself and a select field's own option list) is primarily drag-and-drop via a grip handle, with an equivalent non-drag "Move up"/"Move down" fallback in each row's own action menu. Deleting a field is gated behind a live count of how many of the project's current cases have a value set for it — deleting it does not rewrite any past case version's recorded content, it just stops appearing (including in historical version diffs) once the definition is gone. Once a project has fields defined, they appear in the case editor below the fixed classification fields, and on the case detail sidebar afterward — a **select** field's value as a flat pill, a **text** field's value as plain text, capped at the first three (by the project's own field order) with the rest behind a "Show N more" disclosure so a project with many fields doesn't bury the rest of the sidebar. Custom field value changes participate in version history exactly like any other field, labeled by the field's current name.

**Shared step groups** let a project define a common sub-flow once (e.g. "Log in as admin") and reference it from any case's step list, instead of retyping the same steps everywhere. Manage them from a **Shared step groups** card on the project's Settings page — the same list/create/delete shape as Custom fields above — or, faster, select a contiguous run of steps you've already typed in a case's editor (click a step's number badge, Shift+click to extend the range) and **Extract as shared group**, which creates the group and replaces the selection with a reference to it in place. In the step editor, a referenced group renders as one bordered block spanning its position in the numbering (e.g. "3–5"), not as individually-editable rows — its steps are read-only there; edit them from the group's own admin entry instead. **Insert shared group** (next to **Add step**) opens a picker of the project's existing groups.

A reference is a **snapshot, not a live link**: saving a case resolves each reference to that group's content *at that moment* and stores the result as part of the version, exactly like every other field — a run pinned to that version never changes later, even if the source group is edited afterward. While editing a case whose referenced group has since changed, its block shows an **Update available** indicator with a **Refresh** action; refreshing updates what you're about to save, nothing is applied until you click **Save changes**, and leaving it alone keeps exactly what was there before. If the source group has been deleted, the block shows **Source group deleted** and offers **Detach** instead of Refresh — converting it into plain, independently editable steps using its last-known content, so no content is ever lost. A read-only case view (or a pinned run item's own view) shows a referenced block with a **From shared group: `<name>`** caption linking to the group, for context.

**Every edit creates a new version.** Click **Edit**, change the title or steps, **Save changes** — the case's current version increments (`v1` → `v2`), the old content is never lost, and both versions are listed in the page's version history (backed by `GET /api/v1/cases/{key}/versions`). This matters because of what happens next.

**Each version row shows a terse change signal** — computed client-side from data already loaded, no extra request — naming what changed relative to the previous version ("Title changed," "Priority, Platform changed," or "4 fields changed" once it's more than two; the first version says "Initial version"). When the version's editor is a known user, their avatar and first name fold into that same line (`[avatar] Jane · Title changed`, full name via a hover tooltip) rather than adding a third line — versions created before this attribution existed, or by an unrecognized actor, show the signal alone. **Click a row to expand an inline diff** — the same field-by-field comparison (title, format, description, scenario, expected result, classification fields, and steps, added/removed/changed, unchanged fields left out as noise) right in the sidebar, no dialog. A format change itself shows as its own field diff (e.g. "Format: Steps → Gherkin"), alongside whatever content changed. From there, **View executions** opens a dialog listing every run execution that pinned that version (run name and verdict, backed by `GET /api/v1/cases/{key}/executions`) as a link to that execution's own run item page, and marks the version **Flaky** when its executions include both a pass and a failed/blocked result — the fastest way to tell whether a specific edit introduced inconsistent behavior.

**Restoring an old version never rewinds history — it appends a new one.** Every non-current row (someone with Edit Case) shows a **Restore this version** action alongside View executions; confirming creates a brand-new version whose content is copied from the one you picked (`POST /api/v1/cases/{key}/versions/{version}/restore`), which becomes current. If you restore `v1` when the case is at `v3`, the result is `v4` with `v1`'s content — `v1` through `v3` all stay exactly as they were, and any run that already pinned one of them keeps showing that exact content forever. The case's audit trail records the restore with which version it came from and which version it became, and (separately) a case move records which folder it left and which it landed in — both examples of an audit entry carrying structured before/after detail beyond just actor, action, and timestamp.

A case can also carry `priority` (low/medium/high/critical), `tags` (freeform keywords), `platform` and `testType` (free text — no fixed taxonomy, since these vary too much team to team), and `automated` (boolean, defaults to `false`). All five are optional and editable from the same editor used for title and content — priority via a dropdown, tags as a comma-separated list, platform/testType as free text, automated as a checkbox. On the case detail page, these render as pills in the Properties sidebar section — the same classification-pill vocabulary the Library and Suites pages use (see [Design system](design-system.md) for the pattern), not plain `Label: value` text; **Format** leads that same sidebar as plain text (Steps/Free text/Gherkin), not a pill. Editing a case only ever touches the fields the editor shows for the case's current format; its expected result (no UI for that one yet) carries over unchanged regardless of format.

A case (and a run item, on its own page) can also carry a linked Jira issue key (`add-jira-connector`) — set or cleared inline from the Properties sidebar's **Jira** row, independent of the editor above and of versioned content: linking or unlinking a Jira issue never creates a new case version. Once a Jira site URL is configured (Instance Settings → Integrations, Tenant Admin only), the linked key becomes a working link to the real Jira issue immediately; its cached summary and status (and how recently they were refreshed) come from the separate, optional Jira connector process — see [Integrations](integrations.md).

The Results sidebar section shows the case's last 7 executions (a bounded, recency-ordered query — `GET /api/v1/cases/{caseKey}/executions?order=recent&limit=N`, capped server-side rather than fetched in full and sliced client-side): a windowed success-rate headline, one bar per execution colored by verdict across the full six-status vocabulary (pass, failed, skipped, blocked, pending, retest — the same `--chart-1..5` mapping and diagonal retest texture used by the run status chart, see [Design system](design-system.md)), a legend with per-verdict counts, and the date of the most recent execution. Each bar is a focusable button carrying its verdict and date as its accessible name, with a hover/focus tooltip repeating the same text. A case with no execution history still shows the section's chrome and a one-line explanation rather than being omitted.

## Suites

Creating a suite requires Create Suite; adding, removing a case, or renaming requires Edit Suite Membership; deleting a suite requires Manage Project (the same admin-gated permission that governs reopening a closed run) — a small, deliberate footprint rather than an eleventh dedicated permission flag for a capability used in exactly one place.

Click "see all"/"go to Suites" on the landing's Suites panel, or the Suites tab, to reach the suites index: each suite renders as its own card with its name, a status pill and progress bar (or **Never run** for a suite with no runs yet, never a misleading 0%), its case count, and how long ago its most recent run happened. **+ New suite** opens a small name-only dialog; confirming navigates straight into the new suite's own page — there's no separate "create empty on a list, then populate inline" step. Every card also carries the same **Run suite**/**Rename**/**Delete** actions the detail page's Actions sidebar offers — via a right-click anywhere on the card, or its visible "⋯" trigger — so none of the three requires navigating into the suite first.

Every suite has its own dedicated page (`/projects/{projectKey}/suites/{suiteKey}`), matching the same full-entity-page shell a case or a run item gets: breadcrumbs, a properties sidebar (case count, pass rate, created date, and **Run suite**/**Rename**/**Delete** actions), and a primary content area that opens in **view mode** — not the case-selection picker. View mode shows two cards: **Stability** and **Run history**. **Run history** lists every run created from that suite (name, pass-rate health bar or "not run yet," relative date), capped at 10 with a "Show N more runs" control — the same bounded-list pattern every other run list in the app uses — each offering a **Compare…** action once closed, plus a **Compare runs** button once the suite has two or more closed runs. A suite with no runs yet shows both cards' own empty states rather than an error or a blank area.

Above the view toggle, a **Latest closed run** hero ring shows that run's pass-rate health and relative date — one fact about the suite, computed once, unaffected by which Stability view is currently selected. When one or more runs newer than that closed run are still open, a secondary **In progress** line names how many. A suite with no closed run at all shows a placeholder ring rather than a numeric value. (An earlier design put this same rate at hero-number size directly above the chart — found live to read as an aggregate of every point below it, since that's this app's own template for a genuine cross-run aggregate elsewhere; replaced with this plain property pairing, which reuses the same visual language the Properties sidebar already uses for a single non-aggregate value.)

**Stability** shows the suite's run history as one 100%-stacked bar per run — its full status breakdown (pass/failed/skipped/blocked/retest/pending), not just a collapsed pass-rate number, using the same colors and retest texture the run execution board's own status breakdown uses. It has two views — **Closed runs** (the default) and **Open + closed** — switched via a small toggle, never shown together. Closed runs plots only the suite's closed runs, since an in-progress run has no final verdict yet; Open + closed plots the same closed history plus the suite's current open run as a trailing bar, whose counts count only what's been recorded so far against the run's full case list and will keep moving as more results come in — each view carries a one-line caption saying which. The chart is capped to the most recent 15 runs, oldest first within that window, so a long-lived suite's chart never grows unboundedly thin. An open run's bar renders at reduced visual weight rather than a closed run's full-strength one, so a still-changing breakdown never reads as a settled one. The chart's most recent bar is always visually emphasized (a ring outline) as the current value, and carries an always-visible pass-rate label — the one bar readable without interacting. Every bar, including that one, also reveals its full breakdown — each non-zero status with its count and percentage — via a tooltip on hover or keyboard focus, and its accessible name states the same for screen readers. A y-axis labels 0%/50%/100% beside the gridlines; an x-axis shows only the oldest and newest bar's date at each bottom corner, not one date per bar — bars are spaced evenly by order, not by real elapsed time, so a date under every bar would visually claim even time-spacing that isn't real. Exact per-bar dates stay one hover/focus away via the tooltip.

An **Edit cases** button (**View cases** for a visitor without Edit Suite Membership) switches to **edit mode**, showing the case-selection picker: a section tree, a title search box, and the tag/priority/platform/test-type filters, all composable — scoping to a section narrows to that section *and its descendants*, matching how the Library browser treats a section as a subtree. Each row shows its membership state as a circular checkmark indicator plus a tinted row background, not a checkbox. Clicking a row toggles it; **Shift+Click** applies the clicked row's resulting state to every row between it and the last row you toggled — bidirectionally, so a range-select can check *or* uncheck a whole run of rows in one action. The same range model works from the keyboard: arrow keys (or j/k) move focus through the rows, scrolling the picker to keep the focused row visible; **Space** toggles the focused row and sets it as the range anchor; **Shift+Space** extends the range to the focused row. A persistent hint at the bottom of the picker names these shortcuts, and **?** opens the full list. Clicking **Save changes** commits only what actually changed — cases added and removed — leaving everything else untouched, and returns to view mode; **Cancel** (or **Done** for a read-only visitor) discards any uncommitted changes and returns to view mode without saving. Removing a case from a suite never deletes the case itself, since suite membership is just an n:m relationship (`suite_cases`) — an unchecked case still shows up (just unchecked) the next time you edit the suite. Selection survives every axis: toggle a case, then change the section scope, a filter, or the search term that hides it, and it's still checked once you navigate back. A **Selected only** toggle reviews the current selection independent of scope/filter/search. The case list itself is virtualized (a fixed row height, tags capped at 2 plus a `+N` overflow badge) so opening the picker on a project with hundreds of cases and no scope or filter applied — the default state — never renders more than a small, bounded number of rows at once. Deleting a suite removes the suite only — its former member cases stay untouched in the Library, and any run that was created from it keeps its full history with the suite reference simply cleared.

A suite's pass rate — shown on its index card and in its own Properties sidebar — reflects its most recently **closed** run, the same rule the Stability section's Latest closed run property above uses, and is `nil` ("not run yet") when no closed run exists yet even if an open run has recorded results. This is deliberately *not* the same "latest run regardless of status" semantic the project list uses for a project's own pass rate: a suite's number is meant to answer "how healthy is this, right now, as settled fact," so a fresh open run can never override or manufacture a misleading figure. Both are computed via one batched query alongside the suite list itself, not a separate request per suite; only the "which run counts" rule differs from the project-level figure — a suite's **last-run time**, unlike its pass rate, still reflects the true most recent run regardless of status, since "when was this last touched" is a different, unfiltered question.

## Releases and Test Plans

Releases and Test Plans are **optional** — a project that never creates one is completely unaffected, and a run can still be created directly under a project exactly as before this capability existed. They exist for teams that need to track several concurrently-supported releases (each with its own status) or run the same regression pass across several platforms against one release.

A **Release** is a project-scoped, long-lived entity with a `name`, an optional `description`, and a `status` of **Active**, **Maintained**, or **EOL** (defaulting to Active). Note on naming: "Test Plan" here follows the TestRail/Xray/Zephyr tool convention (an execution-scope grouping) rather than ISTQB's "Test Plan" (a planning *document*) — a deliberate choice, since that's the term the tools most TestPulse users are migrating from already use this way.

A **Test Plan** is scoped to exactly one Release and groups the Runs that exercise it — typically one Test Plan per platform (iOS, Android, Web…). A Run may optionally be scoped to a Test Plan at creation; deleting a Test Plan later clears that reference on its runs without affecting them or their results.

Creating, editing, or deleting a Release or a Test Plan requires Manage Project — the same permission that governs reopening a closed run and deleting a suite, rather than a dedicated flag, since release/plan lifecycle changes are infrequent, project-structural decisions.

For a project with no Releases, nothing in the navigation changes. Once a project has at least one, a **Releases** panel appears on the project landing page (below Library/Suites/Runs, above Reports) listing each release with its status and rolled-up pass rate; the very first Release is created from **Project Settings**, which is where every other opt-in project configuration lives. A Release's own page lists its Test Plans; a Test Plan's own page lists its scoped Runs using the same Open/Closed triage view as the project-wide Runs page. Deleting a Release or Test Plan is blocked while it still has Test Plans or Runs, respectively — never a silent orphan of execution history.

Release- and Test-Plan-level pass rate/run-count rollups are always computed as a single server-side aggregate query, never assembled by fetching every child entity individually — the same discipline the project list's own summary aggregation follows.

## Requirements and coverage

Requirements are **optional**, like Releases — a project that never creates one is unaffected. They exist for teams that need to prove which parts of the product are actually tested, not just that some tests passed.

A **Requirement** is a project-scoped, flat record (no nesting) with a `name`, an optional `description`, and an optional free-text external reference (e.g. a Jira key) — TestPulse does not sync it live from Jira/ADO, it's just a label. Creating, editing, deleting, and linking/unlinking requires Manage Project, the same permission that governs Releases.

A Requirement can link to any number of test cases, and a case can link to any number of Requirements — editable from either side: the Requirement's own page (a case picker, same one Suite membership uses), or a "Requirements" row on the case's own detail page (add/remove there updates the identical link). Linking is purely diagnostic/organizational — it has no effect on how the case runs or how its overall verdict is recorded.

The payoff is the **coverage matrix** on a Release's own page: for each Requirement in the project, a status computed by a worst-case rollup across its linked cases' latest results **among that Release's own Test Plans only** — a case that passed under a different Release, or under no Release at all, does not count.

- **Not run** — the Requirement has no linked cases, or at least one linked case has no result yet under this Release (including a result that's only `skipped`, which tells you nothing about coverage either way).
- **Failing** — every linked case has a result under this Release, and at least one of them is Failed or Blocked.
- **Covered** — every linked case has a result under this Release, and all of them are Pass.

Like the Release/Test Plan rollups, this is always one server-side aggregate query per view, never a per-case fetch loop. Deleting a Requirement is blocked while it still has linked cases, mirroring how deleting a Release is blocked while it still has Test Plans.

For a project with no Requirements, nothing in the navigation changes. The entry point lives on **Project Settings**, next to Releases — the first Requirement is created from the Requirements page reached from there.

## Runs: version pinning in practice

Creating a run requires Create Run; recording a verdict or marking retest requires Record Result — the seeded Tester role, the least-privileged default, already has both.

Click "see all"/"go to Runs" on the landing's Recent runs panel to reach the runs page, which lists the project's runs grouped into two sections — **Open**, then **Closed**, each labeled with a count.

**Open** renders as cards, not a flat list: the run needing the most attention — the lowest pass rate, or one with no items yet, which counts as at least as urgent as a low score — gets a large ring gauge and an explicit "At risk"/"Healthy"/"In progress" label; the rest taper down in ring size as their health improves. This is ordered by urgency, not recency — a caption above the section states the rule explicitly, since it's a real departure from "newest first."

**Closed** stays a dense, recessed ledger, but its rows are grouped into clusters by the suite each run came from (a "Smoke" cluster, a "Release" cluster, an "Ad hoc" cluster for runs not created from a suite), each cluster header showing a run count and average pass rate. This is what actually solves runs sharing an identical name (a common pattern for ad hoc or CI-imported runs) — they're grouped with an aggregate instead of relying on a timestamp to tell them apart. Clusters are ordered by whichever suite was most recently active; a run whose suite was later deleted still clusters under that suite's key, shown as plain text since no current name is available. The section shows at most 10 rows initially (across all clusters), with a "Show N more" control to reveal the rest.

A **+ New run** button in the header, not an always-open creation form, opens the picker on its own dedicated page (`/projects/{key}/runs/new`). That **New run** form's case picker is the same section-tree/search/filter/virtualized picker used for suite membership (`CasePicker`, shared between both, including its checkbox-free circular-indicator selection and Shift+Click/keyboard range-toggle) — the picker opens with nothing selected, and **Create run** stays disabled until at least one case is selected, so a run's scope is always an explicit choice rather than a silent "every case in the project" default. An optional **Suite** selector seeds the selection with that suite's current member cases (editable afterward, and left at "All sections" in the tree since a suite's cases can span multiple sections); leaving it on "No suite — ad hoc run" creates a run from just the hand-picked selection, with no separate ad hoc-specific UI — it's simply the picker's natural empty-suite state, matching `Run.suiteKey` already being nullable at the domain level. Creating a run from this page navigates straight to the new run's own execution board, with a one-shot confirmation naming the run that was created.

A suite's own detail page also offers a **Run suite** action in its Actions sidebar: it opens a small dialog showing the suite's current case count and an editable name (its full text pre-selected on open, so accepting or overwriting it is a deliberate choice, not an unexamined prefill) — confirming creates the run immediately, a fast path that reuses the suite's already-defined scope rather than inventing one, so it never fires blind. Since you're likely still reviewing the suite (and might fire another run), this path stays on the suite page instead of navigating away, showing a viewport-anchored confirmation toast — `Run "{name}" created.` with a **View it →** link — that stays until dismissed or you navigate away, rather than auto-disappearing after a few seconds. A **Customize selection** link in that same dialog hands off to the dedicated New run page, pre-seeded (and pre-selected) with the suite's cases and name, for anyone who wants to adjust the selection before creating the run — one shared picker implementation behind both entry points, not two.

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
- Selecting an item navigates to its own page (`/runs/{runKey}/items/{caseKey}`) — the same single-window, content+sidebar pattern as a case's own detail page, not an inline panel — showing the pinned case's steps and expected result, a **Your name** / **Comment** form, verdict buttons (**Pass**, **Failed**, **Blocked**, **Skipped**), and a sidebar shaped to match the case's own detail page: **Properties** (including a **Test case** link back to the case's own page, the same priority/test type/automation pills and tag chips shown there, and **Assignee** with its own **Assign to…** control), a **Results** section showing the case's cross-run pass-rate and recent-execution bars (the same panel the case detail page shows, since it's the same underlying data), and **This run** — the verdicts recorded on this specific item only.
- Recording a verdict updates the item's status immediately, without leaving the item's page.
- A **Retest** button appears on failed items; marking retest sets the item back to an executable state (`retest` status) without erasing the prior failure from history.
- Right-clicking an item row opens a shortcut menu: open its execution page (same as clicking the row), **Assign to…**, or jump straight to the case's own page in the Library without visiting the execution page first. On an open run, with permission to record results, the same menu also offers **Pass**/**Failed**/**Blocked**/**Skipped** for that row alone — the same four verdicts the bulk "Mark as" menu offers, just scoped to one item instead of a whole selection — and, when that row is currently failed, a **Retest** action identical to the one on the item's own page. Neither the verdicts nor Retest appear on a closed run or without that permission. If the row is part of an active multi-item selection (see **Assigning items**, below), the menu switches to the same bulk actions available in the bulk action bar instead — right-clicking a row outside the current selection always shows the ordinary single-item menu, and opening either menu never changes which items are selected.

### Step-level results

For a case with discrete steps (not a Gherkin scenario or a free-text
description), each step on the item's own page carries a compact **P F B
S** control for marking that individual step's verdict — pass, failed,
blocked, or skipped — independently of the item's overall verdict. Marking
a step is a small write that persists immediately, the moment you click:
there's nothing to save separately, and recording the overall verdict
below doesn't require any step to be marked first (or at all) — it works
exactly as it always has if you never touch a step marker. Step marks
persist across a retest rather than resetting, so if only one step's
outcome actually changed, that's the only one you need to re-click.

Every time you record an overall verdict, whatever step marks are set at
that moment are captured as part of that result — an immutable snapshot,
not a live view. The **This run** history shows each past result's step
snapshot as a small expandable summary (e.g. "3/5 steps marked · 1
failed"), so you can see exactly which step broke on a given attempt even
after later retests have moved the item's live markers on. A result with
no steps marked (including every result recorded before this capability
existed) shows no step summary at all.

### Assigning items

Each row shows who it's assigned to, or **Unassigned**. **Assign to…** (from
the row's right-click menu) opens a picker scoped to the project's actual
membership — a searchable list of the project's members, people and teams
shown in separate sections, fetched from `GET /projects/{projectKey}/members`.
There's no free-text entry: an item can only be assigned to a real user or
team that already holds a role on the project, and the assignment is a real
foreign-key reference (`assignee_user_id` / `assignee_team_id` on the run
item), not display text. If the assigned user or team is later removed from
the system, the item reverts to unassigned rather than pointing at a name
that no longer resolves to anyone. A user assignee's avatar (`add-user-profile`)
is resolved live — it always reflects whatever the assigned person currently
has set on their own profile, not a value captured at assignment time; a team
assignee keeps its existing generated-color square chip, since teams have no
avatar of their own. The same live-resolved avatar appears next to a
user-attributed entry in an item's **This run** section — an entry recorded by
an agent, or with an unknown actor, or where "record on behalf of" was used,
shows no avatar, since there's no real user identity to key one off. An **assignee filter** row, alongside the
status filter, offers one chip per distinct assignee present plus an
explicit **Unassigned** and **All**; it composes with the status filter, so
both can narrow the list together.

A checkbox per row (plus a header **Select all**, scoped to whatever the
active filter currently shows) enables **bulk assignment**: select several
items and a bulk action bar appears with an **Assign selected…** action that
assigns them all in one dialog. On an open run, the same bar also offers a
**Mark as** dropdown listing all four verdicts (Pass, Failed, Blocked,
Skipped, each labeled with the same status-color dot used everywhere else
on the board), recording the chosen verdict against every selected item at
once; each still writes its own independent entry to that item's This run
section, exactly as if recorded one at a time, so the audit trail never
collapses a bulk action into a single combined record. This control isn't
offered on a closed run, the same restriction individual verdict recording
already has.

Each row's checkbox is dimmed at rest — quiet rather than absent, so it
doesn't compete with the row's own content while you're just scanning the
board — and returns to full opacity the moment it's relevant: on hover, when
it carries the `j`/`k` keyboard focus cursor, or once any item anywhere in
the list is selected (every row's checkbox, not just the one under the
cursor, so the whole list stays legible mid-selection). The header **Select
all** checkbox is exempt and always renders at full opacity. Two extra
selection gestures sit alongside the checkbox: pressing **Space** toggles
the selection state of whichever item currently carries the `j`/`k` focus
cursor, and **Shift-clicking** a row extends the selection as a contiguous
range from the last row you touched to the one you just clicked — adding to
the existing selection, never replacing it — or, if nothing's been touched
yet, simply selects that one row and becomes the anchor for the next
Shift-click.

Creating a run (`/projects/{projectKey}/runs/new`) has an optional
**Default assignee** field, backed by the same project-member picker —
every item in the new run is assigned to that person or team immediately
after creation, the same as using **Assign to…** afterward, just without the
extra clicks.

### Restricting recording to the assignee

A Project Admin can turn on **Restrict recording to assignee** at
`/projects/{key}/settings`, alongside **Public access**. Off by default,
matching today's behavior where anyone holding **Record Result** can act on
any item regardless of who it's assigned to. Once on, recording a result or
changing an item's status (including marking retest) is rejected unless the
authenticated caller is the item's assignee — a matching user, or any member
of the assigned team — or holds **Manage Project** on that project. A
Tenant Admin can always act, the same override every other project-level
policy in TestPulse gives them. An **unassigned** item is unaffected either
way: the setting only ever narrows access to items that already have an
owner, it never blocks recording on one that doesn't. The check looks at
who's actually authenticated, never the free-text "record on behalf of"
name — typing someone else's name into that field doesn't let you act on
their behalf here.

### Comments

A comment is always recorded together with a verdict — there's no
standalone "save comment" action independent of a result row. The
**Comment** field reflects this directly: once the item has at least one
prior verdict, a **Save comment** button appears beneath the field
(disabled until you type something) that re-submits that same verdict
with the new comment attached, appending a fresh entry to This run without
changing the item's current status — the way to leave a follow-up note
("still failing after retry") without pretending to re-record a fresh
result. Before any verdict has ever been recorded, no button is shown; a
hint explains the comment is saved together with whichever verdict you
record below instead.

### Screenshot attachments

A result can carry image evidence, attached independently of writing a
comment — evidence and annotation are two different things, and neither
requires the other. On an open item's page, the **Attachments** field sits
above Comment with its own drop zone: click it to browse, drag an image
onto it, or paste (⌘V) while it has focus. It uploads immediately and shows
as a thumbnail, with an "N attached — attach another" hint that updates as
you go. Hovering a staged thumbnail reveals a small × to remove it before
it's linked to anything.

Pasting or dragging an image directly onto the **Comment** field also
works, as a shortcut for anyone already typing a comment — it uploads
through the same path and lands in the same Attachments strip above, with
a brief "✓ Added to Attachments" confirmation so it's clear the image
didn't become part of the comment text. Comment's placeholder mentions
this ("...screenshots paste here too") only while the field is empty.
Either way, a screenshot isn't linked to anything until a verdict is
actually recorded (there's no result yet to attach it to) — recording one
links every staged thumbnail to that result in the same action. An
already-recorded result in **This run** carries its own persistently-visible
paperclip icon for attaching evidence after the fact, without recording a
new verdict.

A rejected upload (wrong type, too large, or a failed request) shows as a
red-bordered tile in the strip alongside any successful ones, plus a
callout naming the specific reason. Thumbnails show up to three per result
plus a "+N" tile for the rest; clicking any of them opens a full-size view
with previous/next navigation across that result's attachments. Accepted
formats are PNG, JPEG, and WebP, up to 5MB each.

A screenshot imported alongside a JUnit report reads no differently from a
manually-attached one — same thumbnails, same full-size view. Plain JUnit
XML has no attachment convention of its own, so imports carry screenshots as
a separate field on the import request rather than embedded in the report
(see [Importing results](importing-results.md)); an import with no
screenshots — the common case today — looks exactly as it did before this
capability existed, not broken or incomplete.

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
  has focus, so typing is never interpreted as a shortcut — with one
  exception: `⌘/Ctrl+Enter` while focused in the Comment field does the
  same thing as clicking **Save comment** (see Comments, above),
  available once the item has a prior verdict to attach the comment to.

## Closing and reopening a run

A run is **open** or **closed**, shown as a badge next to its name. Runs created explicitly (via **New run**) start open. Runs created by [importing results](importing-results.md) start closed — every item already has a final verdict at creation time, so there's nothing "in progress" to represent, and CI-imported runs land directly in the run list's Closed section rather than crowding Open. Any actor who can record results (Record Result permission) can click **Close run** to seal an open run: once closed, its items become read-only — recording a verdict, marking retest, and adding an item are all rejected until it's reopened. This matters once results carry real authorship: a closed run is a stable, final record of who executed what.

Reopening is more privileged than closing — it requires **Manage Project** (the same permission that gates renaming or archiving the project itself), since undoing a seal should be rare and deliberate. Clicking **Reopen** without that permission shows an inline message pointing at asking a project admin instead of silently failing.

## Deleting a run {#run-retention}

A run — open or closed — can be permanently deleted from its own page's **Delete run** button (`variant="destructive"`, gated on the **Delete Run** permission, independent of Record Result/Manage Project): a confirmation dialog names the run and its result count, and confirming removes the run, its items, and every recorded result irreversibly (`DELETE /api/v1/runs/{key}`). Unlike project deletion, a run needs no archived precondition first — it isn't a container for other assets the way a project is.

A Tenant Admin can additionally configure a single, **instance-wide automatic retention threshold** at `/settings/instance` (a "Run retention" days field, `add-data-retention` D8): once set, a background worker periodically finds every **closed** run older than the threshold, measured from its own creation date, and deletes it the same way a manual delete would — including the audit entry, attributed to a `system` actor rather than a person. The threshold defaults to `0`, meaning the policy is off — nothing is ever auto-deleted until a Tenant Admin sets a real value. Open runs are never auto-deleted regardless of age, since an open run may still be actively worked; only closing it (or letting it get imported already-closed) makes it eligible.

## Run summary

The status breakdown at the top of the run page — pass rate plus a segmented count per status — is backed by `GET /api/v1/runs/{key}/summary`.

## Comparing runs

Two **closed** runs of the same project can be compared item by item — what regressed, what improved, and what stayed the same — via `GET /api/v1/runs/{key}/compare/{otherKey}` (and its public twin for public projects). Both runs must be closed (comparing against an in-progress run would compare against a moving target) and belong to the same project; either can be older or newer in the URL — the response always resolves them by `createdAt` and labels them accordingly.

There are several ways to open a comparison, all landing on the same explicit picker (`/projects/{key}/runs/compare`) except the first:

- **Compare to previous run**, a link on a run's own page, shown only when that run is itself closed, has a linked suite, and a prior closed run of the *same* suite exists (found via the suite's trend data) — the fast path for the common case: "did the last hotfix pass make things better or worse?" Skips the picker entirely, navigating straight to the comparison.
- **Compare…**, on a closed run's own page, or via right-click (or the visible "⋯" trigger) on any closed run's row — the project's Runs page, and a suite's own Run history section — opens the picker with that run already selected as the first choice, leaving only the second to pick.
- **Compare runs**, an unseeded entry point with neither side pre-filled: a button on the project's Runs page, and on a suite's Run history section, both shown only once the project has at least two closed runs.

The picker itself lists only the project's closed runs, one side per run, in two custom listboxes rather than plain dropdowns — each option shows the run's name alongside its relative creation date and pass-rate health bar, so same-named runs (a recurring nightly regression run, say) stay distinguishable. Picking a run on one side removes it from the other side's choices, since a run can't be compared against itself. **Compare** navigates to the comparison page once both are chosen.

The comparison page itself lives at `/runs/compare/{olderRunKey}/{newerRunKey}` — addressed directly by the two run keys, like every other run route, not nested under a project. It shows both runs' status-breakdown charts side by side, then the item-level diff in five sections, computed by joining each run's items on case key:

- **Regressed** — passed in the older run, now failed or blocked
- **Improved** — failed or blocked in the older run, now passed
- **Unchanged** — same status in both (collapsed by default, since it's usually the largest and least actionable group)
- **Added** — a case present only in the newer run
- **Removed** — a case present only in the older run

Two runs with little case overlap (below 20%) show a notice explaining the comparison is scoped to the cases both runs share, rather than presenting a confusing mostly-empty diff. Two runs with no regressions or improvements at all show a plain "nothing changed" state instead of an empty Regressed/Improved pair of sections.

Each run's status card also shows a total-duration figure — the sum, across that run's items, of each item's *latest* result's execution time — whenever the data exists. Today that data comes exclusively from JUnit-XML-imported results; a run built entirely through the manual "Record Result" flow has none. A run with no timing data shows an explicit "No timing data" label in that stat's place instead of hiding the row, so a mixed pair (one CI-imported run, one manual) stays legible: one card reads a real duration, the other honestly reads "No timing data."
