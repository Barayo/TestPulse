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
- Suite index cards show name, tags, pass-rate health bar, case count, and last-run
  time, matching `ProjectsPage.tsx`'s card richness and `HealthBar.tsx`'s existing
  healthy/in-progress/at-risk bands.
- A dedicated `/projects/{projectKey}/suites/{suiteKey}` page, structurally matching
  `CaseDetailPage`/`RunItemDetailPage`'s established pattern.
- Case filtering/selection inside the detail page reuses the existing `SuiteCaseGrid`
  filter-safe-selection logic — no reimplementation.
- Sidebar surfaces case count, pass rate, last run, created date, tags, and
  rename/delete actions (rename is new; delete already existed as a destructive action
  elsewhere and gets a home here).

**Non-Goals:**
- No change to the suite/case membership API (`PUT`/`DELETE .../cases/{caseKey}`) —
  purely navigation/visual.
- No bulk suite actions (multi-select delete, etc.) — out of scope, not requested.
- No new pass-rate *trend* chart on this page — that's `add-suite-pass-rate-trend`'s
  own scope (a sparkline/points-over-time view); this change only needs a single
  current-pass-rate number for the health bar, not the trend itself.

## Decisions

- **Suite pass rate is read from `add-suite-pass-rate-trend`'s `SuiteTrend` endpoint
  rather than building a second, parallel "current pass rate" read.** That backend
  work (`GET /api/v1/suites/{suiteKey}/trend`) already exists in this repo's working
  tree (uncommitted, from earlier this session) and returns per-run points ordered
  oldest-first; "current pass rate" is simply the last point's pass count / total.
  Building a separate lightweight endpoint would duplicate a query that already
  exists. **This change therefore depends on `add-suite-pass-rate-trend` landing
  first** (or in the same PR) — call this out explicitly in tasks.md and in whatever
  priority ordering is set for the backlog.
  - Alternative considered: compute pass rate client-side from `/suites/{key}` plus a
    naive "last run" lookup. Rejected — would need its own aggregate query anyway
    (per the standing "design aggregates for DB scale, not client loops" guidance),
    so reusing the already-designed, already-tested trend endpoint is strictly less
    work and avoids a second source of truth for the same number.
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

## Risks / Trade-offs

- [Depending on uncommitted `add-suite-pass-rate-trend` work introduces a sequencing
  constraint] → Acceptable: that work is backend-only, already tests-green when last
  run individually, and finishing it here closes out session debt rather than
  creating new debt.
- [Removing the `#suite-{key}` hash-deep-link changes a URL pattern the
  `run-detail-rework-mockup.html`'s suite link already points at] → Update that
  link (in the `rework-run-detail-ux` change, not yet implemented) to the new
  `/projects/{projectKey}/suites/{suiteKey}` route instead of the hash form —
  flag as a cross-change follow-up in that change's tasks.md.

## Migration Plan

Frontend + one small backend addition (rename endpoint, if it doesn't already
exist — verify during implementation) plus landing the existing uncommitted
pass-rate-trend backend work. No destructive migration; ships as a regular deploy.
