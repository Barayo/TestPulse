## Context

`CaseDetailPage.tsx`'s Version history list (`redesign-case-detail-page`) currently renders
`<li>v{n}</li>` rows with a date or a "current" badge — nothing clickable, no content shown.
Two facts make the two features this change adds cheaper than they look:

- `GET /api/v1/cases/{caseId}/versions` (`listCaseVersions`) already returns each version's
  full `content` (title, description, steps, expectedResult, priority, tags, platform,
  testType, automated) — `CaseDetailPage.tsx` already fetches this array (`versions` state,
  L61) and only renders `v.version`/`v.createdAt` from it today.
- `RunItem` (`apps/api/internal/domain/domain.go` L211-221) already carries `CaseVersion int`,
  pinned at run-item creation (`RunRepo.pinItem`, `runs.go`) and never mutated afterward. What's
  missing is a query that lists items *by case* across every run — today's only items query,
  `RunRepo.Items`, is scoped to one `run_id` (`runs.go` L139-178).

## Goals / Non-Goals

**Goals:**
- Clicking a version opens a dialog showing what changed vs. the previous version — a
  field-by-field diff, not a full second copy of the case to read side-by-side.
- The same dialog answers "where did this version run, and did it pass" — a flat list of
  executions plus a binary Flaky flag (both a pass and a fail/blocked among this version's
  executions).
- Reuse existing conventions: `CaseResultsPanel`'s verdict color/label map, the `Dialog`
  component already used for "Move to…"/destructive confirmations, `PropertyRow`-style
  labeling where it fits.

**Non-Goals:**
- Character-level text diffing of step content (e.g. word-level highlighting within a changed
  action string). A changed field is shown old→new in full; that's enough to answer "what
  changed" without building a text-diff algorithm this change doesn't need.
- Any statistical flakiness score, confidence interval, or trend line — "both pass and fail
  exist for this version" is the entire signal. A richer model belongs to `add-reporting`
  (v0.3, issue #11) if it's ever built.
- Wiring `CaseResultsPanel`'s overall (not-per-version) results chart — that's the deferred
  `add-case-result-history` change; this one is scoped to the per-version dialog only.
- Restoring a version or structured audit detail for moves/restores — that's `add-version-restore`
  (issue #35), which this change doesn't touch or depend on.

## Decisions

**One dialog serves both #54 (diff) and #55 (executions), not two separate surfaces.**
Both are naturally "tell me more about version N," triggered from the same click. Splitting
them into a diff modal and a separate executions view would mean two entry points for one
mental question and duplicate plumbing (both need the clicked version + its neighbor's
content). `VersionDetailDialog` (new, `apps/web/src/components/`) takes the full `versions`
array already loaded by `CaseDetailPage` plus the clicked version number, computes the diff
against `version - 1` locally (no new fetch — the content is already in memory), and fetches
`GET /api/v1/cases/{caseId}/executions` itself, filtered client-side to the clicked version.

**The executions-by-case query lives on `RunRepo`, not `CaseRepo`.** It queries
`test_run_items JOIN test_runs`, both tables `RunRepo` already owns (`Items`, `pinItem`) —
keyed by `case_id` doesn't change which repo owns the join. `Service.CaseExecutions` is a thin
forward (`s.store.Runs.ExecutionsByCase`), mirroring `Service.CaseVersions` forwarding to
`s.store.Cases.Versions` today.

**Verdict signal is `RunItem.CurrentStatus`, not the `Result` append-only log.** Each run item
already exposes its current status (`pending/pass/failed/skipped/blocked/retest`) directly on
`test_run_items` — that's what `RunRepo.Items` already returns and what the run board already
displays as "the" verdict for an item. Reading the full `Result` history per item (to show every
retry, not just the final state) is unnecessary for a flakiness signal answering "pass or fail
happened for this version" and would multiply the query's row count for no benefit here.

**A version is Flaky iff its executions include ≥1 `pass` and ≥1 of `failed`/`blocked`.**
`skipped`/`pending`/`retest` don't count toward either side — they're not an executed
pass-or-fail outcome. This is deliberately binary (a badge, not a percentage) — matches the
issue's own framing ("3 pass, 2 fail across the same version" flagged distinctly), and avoids
inventing a threshold (e.g. "flaky if <90% pass") this change has no evidence to justify.

**New index, amended into the existing migration file.** Per the pre-1.0 "amend in place"
policy (`CLAUDE.md`), `test_run_items(case_id, case_version)` gets a new `CREATE INDEX` appended
to `apps/api/internal/db/migrations/00002_core_domain.sql` (where the table itself is defined),
not a new `0003_*.sql` file — goose reapplies the amended migration idempotently at startup.

**`CaseDetailPage.tsx`'s header lost its "Close" button, then its replacement "← Back to
Library" link, in two rounds of live design review.** `Close` was a leftover from the page's
`CaseDrawer` heritage — the natural label for dismissing a slide-over, never re-examined once
the page became a routed page with its own breadcrumb; it also competed visually with `Edit`,
equal-weight and adjacent, for two actions of very different consequence. First fix: drop
`Close`, add a standalone "← Back to Library" link above the title. Live review caught that
this duplicated the breadcrumb's own last clickable segment — and did it worse, always jumping
to the library root rather than the case's actual parent folder. Settled treatment: no
standalone line; a small `←` sits directly before the title (same row, not a separate one),
linking to the case's real parent folder (`folder ?? root`, matching the breadcrumb's own
granularity) via an `aria-label="Back to {folderName}"` for an accessible name despite the
arrow-only visible text. Documented in `docs/design-system.md` ("Don't add a 'back' control
that duplicates the breadcrumb") so a future entity-detail page doesn't reach for the same
redundant standalone-link pattern by default.

## Risks / Trade-offs

[The oldest version has no predecessor to diff against] → the dialog shows "This is the first
version — nothing to compare it to" instead of an empty/broken diff view.

[A case with many versions × many runs could make the executions list long] → out of scope to
paginate for this change (no project in dogfooding has approached that volume); flagged here so
a future change knows to revisit if it becomes real.

[`VersionDetailDialog` needs both the diffed version's content and its predecessor's — if a
version's predecessor was hard-deleted or otherwise missing] → versions are immutable and never
deleted (`Immutable test case versioning` requirement, `test-authoring` spec) — every version
from 1 to current always exists, so "predecessor missing" cannot happen except for version 1,
which is handled explicitly (see first Decision's oldest-version case).
