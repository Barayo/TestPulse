## Context

Found during a same-day post-ship review of `add-web-performance-
lighthouse` (#23) — a direct review plus an independent Pepe (Fable 5)
dispatch, both converging on the same findings, filed as #217. Three of
#217's four findings were urgent enough to block #24 (CI wiring) and
were fixed immediately in `fix-web-perf-lighthouse-methodology`. The
remaining three findings (this change) are lower-urgency reporting
polish: machine-readable output, root-cause surfacing, and a
documentation gap. #217's fourth finding (CreateRun write-path coverage)
was split to its own issue, #218, since it's a new test target with its
own design questions, not polish on the existing suites.

## Goals / Non-Goals

**Goals:**
- Both suites emit a `summary.json` a future CI step (#24) or script can
  parse, alongside their existing human-readable terminal output.
- The web suite surfaces *why* a page scored the way it did, not just
  the score, for the audits actually dragging the score down.
- `discover-urls.mjs`'s run-ordering assumption is documented as the
  guarantee it actually is.

**Non-Goals:**
- CreateRun coverage — #218.
- Server-side telemetry correlation and a concurrency-ramp stage —
  already-deliberate non-goals in `improve-api-perf-test-methodology`'s
  design.md, reconfirmed by Pepe's review.
- Root-cause surfacing for the k6 suite — its data is latency/throughput
  numbers with no comparable "why" detail to extract (unlike Lighthouse's
  audit tree); its `summary.json` addition is purely a format change, no
  new analysis.
- No Sample Project changes — dev/test tooling only, same exemption as
  every change in this lineage.

## Decisions

### D1: k6's `summary.json` via `handleSummary()` + jslib's `textSummary`
`handleSummary(data)` suppresses k6's own default colored terminal
summary unless the returned object explicitly reconstructs it. The
standard, idiomatic k6 pattern — used by effectively every k6 script
with a custom `handleSummary` — imports `textSummary` from k6's own
jslib CDN:
```js
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
```
(version confirmed current against Grafana's own k6 docs, not guessed).
This is a k6-bundler-resolved HTTP(S) import, not an npm dependency — no
`package.json`/`npm audit` surface, cached locally by k6 after first
fetch. `handleSummary` returns both `{ stdout: textSummary(data, ...) }`
(preserving today's exact console output) and
`{ 'apps/api/perf/.results/summary.json': JSON.stringify(...) }` (a new,
git-ignored directory mirroring `apps/web/perf/.results/`'s existing
pattern), containing per-endpoint p95/p99/avg plus overall throughput/
failure-rate pulled from `data.metrics`.

### D2: Web suite's `summary.json` is nearly free — the data already exists
`run.mjs`'s `main()` already builds a `results` array of
`{ name, url, performance, accessibility, bestPractices, lcp, tbt, cls }`
objects (one per page) before printing them. Write that same array to
`apps/web/perf/.results/summary.json` once, after the existing console
loop — no new computation, just one more `writeFile` call.

### D3: Weighted-impact audit ranking, not a hardcoded audit list
`lhr.categories.performance.auditRefs` gives `{ id, weight, score }` for
every performance-category audit. `weight * (1 - score)` is the
principled ranking Lighthouse's own report uses to decide which audits
actually hurt the score — confirmed against a real captured result
(`cumulative-layout-shift` weight 25, `largest-contentful-paint` weight
25, `total-blocking-time` weight 30, etc.). A pure `rankAudits(lhr)`
function returns the top 3 audits by this score, each with
`{ id, title, impact }`. This avoids hardcoding "check CLS, check LCP,
..." and will keep working if Lighthouse's own audit weights or set
change in a future version.

### D4: `describeAuditItem()` probes common fields, doesn't hardcode per-audit shapes
`lhr.audits[id].details.items[]` shapes vary by audit — `layout-shifts`
items have `node.nodeLabel`/`node.selector`; others have `url`; some have
`source`/`description`. Rather than special-casing every audit ID
(fragile — breaks whenever a new audit becomes top-3-ranked, or when
Lighthouse changes a detail schema), `describeAuditItem(item)` probes a
short list of common fields in priority order and returns the first
match, falling back to a generic "(no further detail)" rather than
throwing. Deliberately uses the simpler, stable `layout-shifts` audit for
CLS detail rather than the newer `cls-culprits-insight` insight-audit,
whose nested sub-table shape was confirmed more complex and more likely
to change across Lighthouse versions.

`errors-in-console` is checked unconditionally alongside the top-3
weighted audits (not ranked — it's not performance-category-weighted,
but cheap to check and a real signal: Pepe's review caught a wave of
401s here before the auth fix, now clean, worth keeping as a permanent
regression check for a future JS error).

### D5: Unit-testable pure functions, untested I/O orchestration
`rankAudits(lhr)` and `describeAuditItem(item)` are pure data transforms
(input → output, no I/O) — follow this project's standard TDD, extracted
as functions `run.mjs` itself exports (mirroring `discover-urls.mjs`'s
existing pattern: a separately-testable module, not inline `main()`
logic). The `summary.json` file-write calls (both suites) and k6's
`handleSummary` wiring itself are I/O orchestration with no
failing-test-first equivalent — same exemption this perf-suite lineage's
other orchestration code already has (`apps/api/perf/README.md`'s
documented line, `fix-web-perf-lighthouse-methodology`'s design.md D3 for
`run.mjs`'s own login()/runOnce()).

### D6: `discover-urls.mjs`'s ordering comment, no code change
Confirmed via `apps/api/internal/store/runs.go`: the paginated
`ListRuns` query backing `GET /api/v1/projects/{key}/runs` is
`ORDER BY tr.created_at DESC, tr.id DESC` — a real, stable, already-
enforced guarantee. `items[0]` being the most recent run isn't an
assumption that happens to hold; it's the documented, intentional
behavior of a query a future refactor would need to deliberately change.
One comment citing this, no test change (the existing
`discover-urls.test.mjs` already encodes "first item" in its mock's
response ordering).

## Risks / Trade-offs

- **jslib import adds an external HTTP fetch at k6 run time** (not a
  local dependency) → if `jslib.k6.io` is unreachable, `make perf-api`
  fails outright. Accepted: this is the standard, officially-documented
  k6 pattern, used by essentially every k6 script with a custom summary;
  k6 caches the fetched script after first use.
- **Weighted-audit ranking surfaces different audits run-to-run if
  scores shift slightly near a tie** → acceptable; it's diagnostic
  color on top of the existing median-of-3 score/vitals block, not a
  replacement metric anything else depends on.

## Migration Plan

No migration — pure test-tooling addition, no schema/API/production code
changes. Existing `make perf-api`/`make perf-web` invocations gain extra
output; nothing breaks for anyone already running them.
