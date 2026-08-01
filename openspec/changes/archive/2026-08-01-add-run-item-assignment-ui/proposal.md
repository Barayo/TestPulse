## Why

As a QA lead or project admin, when I create or manage a test run, I want to assign individual test executions (or the whole run) to specific people, so ownership of who's responsible for running each test is explicit and workload can be distributed and tracked. The backend already supports this end-to-end (`RunItem.Assignee`, `AssignItem`, `GET /runs/{runKey}/items?assignee=`) but the web UI never surfaces it — `RunPage.tsx` and `RunItemDetailPage.tsx` don't display, set, or filter by assignee at all. Closes #100 (the UI-only portion — see Impact for what's explicitly deferred).

## What Changes

- A per-item **Assign to…** action on the run execution board (via the existing right-click/`⋯` `RowActionMenu`), opening a small dialog with a free-text field (still free text — the User/Team reference upgrade is a separate, deferred change) that also lists assignees already used elsewhere in the same run for quick reuse.
- An **assignee filter** on the board: one chip per distinct assignee present in the run, plus an explicit **Unassigned** chip and **All** — composes with the existing status filter and grouping, matching how those already narrow the item list without hiding anything unexpectedly.
- **Multi-select + bulk assignment**: checkboxes per row and a "select all" affordance, with a bulk action bar that assigns every selected item at once. This absorbs the bulk-assignment scope originally filed under #83 (#83 now covers only multi-select infrastructure + bulk status verdicts, to avoid the same feature being scoped twice) — the selection state and action-bar shell built here are intentionally reusable so #83 can add its own bulk-verdict action to the same bar rather than rebuilding selection from scratch.
- A **default assignee** field on run creation (`NewRunPage.tsx`): every item in the newly created run is assigned to that person automatically, reusing the same per-item assign call rather than a new bulk-creation code path.
- The assignee's own display treatment on each row (currently absent) — shown alongside status/metadata, "Unassigned" shown explicitly rather than as blank space.

## Capabilities

### New Capabilities

(none — this is UI surface over the existing `test-execution` assignment requirement)

### Modified Capabilities

- `test-execution`: the "Run item assignment" requirement gains UI-facing scenarios (assign control, filter including Unassigned, bulk assignment, default assignee at creation). The "Run execution board" requirement gains a multi-select/bulk-action-bar scenario.

## Impact

- `apps/web/src/pages/RunPage.tsx` — assignee display, filter chips, multi-select + bulk action bar.
- `apps/web/src/pages/NewRunPage.tsx` — default assignee field at creation.
- A new shared `AssignDialog` component and a small `assignRunItems` helper (single-item and bulk call the same underlying loop), used by both pages.
- No API or schema changes — this consumes the existing `PUT /items/{itemId}/status` (`assignee`) and `GET /runs/{runKey}/items` endpoints as-is. `assignee` stays a free-text string.
- **Explicitly out of scope, deferred to #103**: upgrading `assignee` from free text to a real User/Team reference (a breaking change needing its own migration), and whether assigning needs its own permission flag distinct from `runRecordResult`.
- `docs/test-management.md` — document the assign control, filter, and default-assignee flow.
- `apps/api/internal/sampledata/seed.go` — assign a few sample run items so the Sample Project demonstrates the feature (assigned + unassigned items, the Unassigned filter has something to show).
