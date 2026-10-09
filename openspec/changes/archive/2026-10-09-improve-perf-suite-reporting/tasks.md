## 1. `discover-urls.mjs` ordering comment (finding 3, near-free)

- [x] 1.1 Add a comment above the `items[0]` selection in
      `apps/web/perf/discover-urls.mjs` citing
      `apps/api/internal/store/runs.go`'s `ORDER BY created_at DESC` as
      the real, already-enforced guarantee backing "first item is the
      most recent run." No code or test change.

## 2. Web suite: `rankAudits`/`describeAuditItem` (TDD — pure functions, D3/D4)

- [x] 2.1 Write a failing Vitest test for `rankAudits(lhr)`: given a
      mocked `lhr.categories.performance.auditRefs` (several audits with
      varying `weight`/`score`) and matching `lhr.audits`, it returns the
      top 3 by `weight * (1 - score)`, each as `{ id, title, impact }`,
      descending by impact.
- [x] 2.2 Write a failing test for the all-perfect-scores case: an `lhr`
      where every audit scores 1 returns an empty array (nothing to
      report), not three zero-impact entries.
- [x] 2.3 Implement `rankAudits()` — extracted to a new sibling module,
      `apps/web/perf/audit-insights.mjs`, to pass both tests.
- [x] 2.4 Write a failing test for `describeAuditItem(item)`: given an
      item shaped like a `layout-shifts` entry (`node.nodeLabel`/
      `node.selector`), returns a string built from those fields.
- [x] 2.5 Write a failing test for an item shaped like a `url`-only
      entry (e.g. `unused-javascript`'s items), returns a string built
      from the URL.
- [x] 2.6 Write a failing test for an item with none of the known fields,
      returns a fixed fallback string rather than throwing or returning
      `undefined`.
- [x] 2.7 Implement `describeAuditItem()` (same module) to pass all three
      tests.
- [x] 2.8 Run the full web test suite, confirm everything passes and no
      regressions. (149/149 test files, 1883/1883 tests.)

## 3. Wire the web suite's new reporting into `run.mjs`

- [x] 3.1 After each page's existing score/vitals console output in
      `main()`, call `rankAudits()` against that page's (first, or a
      designated representative) Lighthouse result, print each ranked
      audit's title plus `describeAuditItem()` output for its first 1-2
      `details.items` entries (if any). (Discovered mid-implementation:
      some scored audits — `cumulative-layout-shift`,
      `largest-contentful-paint` — carry no `details.items` of their
      own; added a small `detailAuditId()` override map, TDD'd, pointing
      at the actual companion audit that has the per-element detail.
      Also found `nodeLabel` values are often multi-line; added a
      one-line collapse+truncate helper, TDD'd, to keep each printed
      detail line to one line as the spec intends.)
- [x] 3.2 Also print `errors-in-console`'s item count unconditionally
      per page (0 or more), independent of the ranked audits.
- [x] 3.3 At the end of `main()`, write `apps/web/perf/.results/
      summary.json` containing the existing `results` array (D2 — no new
      computation, with the heavy per-page `lhr` object stripped out).
- [x] 3.4 Run `make perf-web` against a running compose stack; confirm
      the new console output appears and `summary.json` is written with
      the expected shape.

## 4. k6 suite: `summary.json` via `handleSummary` (D1)

- [x] 4.1 Add `import { textSummary } from 'https://jslib.k6.io/k6-
      summary/0.0.2/index.js'` to `apps/api/perf/summaries-and-run-
      items.js`.
- [x] 4.2 Implement `handleSummary(data)`: returns `{ stdout:
      textSummary(data, { indent: ' ', enableColors: true }), 'apps/api/
      perf/.results/summary.json': JSON.stringify(data, null, 2) }`
      (kept the full object — k6's own standard shape, not worth
      re-deriving a smaller subset).
- [x] 4.3 Add a `.gitignore` entry for `apps/api/perf/.results/`.
- [x] 4.4 Run `make perf-api` against a running compose stack (with
      `make seed-perf` and `TESTPULSE_PERF_TOKEN` set per its existing
      prerequisites); confirm the terminal summary looks the same as
      before this change and `apps/api/perf/.results/summary.json` is
      written. (Discovered mid-implementation: k6's file-writer can't
      create a missing directory — added `mkdir -p apps/api/perf/
      .results` to the `perf-api` Makefile target, mirroring how
      `run.mjs` already does this explicitly for the web suite.)

## 5. Documentation and verification

- [x] 5.1 Update `apps/api/perf/README.md` and `apps/web/perf/README.md`
      to mention the new `summary.json` output and (for the web suite)
      the per-page diagnostic detail now printed.
- [x] 5.2 Confirm `make lint`, `make test`, and `make coverage-web` all
      stay green. (Also ran `make build` — clean.)

## 6. Sample Project showcase

- [x] 6.1 Confirm (per design.md's Non-Goals) that no `seed.go` change is
      needed — dev/test tooling only. No action beyond this confirmation.
