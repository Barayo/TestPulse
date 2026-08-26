## Context

Three rounds of Pepe/Fable-5 review across Library and Suites (list + detail),
the second round explicitly requested after "this is about making it more
beauty, not just functional gaps." Approved mockups:
- Library: https://claude.ai/code/artifact/b20cac23-68e1-4d4f-bc4b-3ad4197cf24e
- Suites list: https://claude.ai/code/artifact/c9e07381-9799-4f71-8de5-a389c367bfb9
- Suite Detail: https://claude.ai/code/artifact/69cfc1aa-ff2e-4223-862f-18baa57f7077

## Goals / Non-Goals

**Goals:** fix the one real legibility bug (case-row chip pile-up), fix the
one real regression (Suite Detail's uncapped run history), and bring visual
craft on both pages up to the same bar the Runs list redesign set — without
inventing new color tokens or layout idioms not already established
elsewhere in the app.

**Non-Goals:** reopening the "pass rate shown three times" question on
Suite Detail (already resolved across four prior `rework-suite-run-flow`
review rounds — D7-D12); changing the Properties sidebar's `HealthBar` row
(D11 already rejected `StatusPill` there); any bulk-select functionality
(that's `add-library-bulk-select`); any CasePicker changes (that's
`redesign-case-picker-membership`).

## Decisions

**D1 — Case row: drop version, demote attributes, cap suite tags.**
Version chip removed entirely (no page currently lets you scan by version;
it stays on the case detail page). Platform/test type render as plain
`text-muted-foreground` text (`web · functional`), not pills — per
`docs/design-system.md`'s own Badge rule, they're attributes, not status.
Suite-name tags reuse `Pills.tsx`'s existing `tagPills()` cap-at-2(+N)
function verbatim (already used elsewhere in the codebase, just not on
this row). Title gets `flex-1 min-w-0 truncate` (the same `shrink-0`/
`flex-1 truncate` contract `Breadcrumbs.tsx` already uses). Priority,
Auto/Manual, and Flaky/Stale stay as the only colored pills — the real
status signals.

**D2 — Folder rows lift, case rows stay flat.**
Direct reuse of the Runs redesign's Open-vs-Closed physics split
(`RunsListTriage.tsx`'s `OpenRunCard` lift vs. `ClosedRunRow` flat
highlight): a folder is something you navigate *into* (few of them, high
per-item weight, deserves a lift), a case row is one of potentially dozens
in a dense scannable list (flat highlight, no per-row drama). Same
reasoning transplanted to a page it wasn't originally designed for — not a
new physics language, the second application of one.

**D3 — Suites list: `StatusPill`+`ProgressBar`, not `HealthBar`.**
`rework-suites-landing-ux`'s original design intent named
"matching `ProjectsPage.tsx`'s card richness" but the shipped card never
adopted it — this closes that gap. Left accent spine and hover-lift
diverge deliberately from `ProjectsPage.tsx`'s plainer `CompactList` (which
earns its plainness at Projects' larger realistic scale) toward its
richer `ExpandedGrid` idiom instead, since Suites will realistically stay
in the single digits per project.

**D4 — Suite Detail: `HealthRing` hero + recessed panels + restored cap.**
The Stability card's headline fact (is this suite healthy) gets a 72px
`HealthRing` (the same `size` prop added to `HealthRing` for the Runs
redesign) instead of a thin property line — same label/timestamp/badge
content, just re-skinned, not a new fact. Chart and Run history both move
into a `bg-muted/40` recessed panel, matching `RunSection`/
`ClosedRunsLedger`'s established "zone of run data" treatment elsewhere.
Run history's cap: restore the identical `SECTION_CAP = 10` / "Show N
more" pattern already used everywhere else — this page's own list simply
never had it, since it renders raw `RunRow` in a bare `<ul>` rather than
going through `RunSection`.

**D5 — Auto-fit grid for Suites list, not a fixed breakpoint.**
`repeat(auto-fit, minmax(15rem, 1fr))` instead of `lg:grid-cols-3`, so a
trailing card at counts like 4, 5, 7, 8 stretches to fill its row rather
than stranding alone on a half-empty one — a real, visible defect at the
Sample Project's actual count (4 suites).

## Risks / Trade-offs

- **Icon-relative-to-checkbox/indicator work in this change must not
  collide with `add-library-bulk-select`'s row changes** — sequencing
  matters. This change ships first; the bulk-select change rebases its row
  markup on top of these already-landed row styles, not the other way
  around, since the polish here is pure styling with no new state, and the
  bulk-select change already assumes the "functional fix" row shape as its
  starting point per its own mockup.
- **Suite Detail's Run history cap has no realistic seed data to
  demonstrate it today** (no suite has >10 runs in `seed.go`) — evaluate
  during implementation whether to add seed runs or accept that this is
  correct-but-currently-undemonstrated behavior, consistent with how other
  capped lists in the app were shipped before their own cap was ever
  exercised by seed data.
