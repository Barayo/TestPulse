## 1. Header: suite link and metadata

- [x] 1.1 Write failing tests for the suite-link row: links to the suite when
  `run.suiteKey` is set, shows an explicit ad hoc state when it's null.
- [x] 1.2 Implement. `rework-suites-landing-ux` had already shipped by the time
  this started, so the link goes straight to the real
  `/projects/{projectKey}/suites/{suiteKey}` route — no fallback needed;
  task 6.1 below is consequently a no-op. Suite name is fetched via
  `GET /api/v1/suites/{suiteKey}` (already existed) when `run.suiteKey` is set.
- [x] 1.3 Write failing tests for the "Created {date}" line.
- [x] 1.4 Implement.

## 2. Status filter

- [x] 2.1 Write failing tests: filter chips render one per status present (with
  counts), "All" resets, selecting a chip narrows the visible items and updates
  the "Showing N of M" line.
- [x] 2.2 Implement, reusing `RunStatusBreakdown`'s `STATUS_ORDER`/`STATUS_COLOR`/
  `STATUS_LABEL` vocabulary (exported from that module for reuse here) for
  visual consistency with the legend above it.

## 3. Grouping toggle

- [x] 3.1 Write failing tests: toggling "Group by status" reorders the (possibly
  filtered) list into status-labeled sections in bad-outcomes-first order, hides
  nothing beyond what the filter already excludes.
- [x] 3.2 Implement.

## 4. Verification

- [x] 4.1 Full unit suite green (585 tests), coverage 92.34%/81.51%/91.23%/
  95.18% (stmts/branch/funcs/lines) — gate maintained. `tsc -b` and `oxlint`
  clean (lint: only pre-existing fast-refresh warnings).
- [x] 4.2 e2e scenarios, run against a rebuilt `docker compose` stack:
  - New TD-66 (`test-execution.spec.ts`, "Run execution board"): creates a
    suite, runs it via the "Run suite" quick action, and confirms the run
    header's suite link navigates to that suite's real detail page.
  - Extended TD-24 with a one-line ad hoc-state assertion (avoids an
    orphaned new scenario for a state that test already produces).
  - Extended TD-28 ("Summary counts by status") with the status filter
    chips (select Pass → narrows + updates the count line; All → resets)
    and the grouping toggle (Pass/Pending sections) — reuses the exact
    mixed-status run that scenario already sets up.
  - Full suite at `--workers=3`: 66-68/69 passed across repeated runs; the
    only failures were pre-existing, unrelated scenarios (including TD-28
    itself under contention — its own "record a verdict" step occasionally
    doesn't land within the retry window under heavy parallel load, the
    same pattern already diagnosed and documented in
    `rework-run-creation-ux`), each passing reliably alone. Every scenario
    this change touches or added passed cleanly and repeatedly in isolation.
- [x] 4.3 Manual visual verification via browser automation not attempted —
  the e2e suite already drove every new interaction (suite link, ad hoc
  state, filter chips, grouping toggle) in a real Chromium via Playwright
  against the same compose stack.

## 5. Docs and Sample Project

- [x] 5.1 Updated `docs/test-management.md`'s run detail page description.
- [x] 5.2 Confirmed via `seed.go`: the Sample Project already has
  suite-created runs (Regression, Nightly, from `rework-suites-landing-ux`'s
  seeding) and ad hoc/imported runs ("CI pipeline" via JUnit import). No new
  seed data needed.

## 6. Cross-change coordination

- [x] 6.1 No-op — `rework-suites-landing-ux` had already shipped before this
  change started, so the suite link was implemented against its real route
  directly (see task 1.2).

## 7. Ship

- [x] 7.1 Sync delta specs into `openspec/specs/test-execution/spec.md`.
- [x] 7.2 Archive the change, keeping `mockup.html` as the durable design reference.
- [ ] 7.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
