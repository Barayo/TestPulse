## Context

The project list (`ProjectsPage.tsx`) already does search and status
filtering entirely client-side over the full array returned by
`useProjectSummaries()` — no pagination exists (see backlog issue #29,
deliberately deferred; project counts aren't expected to be the growth
risk). Render order today is whatever `ProjectRepo.List`/`.Summaries`
happen to return, which is `ORDER BY created_at` baked into the SQL —
not a design choice, just what the first implementation did. This
change adds an explicit, user-controlled sort on top of the existing
client-side filtering, following the same pattern established for view
mode (`useViewModeOverride` + `resolveViewMode`).

## Goals / Non-Goals

**Goals:**
- Let a user reorder the project list by Name, Suite count, Case count,
  or Creation date, in either direction.
- Apply consistently across both view modes, on mobile, and within the
  pinned Favorites strip.
- Persist the choice per-browser across reloads.

**Non-Goals:**
- Sorting by execution/run recency or count — explicitly descoped in
  the exploration that preceded this change; would require a new
  backend field (run count) or reuse `lastRunAt`, neither requested.
- Server-side sorting or pagination — out of scope per backlog #29;
  the full array is already in memory client-side for search/filter,
  sorting it there is free.
- Per-user (backend-persisted) sort preference — this is a display
  preference, not domain data; `localStorage` is sufficient, matching
  the view-mode precedent's own rationale (D1 in enrich-project-list's
  archived design.md).

## Decisions

**Sort keys: Name, Suites, Cases, Created — not Runs/executions.**
All four map onto fields `ProjectSummary` already carries
(`name`, `suiteCount`, `caseCount`, `createdAt`), so this stays a
frontend-only change. An execution-based key was considered and
rejected during exploration: "recently run" would reuse `lastRunAt`
(cheap) but "most executed" would need a new count field (same shape
of backend work as the `lastRunAt` addition in enrich-project-list) —
not justified by the request once the user confirmed they meant
Suites/Cases, not runs.

**Default: Name, ascending.**
Alternatives considered: Created (today's de facto order) and a
size-based default (Suites or Cases descending). Created was rejected
because it's an accident of implementation, not a product decision —
keeping it as default would just formalize an arbitrary choice. A
size-based default was rejected because it silently ranks projects by
"bigger = more important," a judgment this control shouldn't make
unprompted. Name is neutral and predictable.

**Per-key default direction, not one global direction.**
Name defaults ascending (A–Z), Suites/Cases default descending
(most-first — the direction someone actually reaches for when asking
"what's the biggest project"), Created defaults descending
(newest-first, matching today's implicit behavior for that key
specifically). The direction toggle always overrides this once touched;
these are just the sensible starting points the first time a key is
selected.

**Control shape: key `<select>` + separate direction toggle button.**
Alternative considered: a single combined `<select>` with all 8
key+direction combinations ("Name (A–Z)", "Name (Z–A)", ...). Rejected
as it makes the common action — "flip the direction of my current
sort" — require re-selecting from a flat list instead of one click, and
doesn't scale if more keys are added later. Two controls (a `Pill`-style
key selector plus an icon toggle) matches the interaction model of
common dashboard sort UIs (Linear, Notion) and reuses the existing
`Pill` component already in this toolbar for the status filters.

**Visible on mobile, unlike the view-mode toggle.**
The Expanded/Compact toggle hides on mobile (`!isMobile` gate) because
mobile is forced compact regardless of choice — the control would be
inert. Sort has no such constraint; a mobile user browsing a long
compact list benefits from sort exactly as much as desktop does, so it
stays visible at all viewport widths.

**Sort applies before the Favorites/rest split, same order both places.**
Alternative considered: leave Favorites in a separate, unsorted (or
always name-sorted) order, since it's a small pinned set. Rejected —
inconsistent behavior between "the list you sorted" and "the pinned
subset of that same list" would read as a bug, not a feature. The sort
runs once over `visible`, then the existing favorite/non-favorite
partition happens on the already-sorted array.

**Persistence: `localStorage`, shape mirrors `useViewModeOverride`.**
`useSortOverride.ts` stores `{ key: SortKey; direction: 'asc' | 'desc' }`
as JSON under `testpulse.projectListSort`. Same rationale as the
existing view-mode storage: pure client-rendered SPA, no server ever
reads this, so a cookie or backend field would add cost for nothing.

**Toolbar layout: two rows, filters and Sort/View sharing row 2
edge-to-edge — validated against three live alternatives.**
The naive approach (search / filters / Sort+View each on their own
row) was tried first and rejected: on wide viewports it left rows 2
and 3 mostly empty on one side, and on mobile the status filter pills
wrapped into extra multi-line rows. Two other full alternatives were
mocked up and compared interactively before deciding: (B) a single row
with the 5 status pills condensed into one dropdown, and (C) a single
adaptive row with a width-capped search input. Both were rejected —
B changes the filter interaction model (chips → dropdown) more than
this change should scope, and C still crowds at typical widths since
it doesn't reduce the total control count. The chosen layout: search
alone on row 1 (full width — it's the control whose usefulness scales
with project-name length); filters (left) and Sort+View (right) share
row 2 via `justify-content: space-between`, filling it fully instead
of each half getting a mostly-empty row. On mobile, the status filter
pills become a horizontally-scrollable strip (`overflow-x: auto`,
`min-width: 0`, same technique as the existing view-mode/status
toggle precedent) rather than wrapping to extra rows — Sort/View stays
fully visible since only the filter strip shrinks.

**Two related bugs surfaced during mockup validation, worth fixing
alongside implementation regardless of which layout won:**
1. The shared `Pill` component (`ProjectsPage.tsx`, used by both the
   status filters and the view-mode toggle) has no `whitespace-nowrap`,
   so multi-word labels ("In progress", "No runs yet") wrap internally
   into tall, broken-looking pills on narrow viewports. Pre-existing,
   not introduced by this change, but this change's mobile validation
   is what surfaced it — fix it alongside this change's toolbar work
   rather than filing it separately, since the fix lives in the same
   file and same review.
2. (Mockup-only, no production equivalent) inline `style.gridTemplateColumns`
   set imperatively in JS silently overrides any CSS media query —
   a reminder that the real `ExpandedGrid`/`CompactList` grids must stay
   purely Tailwind-class-driven (they already are) rather than gaining
   any imperative column-count logic in a future change.

## Risks / Trade-offs

- **Sort key breadth may need to grow later** (e.g. if execution
  recency is requested after all) → the `SortKey` union and
  `sortProjects()` switch are the only places a new key touches;
  low cost to extend.
- **`localStorage` sort preference vs. future per-user sync** — if
  TestPulse later wants preferences to follow a user across devices,
  this and the view-mode override would both need revisiting together
  → acceptable now, flagged here so a future change doesn't miss the
  view-mode precedent when reconsidering persistence strategy.

## Open Questions

None outstanding — defaults, control shape, persistence, and toolbar
layout (validated against three interactive mockup alternatives) were
all resolved before implementation.
