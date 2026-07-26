## Context

`SuitesPage.tsx` (post `rework-suite-membership-ux`) combines a name+`SuiteCaseGrid`
create-form and a bare index list on one page; selecting a suite opens a slide-over
dialog with the same grid for editing. Functionally solid, but suites remain the only
entity in the app without their own dedicated page — cases and run items both have
Breadcrumbs + a `grid grid-cols-1 md:grid-cols-[1fr_320px]` full page. Backlog issues #16
and #50 (read in full this session) independently call for the same fix: a real suite
view with browsing/filtering, and health indicators matching what `ProjectsPage.tsx`
already shows.

A Pepe/Fable-5 mockup (`mockup.html`, this directory), user-approved, is the visual/
interaction source of truth — read it alongside this doc.

## Goals / Non-Goals

**Goals:**
- Suite index cards show name, pass-rate health bar, case count, and last-run
  time, matching `ProjectsPage.tsx`'s card richness and `HealthBar.tsx`'s existing
  healthy/in-progress/at-risk bands.
- A dedicated `/projects/{projectKey}/suites/{suiteKey}` page, structurally matching
  `CaseDetailPage`/`RunItemDetailPage`'s established pattern.
- Case filtering/selection inside the detail page reuses the existing `SuiteCaseGrid`
  filter-safe-selection logic — no reimplementation.
- Sidebar surfaces case count, pass rate, last run, created date, and
  rename/delete actions (rename is new; delete already existed as a destructive action
  elsewhere and gets a home here).

**Non-Goals:**
- No change to the suite/case membership API (`PUT`/`DELETE .../cases/{caseKey}`) —
  purely navigation/visual.
- No bulk suite actions (multi-select delete, etc.) — out of scope, not requested.
- No new pass-rate *trend* chart on this page — `add-suite-pass-rate-trend`'s
  `SuitePassRateTrend` component (a sparkline/points-over-time view) stays
  unused here; this change only needs a single current-pass-rate number per
  suite, computed by its own batched query (see Decisions), not the trend.

## Decisions

- **Revised during implementation:** originally planned to reuse
  `add-suite-pass-rate-trend`'s `SuiteTrend` endpoint for "current pass rate."
  Caught before writing frontend code: `SuiteTrend` is per-suite and
  closed-runs-only — right for a future trend chart, wrong shape for an
  **index of many suites**, where calling it once per card is exactly the
  N+1-requests-on-page-load anti-pattern `useProjectSummaries` already caused
  a real incident over. Instead: **`SuiteRepo.List` and `SuiteRepo.Get` both
  gain `PassRate *int`/`LastRunAt *time.Time`, computed via one additional
  batched "latest run per suite" query**, byte-for-byte mirroring
  `ProjectRepo.Summaries`'s existing pattern (`DISTINCT ON (suite_id) ...
  ORDER BY suite_id, created_at DESC`, latest run regardless of open/closed
  status — same semantic `ProjectSummary` already uses, for consistency with
  the project list's own card). `List` costs one extra grouped query total
  for every suite in the project, not one per suite. `add-suite-pass-rate-trend`'s
  `SuiteTrend` endpoint is unused by this change — it remains available for
  a future dedicated trend-chart page, but this rework does not depend on it.
- **The route is a new top-level suite key route, not nested under a suite-list
  index route's client state.** `/projects/{projectKey}/suites/{suiteKey}` mirrors
  `/projects/{projectKey}/cases/{caseKey}` exactly — a real navigable, bookmarkable,
  back-button-safe URL, replacing the `#suite-{key}` hash-based dialog-opening
  mechanism `SuitesPage.tsx` currently uses.
- **Suite creation navigates straight into the new (empty) suite's detail page**
  instead of using an inline form + grid on the index, matching the mockup's "Suite
  created — add cases below and save when ready" flow. Removes the dual-purpose
  index page (list + create form) in favor of index-is-only-a-list, consistent with
  how Library and cases separate browsing from creation.
- **Three new suite endpoints are needed, not one.** Verified against
  `handlers.go`: today a suite can only be listed (as part of the project's full
  list), created, and have cases added/removed — there is no way to fetch one
  suite by key, rename it, or delete it. All three are needed for the detail
  page shell itself (direct-link fetch, the Rename modal, the Delete action) and
  are small, mechanical additions following the exact pattern `GET/PUT/DELETE
  /cases/{caseKey}` already establishes — not a new capability worth its own
  proposal.
- **No new permission flag.** The RBAC model deliberately fixes ten
  per-resource permission flags (`domain.go`'s "ten concrete flags" design
  note) — adding an eleventh (e.g. `suiteDelete`) would touch the
  `Role`/`Permissions` structs, a migration, `RolesPage.tsx`, and seed roles,
  for a capability used in exactly one place. Instead: `GET /suites/{suiteKey}`
  requires `read` (matches every other single-entity GET); `PUT
  /suites/{suiteKey}` (rename) requires `suiteEditMembership`, broadened in
  meaning from "case membership" to "suite management" generally, since the
  same actor tier should reasonably hold both; `DELETE /suites/{suiteKey}`
  requires `manageProject`, matching the existing precedent for a destructive,
  infrequent, admin-gated action (the same permission already gates reopening
  a closed run).

## Risks / Trade-offs

- [Removing the `#suite-{key}` hash-deep-link changes a URL pattern the
  `run-detail-rework-mockup.html`'s suite link already points at] → Update that
  link (in the `rework-run-detail-ux` change, not yet implemented) to the new
  `/projects/{projectKey}/suites/{suiteKey}` route instead of the hash form —
  flag as a cross-change follow-up in that change's tasks.md.
- [`enrich-project-landing-panels`'s Suites panel also needs a suite pass rate,
  and its design.md still says it depends on `add-suite-pass-rate-trend`] →
  That dependency is now stale too — it should read `domain.Suite.PassRate`
  (this change's batched field) once this change ships, not the trend
  endpoint. Flagged as a cross-change correction for that change's design.md.

## Migration Plan

Backend: `domain.Suite` gains `PassRate`/`LastRunAt`, `SuiteRepo.List`/`Get`
gain one additional batched query each, plus the three new suite endpoints
(GET/rename/delete). Frontend: index + new detail page. No destructive
migration; ships as a regular deploy.
