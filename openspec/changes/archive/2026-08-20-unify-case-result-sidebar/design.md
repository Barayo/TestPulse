## Context

`CaseDetailPage.tsx` and `RunItemDetailPage.tsx` both render a
`CaseSidebarSection`-based sidebar next to a case's content, but they grew
independently: `CaseDetailPage` shows the case's spec identity (Properties →
Results → Version history), `RunItemDetailPage` shows one run's execution of
that case (Properties → History, where "History" is really just this item's
own append-only verdict log). Pepe's approved mock
(`https://claude.ai/code/artifact/ad53a16c-7cb9-4459-84fa-d5a04e56afff`)
decided the concrete shape: add a case link, promote already-fetched
classification data, add a real cross-run "Results" section to the run item
page, and rename "History" to "This run" to stop overclaiming scope. This
doc covers only the technical how.

## Goals / Non-Goals

**Goals:**
- Share the `CaseResultsPanel` data-shaping logic (`toResultsData`) between
  both pages instead of duplicating it.
- Add the case link and promoted classification fields to
  `RunItemDetailPage` using components/data that already exist.
- Keep both pages' member/public (authenticated/anonymous) data-fetch
  branches working exactly as today — this is a rendering/data-reuse change,
  not a new access pattern.

**Non-Goals:**
- No new API endpoints, no schema/migration changes.
- No change to `CaseDetailPage`'s section order (already Properties →
  Results → Version history — confirmed correct, not touched beyond the
  `toResultsData` extraction).
- No change to the recording form or the per-item verdict log's own content
  — "This run" is a rename only.

## Decisions

**D1 — `toResultsData` moves to `apps/web/src/lib/caseResultsData.ts`.**
Matches the existing convention for page-independent helpers
(`trimProjectBreadcrumb.ts`, `versionDiff.ts`, `useProjectPermissions.ts`
already live in `apps/web/src/lib/`). Exports `toResultsData` and re-exports
`RECENT_EXECUTIONS_LIMIT = 7` so both pages request the same window.
Alternative considered: leave it in `CaseDetailPage.tsx` and import it from
there — rejected, importing implementation detail out of a page module is a
worse dependency direction than a dedicated `lib` module for a two-line pure
function.

**D2 — `RunItemDetailPage`'s Results fetch is keyed off `item.caseKey`, added
alongside the existing per-item `results` fetch, not replacing it.**
The run item's `content` already carries the resolved case content, but
`item.caseKey` is what's needed to query
`/api/v1/{public/}cases/{caseKey}/executions?order=recent&limit=7` — same
endpoint and member/public branching pattern `CaseDetailPage` already uses.
Added as a third parallel fetch in the same `Promise.all`-driven load
sequence RunItemDetailPage already runs (see
`RunItemDetailPage.tsx:99-155`), gated on the same `resolvedAccess` branch so
member vs. public routing stays centralized in one place.

**D3 — "Test case" property row uses `item.caseKey` directly; no new
lookup.** `RunItem.caseKey` is already present on every fetched run item
(confirmed in `openapi.yaml`), so the link
(`/projects/{projectKey}/cases/{caseKey}`) needs no extra request.

**D4 — Classification pills reuse `ClassificationPills`/`AutomationPill`
from `apps/web/src/components/Pills.tsx` verbatim**, fed from
`item.content` (priority, testType, automated) exactly as `CaseDetailPage`
feeds them from `testCase.content` — same component, same props shape,
different source object.

**D5 — Section order on `RunItemDetailPage` becomes Properties → Results →
This run.** Matches `CaseDetailPage`'s Properties → Results → Version
history shape at the structural level (two shared-purpose sections, then one
page-specific section), without pretending the two "third" sections are the
same thing.

**D6 — Drop the standalone "Status" `PropertyRow`** on `RunItemDetailPage`
(redundant with the header `StatusBadge`) as part of this change, per Pepe's
flagged finding — small, in-scope, same file being touched for the property
row reorder anyway.

## Risks / Trade-offs

- [Two near-identical `CaseResultsPanel` fetches (case page vs. run item
  page) could drift if only one call site is updated later] → Mitigation:
  both now route through the same `toResultsData`/`RECENT_EXECUTIONS_LIMIT`
  from `lib/caseResultsData.ts`, so a future change to the shaping logic or
  window size only needs one edit.
- [Adding a third parallel fetch to `RunItemDetailPage`'s load sequence
  increases the page's initial request count] → Mitigation: matches
  `CaseDetailPage`'s existing behavior (already issues this same executions
  request), and the endpoint is already indexed/bounded
  (`ExecutionsByCaseRecent`, `LIMIT $2`) from `add-case-result-history`.

## Migration Plan

Purely additive UI change behind no flag — ships in one PR, verified via
existing e2e coverage plus new scenarios for the case link and the run
item's Results section. No data migration, no rollback beyond a normal
revert.

## Open Questions

None — Pepe's mock resolved the open design questions from the proposal
discussion.
