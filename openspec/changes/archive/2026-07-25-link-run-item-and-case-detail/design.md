## Context

`RunItemDetailPage` (today's `redesign-run-execution-view`) intentionally
duplicated `CaseDetailPage`'s steps rendering rather than sharing it, to
ship fast. `VersionDetailDialog`'s executions list already fetches
`CaseExecution` records (`runId`, `runName`, `verdict`, ...) but has no
way to link to the run item's own page since `CaseExecution` never
carried the run's human-readable key, only its internal id.

## Goals / Non-Goals

**Goals:**
- Real navigation both directions: run → case, case's version history →
  run item.
- `RunItemDetailPage` visually matches `CaseDetailPage`'s established
  patterns via a shared component, not a second hand-rolled copy.

**Non-Goals:**
- **Merging `RunItemDetailPage` and `CaseDetailPage` into one route.**
  `RunItemDetailPage` shows a *pinned, historical, read-only* version —
  the entire reason run-pinning exists is reproducibility (ROADMAP.md:
  a run pins each case "never at execution time — so a run's results are
  internally consistent and reproducible"). `CaseDetailPage`'s Edit mode
  creates a *new version of the current case*. A merged page would need
  to suppress edit affordances conditionally by route context — exactly
  the ad-hoc-branching-at-the-call-site pattern this app's own design
  system already avoids elsewhere, and a real data-integrity risk (a bug
  leaking edit capability into a historical execution view corrupts the
  reproducibility guarantee, not just the UI). Their identities also
  differ (case alone vs. case+run pair), which would muddy the breadcrumb
  logic fixed twice already today. The shared `CaseStepsList` component
  gets the "feels like one coherent thing" outcome without this risk.
- No click-to-filter, no run-level "created by" — still out of scope,
  unchanged from `redesign-run-execution-view`.

## Decisions

- **`CaseStepsList` takes read-only content only** (`steps`,
  `expectedResult`) — no edit affordances, no case-mutation callbacks.
  `CaseDetailPage`'s edit mode stays entirely separate, only its
  *display* mode switches to the shared component. This is what
  structurally prevents the merge-page risk above from creeping back in
  through the shared component itself.
- **`runKey` added to `CaseExecution`**, not resolved client-side from
  `runId` — mirrors today's `RunItem.caseKey` precedent exactly (the
  underlying query already has access to the run row).
- **Right-click menu, two items**: "Open execution" first (same weight/
  action as left-click, listed for discoverability of the shortcut menu
  itself), "Go to case in Library" second — matches `RowActionMenu`'s
  existing ordering convention (primary action first) seen in
  `FolderExplorerPage`.

## Risks / Trade-offs

- [Risk] Extracting `CaseStepsList` mid-flight touches `CaseDetailPage`,
  a heavily-tested existing page → Mitigation: extract behavior-preserving
  only (no visual/behavioral change to `CaseDetailPage` itself), full
  existing `CaseDetailPage.test.tsx` suite must stay green unmodified.
