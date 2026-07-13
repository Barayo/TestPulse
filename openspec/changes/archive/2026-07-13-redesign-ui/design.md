# Design: Redesign UI

## Context

The v0.1 UI (`add-core-domain`) is functionally complete but visually generic and
structurally flat: no breadcrumbs, no persistent orientation, suite→case membership shown
only as a bare count. A first redesign pass (persistent project sidebar, Corona-inspired
palette) was fully implemented and tested but **rejected on visual/IA review**: *"la gente
trabajará en un único proyecto a la vez... el sidebar mostrándolo todo simultáneamente no
encaja"*, *"cuando abrimos el proyecto no quiero verlo todo"*, *"la paleta no me recuerda a
Coronita"*. This design supersedes that one entirely, reached through a second
brainstorming pass using real example data (a banking-app project, a desktop-app project)
instead of toy content, plus an interactive no-backend prototype used to validate the
folder-explorer and case-detail interactions before committing to them.

## Goals / Non-Goals

**Goals:**
- Navigation built around one active project at a time, not an always-visible global tree.
- A clean project landing — top-level structure at a glance, not everything at once.
- A visual identity actually grounded in the TestPulse brand mark (not a palette that reads
  as unrelated to it).
- Validate the design against realistic content density (a project with 30+ cases in one
  folder, a brand-new project with nothing in it yet), not empty/toy data.
- Keep shadcn/Tailwind/Radix and the existing Geist Sans/Mono fonts; retheme via CSS custom
  properties.

**Non-Goals:**
- No backend, API, or schema changes. Every interaction in this design maps to an endpoint
  that already exists in `packages/shared/openapi.yaml` (verified per-decision below);
  where a feature would need a new endpoint, it is explicitly deferred, not half-built.
- No new domain capability.
- No design-system component library extraction; changes land directly in pages + shell.

## Decisions

### D1: Color tokens — "Teal claro," grounded in the real brand mark

The Corona-inspired palette was rejected as not reading like the brand. The existing app
icon (`assets/brand/testpulse-icon.svg`) already has a teal gradient
(`#14B8A6 → #0D6E6A`) that nothing in the UI used. The new palette is *derived from that
gradient* rather than picked independently, so the logo and the UI finally agree with each
other:

