## Why

The run view is the one screen ROADMAP.md v0.1 designates as deliberately
polished ("thin everywhere except the run execution board"), but it hasn't
had that investment yet: a bare item list, a plain-text status summary, no
visualization, and per-item execution metadata (`testName`, `platform`,
`tags`, timing) already captured from JUnit imports but never rendered.
Reviewing the first real dogfooding run also surfaced a structural
inconsistency: the board uses a two-column split-pane (list + detail pane
side by side), while `CaseDetailPage` (this app's other content-heavy
page) uses a single-window routed page with a content+sidebar layout —
two different patterns for the same kind of "view one thing's details"
job.

## What Changes

- The run item detail pane becomes its own routed page
  (`/runs/:runKey/items/:caseKey`), styled like `CaseDetailPage`
  (content + sticky sidebar, breadcrumb ending at the run) — not a side
  panel. `RunPage` itself becomes a list + summary, matching how
  `FolderExplorerPage` presents a content list.
- A run-level status breakdown visualization (segmented bar covering all
  six statuses: pending/pass/failed/skipped/blocked/retest) plus pass
  rate, replacing the current plain-text summary line.
- Per-item `testName`, `platform`, `tags` render in the item list; the
  item detail page's sidebar also shows these plus pinned version info.
- New chart color assignments: `--chart-4` → blocked, `--chart-5` →
  pending, a texture fill → retest (no new hue introduced, per
  `docs/design-system.md`'s chart-color rule).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: "Run execution board" changes from an inline
  split-pane to a list+navigation model; a new "Run item detail page"
  requirement covers the routed page itself.

## Impact

- `apps/web/src/pages/RunPage.tsx` — simplifies to list + summary,
  removes the split-pane/detail-pane code (built on top of
  `fix-run-close-reopen-feedback`, implemented first since it touches the
  same file).
- New `apps/web/src/pages/RunItemDetailPage.tsx` (new route in `App.tsx`).
- New `apps/web/src/components/RunStatusBreakdown.tsx` (the segmented bar).
- `apps/web/src/index.css` — chart-4/chart-5/texture assignments for
  blocked/pending/retest.
- `apps/web/e2e/test-execution.spec.ts` — scenarios updated for
  navigation instead of in-page selection.
- One small additive API change discovered mid-implementation: `RunItem`
  gained `caseKey` (the route needs it; see `design.md`). Everything else
  (`testName`/`platform`/`tags`/timing) was already present.
- **Deferred, explicitly out of scope**: click-a-status-segment-to-filter
  the item list; "created by" surfaced via the audit log; the semi-donut
  gauge alternative to the segmented bar.
