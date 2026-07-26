## Context

`FolderExplorerPage.tsx` is a two-pane tree+list explorer (folder tree left, current
folder's subfolders+cases right). Functionally correct — the IA itself is not the
problem, confirmed both by re-reading the component and by research into comparable
tools (TestRail, Xray, qTest, Zephyr, Kiwi TCMS, plus VS Code/Notion/Linear as
non-test-tool references): none of them combine a tree, always-visible per-item
metadata, and an inline filter bar well, which is exactly TestPulse's opportunity.
Rows currently render icon + name only; no case counts, no metadata, no search.

A Pepe/Fable-5 design pass produced an interactive mockup (`mockup.html`, this
directory), user-approved, that is the visual/interaction source of truth for this
change — read it alongside this doc rather than re-deriving the layout from prose.

## Goals / Non-Goals

**Goals:**
- Case counts visible at every level (tree row, content-pane folder row) without
  opening a folder.
- Case metadata (priority/platform/testType/automated/tags) visible per row without
  opening a case, reusing `SuiteCaseGrid`'s existing pill components/classes rather
  than inventing new ones.
- Filter-safe search and filtering across the current folder, plus an explicit
  "search entire Library" mode that flattens and shows each match's folder path.
- Distinguish a genuinely empty folder (CTA to fill it) from a filtered-to-zero
  result (CTA to clear filters) — these are different situations and need different
  affordances.
- Mobile `FolderPicker` shows hierarchy + counts, not a flat list.

**Non-Goals:**
- No IA change — tree+list stays; this is a richness/scannability fix, not a
  navigation redesign (unlike `rework-suite-membership-ux`, which had a genuine
  structural problem).
- No pass-rate/run-health signal on this page. Library is the authoring repository;
  a case's *execution* health belongs to Suites/Runs. Showing a health band here
  would misleadingly imply a section's tests are passing/failing, when a section is
  just a set of authored cases. Authoring-relevant signals only: automation
  coverage, critical-priority count, staleness.
- No recursive case-count rollup (a folder's count includes descendant folders'
  cases). Direct-children counts only, computed client-side from data already
  fetched. A recursive rollup would need a dedicated backend aggregate query
  (consistent with the standing "design aggregates for DB scale, not client loops"
  guidance) — flagged as possible future work, not built here.
- No change to folder/case CRUD flows beyond the visual polish already listed.

## Decisions

- **Reuse `SuiteCaseGrid`'s pill/filter vocabulary rather than inventing a second
  one.** The suite-membership rework already solved "filterable, badge-annotated
  case row" once; Library needs the same primitives (priority/platform/testType
  pills, tag/priority/platform/testType filter selects) plus two additions specific
  to authoring (Auto/Manual pill, Stale pill). Implementation should factor the
  shared pieces (pill rendering, filter-select population from live data) into
  something both `SuiteCaseGrid` and the Library row/toolbar can use, rather than
  duplicating the pill CSS/logic a second time.
- **"Stale" reuses the `--status-progress-bg/fg` (amber) tokens for a different
  meaning** (case not updated in 90+ days) rather than introducing a new color —
  Library has no execution context of its own to justify a new semantic tint, and
  amber ("needs attention, not broken") is the correct existing register.
- **Cross-folder search is a scope toggle, not a separate page/route.** Folder-
  scoped search alone doesn't solve "I can't find a case without navigating the
  tree" (the actual gap identified); a toggle that flattens the current filtered
  view to the whole project, with a per-row folder-path label, solves it without a
  new navigation surface.
- **Automation-coverage meter is single-tone teal, not banded (good/warn/bad).** A
  manual-heavy section isn't "unhealthy" the way a low pass-rate is — banding it
  would borrow Suites' health semantics for a metric that isn't health.

## Risks / Trade-offs

- [Adding 4–6 filter selects + search + scope toggle to a toolbar crowds a narrow
  viewport] → Toolbar wraps (`flex-wrap`) on narrow widths, same as `SuiteCaseGrid`'s
  existing filter row; verify at the app's actual mobile breakpoint during
  implementation, not just in the mockup's fixed-width preview.
- [Client-side direct-count-only stats could read as "wrong" if a user expects a
  recursive rollup] → The Project landing page's existing Library panel already
  sets this precedent (direct counts, not rollups) — consistent with prior art,
  not a new inconsistency.

## Migration Plan

Pure frontend change, no schema/API impact. No migration needed — ships as a
regular deploy once merged.
