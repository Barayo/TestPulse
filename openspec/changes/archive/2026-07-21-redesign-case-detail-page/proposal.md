## Why

Test case detail today opens in `CaseDrawer`, a fixed 420px slide-over that never grows on
desktop and mixes badges/inline-prose/bare-text for what are all just scalar properties. A
design exploration (three layout options, mocked against TestPulse's real tokens) settled on
a page-based layout with a persistent properties/results/history sidebar — this change locks
that decision in before `add-case-result-history` (a follow-up) has real data to put in the
Results section.

## What Changes

- Replace `CaseDrawer`'s `mode="view"` experience with a routed detail page at
  `/projects/{projectId}/cases/{caseId}` (via `react-router-dom`, already in use). `mode="create"`
  is unaffected — case creation stays a lightweight drawer.
- Layout: title + steps as the full-width primary content; a persistent right sidebar
  (Properties, Results, Version history) on viewports ≥768px, collapsing into stacked,
  independently-expandable accordions in the same order below that width. No separate
  mobile-only design — one layout, one breakpoint.
- New shared **property row** pattern (`Label: value`, mono/uppercase label) for every scalar
  case property (test type, automation, platform, tags, version, suites). Badges are reserved
  for priority only, replacing today's inconsistent badge/prose/bare-text mix.
- The Results sidebar section ships as a fully designed **empty state** (section label,
  placeholder chart chrome, one-line explanation) — no result-history data or backend endpoint
  in this change; that's `add-case-result-history`'s job.
- New `docs/design-system.md`: the property-row pattern, badge-usage rule, chart-color-token
  reuse rule (`--chart-1`..`--chart-5`, never invent new hues), and the empty-state/responsive
  rules, as the reference future entity-detail pages check against.
- `docs/test-management.md` updated for the new route and navigation behavior.
- `ROADMAP.md` gets a line recording that this pulls test case detail out of the v0.1 "thin
  everywhere except the run execution board" UI-thickness tier into a more polished treatment —
  a conscious pull-forward, the same way `add-project-rbac` was pulled forward from v0.2.

## Capabilities

### New Capabilities
(none — this changes how an existing capability's requirement is met, not new behavior)

### Modified Capabilities
- `ui-navigation`: "Viewing an existing test case" changes from an unspecified read-only view
  to a dedicated route with a defined content+sidebar layout, the property-row display pattern,
  and mobile accordion collapse.

## Impact

- **Frontend**: `apps/web/src/components/CaseDrawer.tsx` splits — `mode="view"` becomes a new
  routed page component; `mode="create"` keeps using the existing drawer. A new route is added
  to the app's router config. `apps/web/src/pages/FolderExplorerPage.tsx` changes from opening
  drawer state to navigating to the case route.
- **Docs**: `docs/design-system.md` (new), `docs/test-management.md` (updated), `ROADMAP.md`
  (settled-decision note).
- **No backend, API, or schema changes** — pure frontend routing/layout plus documentation.
