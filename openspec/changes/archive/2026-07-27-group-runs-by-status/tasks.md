## 1. Backend: per-run pass rate aggregate

- [x] 1.1 Wrote a failing test (`TestListRunsIncludesPassRate`, `store_test.go`): a run
  with mixed pass/fail items reports `PassRate == 50`; a run with no items reports
  `PassRate == nil`.
- [x] 1.2 Implemented: `domain.Run.PassRate *int`; `RunRepo.List` aggregates
  `count(i.id)`/`count(i.id) FILTER (WHERE pass)` via the same `LEFT JOIN test_run_items
  ... GROUP BY` shape `SuiteRepo.latestRunStats` and `ProjectRepo`'s summaries query
  already use — one query for the whole list, not a round trip per run.
- [x] 1.3 Contract-first: added `passRate` to the `Run` schema in
  `packages/shared/openapi.yaml`; ran `make generate`.
- [x] 1.4 Full Go test suite green.

## 2. Frontend: row visuals + Open/Closed grouping

- [x] 2.1 Wrote failing tests (`RunsPage.test.tsx`): runs render in two labeled
  sections (Open, Closed), each with a count; each row shows a health bar (or "not run
  yet") and a relative created date. Found and fixed one real bug while writing them:
  wrapping name + health bar + date in a single `<Link>` gave the row an accessible
  name that concatenated all three text nodes, breaking name-only queries — fixed with
  an explicit `aria-label={run.name}` on the row link.
- [x] 2.2 Implemented: new `RunRow`/`RunSection` components in `RunsPage.tsx`, reusing
  `HealthBar` and `timeAgo` (already used by `SuitesPage`); section headers use the
  same `Badge` variants `RunPage.tsx` already uses for a single run's status
  (`secondary` open / `outline` closed), per Pepe's design. Closed section rendered
  recessed (`bg-muted/40`) per the design's "filled panel" decision.
- [x] 2.3 Wrote failing tests: Closed caps at 10 rows with a "Show N more" control that
  reveals the rest.
- [x] 2.4 Implemented a shared `SECTION_CAP`/expand mechanism inside `RunSection`,
  parameterized by section (not Closed-specific) — same component renders both.
- [x] 2.5 Wrote failing tests: a single empty section shows an inline one-line message;
  zero runs total shows one unified empty-state card, not two empty sections.
- [x] 2.6 Implemented, matching `ProjectsPage`'s "No projects yet" empty-card pattern.

## 3. Verification

- [x] 3.1 Full unit suite green (622 tests), coverage gate maintained
  (91.6%/82.0%/90.0%/94.7%, all ≥80%), `tsc -b`/`oxlint` clean.
- [x] 3.2 Updated `apps/web/e2e/ui-navigation.spec.ts`'s "Requirement: Run creation"
  block: fixed 2 existing scenarios (TD-32, TD-70) that broke because a zero-runs
  project now shows two "+ New run" links (header + empty-state CTA) — scoped to
  `.first()`, the header one by DOM order. Added TD-74 ("Runs are grouped into Open
  and Closed sections"): creates a run, closes it, confirms it moved from Open to
  Closed and the Open section shows its empty message. Full e2e suite: 77/77 (one
  failure on first run, the same pre-existing `fullyParallel` "Execute a case from
  the board" flake documented earlier this session — confirmed via an isolated
  `--workers=1` re-run, passing in 1.8s).
- [x] 3.3 Manual verification: viewed `/projects/SP/runs` live against the rebuilt
  compose stack (Sample Project, 5 open / 2 closed) — Open/Closed sections, health
  bars, dates, and counts all render correctly and match `mockup.html`. Cap/expand
  (>10 rows) isn't reachable with the Sample Project's current run count; covered by
  the unit test instead (13 closed runs, cap 10, expand). No dedicated dark-mode
  screenshot pass — every visual token here (`HealthBar`, `Badge`, `--status-*`) is
  already-dark-validated and reused unchanged, no new colors introduced.

## 4. Docs and Sample Project

- [x] 4.1 Updated `docs/test-management.md`'s Runs section for the grouped layout,
  per-row health bar/date, and the Closed cap/expand.
- [x] 4.2 Verified live against the rebuilt compose stack: Sample Project has 5 open
  / 2 closed runs with varied pass rates (0%, 90%, 100%, 83%, 66% open; 75%, 66%
  closed) — showcases both sections and the health-bar color bands well; no seed.go
  change needed.

## 5. Ship

- [x] 5.1 Synced delta specs into `openspec/specs/ui-navigation/spec.md` (applied
  manually — the "Run creation" requirement block replaced with the delta's updated
  content, 5 new scenarios added).
- [x] 5.2 Archived the change, keeping `mockup.html` as the durable design reference.
- [x] 5.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI
  green.