| Token | Hex | Role |
|---|---|---|
| `background` | `#F7FAFA` | Page canvas — cool off-white, neutral, professional (not the previous warm cream) |
| `surface` | `#FFFFFF` | Card/panel/drawer surfaces |
| `border` / `border-strong` | `#E1E8E7` / `#D8E4E3` | Hairlines, dividers |
| `ink` | `#0B2E2C` | Primary text — teal-tinted near-black, not pure black |
| `muted` / `faint` | `#5B6B6A` / `#8A9695` | Secondary/tertiary text |
| `primary` / `primary-dark` | `#14B8A6` / `#0D6E6A` | Brand accent — pulled directly from the logo gradient. Doubles as the `pass` semantic (deliberate, matching the original palette's precedent of one accent carrying both roles) |
| `warn` | `#F5C84A` | `skipped`/pending-adjacent semantic |
| `fail` | `#E8553F` | `fail`/`blocked` semantic, never decorative |

Two other directions were mocked and set aside: a full dark teal ("dev-tool" look, e.g.
Linear/Raycast) was more distinctive but changed the tone to cold/moody, which wasn't asked
for; a warm-neutral-plus-teal hybrid kept the old cream background, which the light variant
does without carrying over anything from the rejected palette.

### D2: Typography — unchanged

Geist Sans (UI) / Geist Mono (data: IDs, versions, timestamps, counts, using
`font-variant-numeric: tabular-nums` where digits line up) stay exactly as decided in the
first pass. This was never part of the rejection — no reason to re-litigate it.

### D3: Project switching — compact header + ⌘K, not a persistent sidebar

The rejected design assumed people work across many projects simultaneously; the actual
usage pattern is one active project at a time, with occasional fast switches. Replaced
with:
- A compact, always-visible header element showing the active project name (button).
- Clicking it, or ⌘K from anywhere, opens a command-palette overlay: searchable list of all
  projects, each with a one-line summary (suite count, case count, latest pass rate).

Rejected: a pure dropdown-only header (no keyboard path) and a palette-only pattern with no
persistent indicator (user loses "where am I" once the palette closes) — the combination
was explicitly chosen over either alone.

### D4: Project landing — three independent cards, not one big page

Replaces both the rejected "show everything" page and a single-view alternative (land
directly in either the folder tree or the suite list — considered and rejected because
different projects lean on folders vs. suites differently, per the following point). The
project page shows three self-contained panels — **Carpetas**, **Suites**, **Runs
recientes** — each rendering only its top ~4 rows with a "ver todas ›" link to the full
view. Verified against real density: a 7-suite, 32-case-in-one-folder project (Banca
Móvil) stays legible; a brand-new project renders each panel's own dashed empty state
("Sin carpetas todavía · + crear") instead of one big blank page.

*Backlog, not this change*: making the landing configurable per project (which panels show,
in what order) — [issue #2](https://github.com/Barayo/TestPulse/issues/2). This design's
one shared default has to be good enough on its own for both a folder-heavy and a
suite-heavy project, which is exactly what the three-card layout is for.

**"ver todas"/"ver todos" destinations** (found while wiring the landing, not covered by
the visual brainstorm since it focused on folders): Carpetas' link opens the folder
explorer (D5); Suites' and Runs recientes' links open a dedicated `SuitesPage`/`RunsPage`
each — plain list + create-form pages, carrying over the suite/run creation and suite
membership management that used to live directly on the old kitchen-sink project page.
Not a new visual direction, just giving existing functionality a route of its own instead
of the landing.

**Correction found while implementing**: the initial build hid each "see all" link whenever
its panel was empty (`totalCount === 0`) — which meant an empty project had no path at all
to `FolderExplorerPage`/`SuitesPage`/`RunsPage`, the only places creation actually happens.
Fixed so the link is always present: `"see all N ›"` once there's content, `"go to
Folders/Suites/Runs ›"` while empty — same destination either way.

**Pass-rate rows use a health bar, not plain text — Runs recientes only.** A run row's pass
rate is a short colored bar (fill = the rate) next to the number, not the number alone — the
number stays for precise triage, the color gives at-a-glance health: `primary` (teal) ≥80%,
`warn` (amber) 50–79%, `fail` (coral) <50%. Same three semantic colors already used for
status, reused here as a continuous health gradient instead of a discrete state.

*Correction found during implementation*: the health bar was originally planned for the
Suites panel too, but `Run` does not persist which suite it was created from
(`test_runs` has no `suite_id` column) — the same gap
[issue #11](https://github.com/Barayo/TestPulse/issues/11) already flags for the suite-level
status chart in `add-reporting`. Computing "this suite's pass rate" by matching run names is
a fragile heuristic, not a real capability, so it isn't built. The Suites panel shows name +
case count only, same treatment as Carpetas, until that link exists.

**Case detail's execution-history strip (D7) similarly pairs a small donut (proportion)
with the bar strip (sequence) rather than either alone** — a donut-only treatment was
mocked and rejected for losing "which execution failed and when."

### D5: Folder browsing — two-pane explorer

A single indented tree (the first pass's approach) breaks down once a folder has real
content — 32 cases in one folder renders as an unbroken vertical list. Replaced with a
VSCode/Finder-style two-pane layout: a narrow tree (folders only, real nesting, 3+ levels
deep) for navigation on the left; the selected folder's direct contents — subfolders *and*
any test cases that live directly in that folder, since a folder can hold both — on the
right. Each case row shows its version and its suite-membership pills, computed client-side
from the suites already fetched for the landing's Suites card (`Suite.caseIds` — no new
endpoint), making visible that a case's folder location and its suite memberships are
independent (per the domain model, and per the founder's own observation during
brainstorming).

### D6: Creating folders and cases — no modals, no parent picker

- **Folder**: no dedicated create screen. "+ Carpeta" in the currently-open folder's
  toolbar, or right-click → "Nueva subcarpeta" on any folder node in the tree (creates a
  child without navigating into it first), both insert an inline editable row — Enter
  commits, Esc cancels. The parent is always implicit from where creation was triggered;
  there is no "choose a parent folder" field anywhere.
- **Test case**: a right-docked drawer (does not cover the tree, keeps navigational
  context) with Título + Pasos. Each step is two fields side by side — **Acción**
  (required) and **Resultado esperado** (optional) — matching the domain's existing
  `Step{action, expected}` shape exactly (`packages/shared/openapi.yaml` `Step` schema);
  this needed no schema change, only a UI that finally exposes the field that already
  existed.

### D7: Viewing and editing an existing case

Clicking a case row opens the same drawer in a **view** mode: version + suite pills, steps
read-only, and two history sections below the steps:

- **Historial de versiones** — real data, `GET /cases/{caseId}/versions` (already exists).
  Shows version number and date, current version highlighted. *Known gap, not fixed by
  this change*: `CaseVersion` has no actor/change-note field, so the list cannot show who
  made an edit or why yet — tracked as
  [issue #13](https://github.com/Barayo/TestPulse/issues/13), not blocking here.
- **Historial de ejecuciones** — designed and validated in the interactive prototype: a
  small pass/fail/skip **donut** (proportion, glanceable) paired with the **bar strip**
  (sequence — which execution, in order, was which verdict) side by side, neither
  replacing the other. A donut alone was mocked and rejected — it reads beautifully but
  loses "which one failed and when," which was an explicit requirement; a bar strip alone
  was the first pass and was flagged as too plain. N capped at 10 regardless of total
  history so it stays cheap, colored by verdict, hover for run/date/verdict on each bar.
  **Not implemented against real data in this change** — it needs a new query (a case's
  run-item results across runs, most-recent-first, bounded `LIMIT`) that doesn't exist in
  the API today. This is tracked under
  [issue #11 / `add-reporting`](https://github.com/Barayo/TestPulse/issues/11); the visual
  treatment above is settled so implementation can start directly from this design once
  the query exists, without a further design pass. This
  change ships the version-history section only; the execution-history section is not
  built until that query exists (no empty scaffold shipped for data that can't exist yet).

"Editar" switches steps back to the editable two-column inputs from D6; "Guardar cambios"
calls `PUT /cases/{caseId}` (already exists, creates a new immutable version per the
domain's versioning rule) and the version list re-fetches to show the new current version.

### D8: Status badges

Carried over from the first pass's D4, remapped to the new tokens: `pass` → `primary`,
`fail`/`blocked` → `fail`, `skipped` → `warn` at reduced visual weight, `pending`/`retest`
→ neutral. One shared component, not an ad hoc per-page mapping — unchanged principle from
before.

### D9: `/projects` (no active project) — permission-ready, not permission-built

v0.1 has no real roles yet (`add-project-rbac` is v0.2), but the page is structured now so
that change is additive later, not a rework: a simple list of all projects (name + mini
stats) with **"+ Nuevo proyecto" in its own header row, never inline in the list**, and the
empty-state's create CTA isolated the same way. `add-project-rbac`
([issue #10](https://github.com/Barayo/TestPulse/issues/10)) only has to stop rendering
those two elements for non-admins — no layout change. Today, everyone sees the
create-enabled version.

### D10: Seed data for design evaluation — dev-only

`make seed-demo` populates two realistic example projects via the API/service layer, never
touching a real deployment: **Banca Móvil** (7 suites, a 32-case folder, mixed pass/fail/
skip history — the "dense, mature project" case) and **Desktop App** (3 folders, no runs
yet — the "brand-new project" case). Every empty-state and density decision above was
checked against both.

### D11: Post-implementation corrections from visual review

Two real corrections found once the user reviewed the shipped D5/D6 explorer and D4 Suites
panel against live data, not covered by D1–D10 above:

- **Suite membership moved off the plain list into a `SuiteDrawer`.** The originally-shipped
  `SuitesPage` listed every suite fully expanded — every member case inline, each with its
  own "Remove" button and an "add case" dropdown per suite. Rejected on review: too much
  detail for a list view, and unusable on mobile widths. `SuitesPage` is now a clean
  name+case-count list; clicking a row opens a `SuiteDrawer` (same right-docked-overlay
  pattern as `CaseDrawer`) with the full membership UI. The landing's Suites panel deep-links
  straight into a suite's drawer instead of scrolling/highlighting a row in the list.
- **"Folder" renamed to "Section," the root labeled "Library."** User feedback: "Folder"
  didn't fit. Renamed in all user-facing copy — aria-labels, button text, breadcrumb,
  routes (`/library` replaces `/folders`) — to **Section** for tree nodes and **Library** for
  the always-present, auto-created root (shown as a permanent breadcrumb crumb, e.g.
  `Projects › {Project} › Library › {Section}`). This is a UI-label-only change: the
  underlying `Folder` domain type, REST paths (`/api/v1/projects/{id}/folders`), and DB
  table/trigger names are unchanged — "Library" is not a new persisted entity, just how the
  existing auto-created root folder is displayed.

## Risks / Trade-offs

- **⌘K discoverability** for users who don't know the shortcut → mitigated by the compact
  header element being clickable on its own; ⌘K is an accelerator, not the only path.
- **Two-pane explorer is more complex than a flat list** → justified specifically because a
  flat list demonstrably breaks at realistic content density (verified with the 32-case
  folder); the pattern itself is one most professional users already know.
- **Suite-membership pills computed client-side** from already-fetched suite data → fine at
  v0.1 scale (single-digit-to-low-dozens suites per project); revisit if that stops holding.
- **Execution-history section is designed but unshipped** → deliberate scope cut, not an
  oversight; building UI against a query that doesn't exist would be exactly the kind of
  premature/half-finished work the project's engineering practice avoids. Tracked, not lost.
- **Retheming + IA rework touches every page again** → same mechanical/large-diff shape as
  the first pass; risk is visual/navigational regression, not functional regression —
  mitigated the same way, by keeping behavior tests green throughout.

## Migration Plan

Direct replacement in `apps/web`, superseding the first pass's (already-implemented but
never merged) sidebar-based UI — no data migration, no API versioning concern
(frontend-only, and every interaction was checked against the existing OpenAPI contract
above). Rollout is "merge and rebuild the image"; rollback is reverting the commit. The
change does not get archived — and per standing instruction, is not committed/pushed —
until visually validated by the project owner against `make seed-demo` data, the same way
this design was validated during brainstorming.

## Open Questions

- Mobile/narrow-viewport behavior for the two-pane explorer and the ⌘K palette — decide
  during implementation against the responsive quality floor, not pinned down here.
- Should ⌘K search across suites/runs too, not just projects, once there's enough content
  to make that useful? Out of scope for v0.1 (projects-only search); revisit alongside
  `add-reporting`'s cross-entity search surface if it becomes a real pain point.
