## Context

`domain.Result` (`apps/api/internal/domain/domain.go:480-495`) has carried optional
`StartTime`/`EndTime` since the baseline schema (`start_time`/`end_time` columns,
`00001_baseline.sql:233-234`) — no migration needed for this change. They're
populated exclusively by the JUnit XML importer (`junitxml/parser.go`'s
`suiteCases`, staggering each `<testcase time="...">` duration from the suite's
`<testsuite timestamp>`) via `execution_import.go:99-100`. The manual "Record
Result" flow (`RunPage.tsx`) never sets either field — grepped, zero references —
so a run built entirely from manually-recorded results has no duration data for
any item, and that's the common case today, not an edge case.

`domain.RunComparison`'s two run summaries are currently typed as
`SuiteTrendPoint` (`RunKey`/`RunName`/`CreatedAt`/`Total`/`Counts` — status
breakdown only), built by `service.go`'s `summaryPoint` from an already-fetched
`[]domain.RunItem`, which itself carries no timing (that lives only on each
item's `Result` rows, fetched separately per item today — no batched query
touches them for this endpoint).

## Goals / Non-Goals

**Goals:**
- Surface an aggregate total-duration figure per run on the comparison page,
  computed server-side, reusing existing `start_time`/`end_time` data.
- Make the "no timing data" case an explicit, honest state — not a silently
  missing or misleadingly-zero number — since it will be the common case until
  CI-import adoption grows.

**Non-Goals:**
- Per-item (per-case) timing deltas in the Regressed/Improved/etc. diff sections —
  a heavier addition explicitly deferred; this change is the aggregate figure only.
- Backfilling timing for manually-recorded results — out of scope; the manual
  "Record Result" flow gains no new fields here.
- Reusing `SuiteTrendPoint` for this — see D1.

## Decisions

### D1 — A new `RunComparisonSummary` type, not an addition to `SuiteTrendPoint`

`SuiteTrendPoint` is shared with the Stability trend (`SuitePassRateTrend.tsx`'s
data source), which has no use for a comparison-only duration figure — adding it
there would leak a comparison-specific concept into an unrelated shared type.
`RunComparison.OlderRun`/`NewerRun` become a new `RunComparisonSummary` struct:
`SuiteTrendPoint` fields plus `TotalDurationMs *int64` (`omitempty`; `nil` means
no item in that run had a fully-timed result). `openapi.yaml`'s `RunComparison`
schema changes accordingly; `make generate` picks up the new frontend type.

### D2 — Duration aggregation: one new batched store query, not N+1 per-item fetches

New method on `RunRepo` (name TBD during implementation, e.g. `TotalDuration`),
called once per run inside `CompareRuns`. SQL: for each run's items, pick each
item's *latest* result via `DISTINCT ON (run_item_id) ... ORDER BY run_item_id,
created_at DESC` (same idiom `SuiteRepo.latestRunStats`/`List` already use for
"latest X per Y"), keep only rows where both `start_time` and `end_time` are
non-null, then `SUM(end_time - start_time)`. Returns `nil` when zero rows
qualify (no timed results at all in that run) rather than a `0` duration —
"zero data" and "zero time" must never be conflated, matching this session's
own D8/D10 precedent (`PassRate` uses the identical nil-vs-zero distinction).

### D3 — "No timing data" is a per-card state, not a page-level hide/show gate

Because duration is placed *inside each run's own status card* (not a single
joint comparison row — the layout decision made before this design was written),
the "hide vs. show" question resolves per card, symmetrically: each card shows
its own run's duration if `TotalDurationMs` is non-nil, or an explicit "No timing
data" label in that stat's place if it's nil — independent of what the other
card shows. A mixed pair (one CI-imported, one manual) is fully legible this way
without any extra joint-visibility logic: one card reads a real duration, the
other reads "No timing data," side by side.

### D4 — Format: human-readable duration, not raw milliseconds

`TotalDurationMs` renders via a small formatting helper (e.g. `4m 12s`, `52s`,
`1h 03m`) — no existing duration-formatting utility in `apps/web/src/lib`
(grepped) — one small new helper, not a dependency.

## Risks / Trade-offs

- [The new store query adds a per-comparison-request query per run (2 total),
  same order of magnitude as `CompareRuns`'s existing per-run `Items` calls] →
  acceptable; comparison is a low-frequency, on-demand read, not a hot batched
  list endpoint.
- [Until CI-import adoption grows, most comparisons will show "No timing data"
  on both sides] → explicitly accepted in Goals — an honest empty state is the
  point, not a shortcoming to work around.

## Migration Plan

No DB migration — `start_time`/`end_time` columns already exist. Deploy is a
normal API + web release: `openapi.yaml` regenerated, backend query added,
frontend renders the new (optional) field. No data backfill, no feature flag.
