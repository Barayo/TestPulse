## Context

`apps/api/internal/sampledata/seed.go` builds the Sample Project entirely
through the public `service.Service` API, using shared helpers from
`helpers.go` (`RootFolder`, `Folder`, `CaseWithSteps`, `Filler`, `Suite`,
`RunWithVerdicts`). This change doesn't alter that architecture — it grows
what `Seed` calls those helpers to build. No new decisions about *how* the
seeding mechanism works; only about *what* it seeds.

## Goals / Non-Goals

**Goals:**
- The Sample Project reads as a real, lived-in project — enough sections,
  cases, suites, and run history that it doesn't look like a demo stub.
- Every data-driven visual the app renders today (project health badge,
  per-run status summary, case-version flaky signal) has genuine,
  deliberate data behind it, not incidental byproduct.

**Non-Goals:**
- No new seeding mechanism, no new service/store methods, no migration —
  pure content growth through existing calls.
- No data for features that don't render yet (`CaseResultsPanel`'s bar
  chart, any `add-reporting` v0.3 trend/comparison view) — seeding for a
  UI that doesn't consume it yet is wasted, unverifiable effort.

## Decisions

### D1: The last-created run must be the high-pass-rate one
`ProjectRepo.Summaries` computes a project's shown pass rate from only its
most recently created run (`DISTINCT ON (project_id) ... ORDER BY
created_at DESC`), not an aggregate across runs. So run creation *order*
in `Seed` is itself a real constraint, not just content: whichever run is
built last determines the badge. The seed orders runs so a strong,
mostly-passing run is created last, deliberately landing the project in
the "Healthy" (≥80%) band on the project list — the one visual this data
set is directly responsible for getting right.

### D2: Flakiness is deliberate, not incidental
The original seed had one case (`checkoutValid`) that happened to end up
with mixed verdicts across runs — a side effect of run ordering, not a
designed example. This change makes flakiness an explicit, named part of
the seed: pick a case, pin its version across 2+ runs (never editing it in
between), and give it different verdicts in different runs. This is
testable directly: `GET /cases/{caseKey}/executions` for that case must
show both a pass and a fail/blocked entry for the same version.

### D3: Case volume via existing helpers, not new ones
`Filler` (bare cases, no steps) already exists for bulking out a section
without hand-writing each case, and `CaseWithSteps`/`svc.CreateCase`
already handle the small number of cases that need real steps and
classification fields. Reaching ~25-30 cases doesn't need a new helper —
most of the added volume can be `Filler`-generated, with a deliberately
authored handful (the flaky ones, the multi-version ones, the ones with
real steps) built directly, exactly matching the existing seed's own
style.

## Risks / Trade-offs

- **[Risk] A much larger seed slows server startup measurably** →
  Mitigation: every call is a normal service-layer call already used at
  today's smaller scale; verify wall-clock startup time in the manual
  compose-stack check (task list) and reconsider volume only if it's
  actually noticeable (seconds, not sub-second).
- **[Trade-off] More seeded content is more surface area for a future
  seed-content bug** → Accepted; the integration test suite is extended
  alongside the content growth, not after.

## Open Questions

None — scope and content plan fully specified in the proposal.
