## Context

`RunRepo.Summary` computes one run's status breakdown with a single
`GROUP BY current_status` query. A suite trend is the same shape, repeated
per run, for every closed run that named this suite as its source
(`test_runs.suite_id`, from `link-runs-to-suite`). `add-project-stats`'s
design note (referenced from GitHub issue #15) already established the
project's hard rule here: this must be one server-side aggregation query,
never a client-side fetch-per-run loop — a real incident (`useProjectSummaries`
firing 900+ simultaneous requests) is exactly what that pattern produces at
scale.

## Goals / Non-Goals

**Goals:**
- One query returning a suite's closed runs, oldest→newest, each with its
  full status-count breakdown.
- A chart component that renders that shape, tested standalone.

**Non-Goals:**
- No suite detail page/route — out of scope, see proposal.md.
- No time-bucketing/date-range filtering — the trend is simply "every closed
  run this suite has had, in order." Revisit if a suite accumulates enough
  runs that this becomes unreadable (not a today problem: dogfood project's
  own suites have single-digit run counts).
- No trend for *open* runs — an in-progress run's status counts are
  mid-flight and would visually spike/dip the trend based on what's been
  recorded so far, not the run's actual outcome.

## Decisions

**One query with two result shapes, not N+1.** `SELECT tr.id, tr.key,
tr.name, tr.created_at, tri.current_status, count(*) FROM test_runs tr JOIN
test_run_items tri ON tri.run_id = tr.id WHERE tr.suite_id = $1 AND
tr.status = 'closed' GROUP BY tr.id, tr.key, tr.name, tr.created_at,
tri.current_status ORDER BY tr.created_at ASC` — one round trip, grouped in
Go by run ID into `SuiteTrendPoint`s (same fold pattern `Summary` already
uses for one run, just carrying a run identity per group here).

**Route: `GET /suites/{suiteKey}/trend`, not nested under a suite-run
listing endpoint.** Mirrors the existing `GET /runs/{key}/summary` naming
convention (`{resource}/{key}/{aggregation-name}`) rather than inventing a
new pattern.

**Chart form: a line, not a stacked bar per run.** `RunStatusBreakdown` (one
run's snapshot) is correctly a stacked bar — composition of a fixed total
matters there. A *trend* is fundamentally about one number's movement over
time (pass rate), so per the `dataviz` skill's form-choice guidance this is
a line/sparkline of pass-rate percentage, with the full per-status counts
available as hover/tooltip detail rather than stacked into the mark itself.

## Risks / Trade-offs

[Risk] A suite with zero closed runs (brand new, or every run still open)
returns an empty trend — the component needs an explicit empty state, not a
zero-point broken line render. Mitigated by the component test suite
covering that case explicitly, same convention as `RunStatusBreakdown`'s own
`total === 0` placeholder.
