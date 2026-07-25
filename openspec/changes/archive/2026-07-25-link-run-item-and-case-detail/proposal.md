## Why

`RunPage`'s item list and `CaseDetailPage`'s version-execution list both
reference the same underlying thing (a case, executed in a run) but never
link to each other — from a run you can't jump to the case's authoring
page without leaving and searching for it, and from a case's version
history you can see which runs executed it but can't open any of them.
Reviewing the redesigned run item page also showed it visually
under-uses patterns this app already has: steps render as bare text
instead of the numbered-card treatment `CaseDetailPage` already has,
result history is unstyled text with no verdict color or timestamp.

## What Changes

- `RunPage`'s item rows gain a right-click context menu: "Open execution"
  (same as left-click) and "Go to case in Library" (jumps straight to
  `CaseDetailPage`, skipping the execution page).
- `CaseExecution` gains a `runKey` field (small additive API change,
  mirrors `RunItem.caseKey` from `redesign-run-execution-view`) so
  `VersionDetailDialog`'s executions list can link each row to
  `/runs/{runKey}/items/{caseKey}` instead of being plain text.
- Steps rendering (numbered-badge card + expected-result callout)
  extracted from `CaseDetailPage` into a shared `CaseStepsList` component,
  used by both `CaseDetailPage` and `RunItemDetailPage` — same visual
  language, one implementation, not two independently drifting ones.
- `RunItemDetailPage`'s Status property row uses `StatusBadge` instead of
  raw text; History entries show a verdict dot + relative timestamp
  (`timeAgo`) instead of a bare text line; a real empty-state card for
  the (currently unhandled) zero-steps case.

**Explicitly not doing**: merging `RunItemDetailPage` and `CaseDetailPage`
into one page/route — see design.md for why (versioning/reproducibility
conflict, route-identity conflict). The shared `CaseStepsList` component
is the intended resolution to that ask.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: "Run execution board" gains the right-click scenario.
- `ui-navigation`: "Viewing an existing test case" — the executions-list
  scenario extends to link each row to the run item's page.

## Impact

- `apps/web/src/pages/RunPage.tsx` — `RowActionMenu` wiring on item rows.
- `apps/web/src/components/VersionDetailDialog.tsx` — executions list
  becomes links.
- `apps/web/src/components/CaseStepsList.tsx` (new, extracted).
- `apps/web/src/pages/CaseDetailPage.tsx`, `RunItemDetailPage.tsx` — both
  switch to the shared component; `RunItemDetailPage` gets the History/
  Status/empty-state polish.
- `apps/api/internal/domain/domain.go`, `store/executions.go` (or
  wherever `CaseExecution` is queried), `packages/shared/openapi.yaml` —
  add `runKey`.
