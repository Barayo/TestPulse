## 1. Shared pill/filter primitives

- [x] 1.1 Write failing tests for extracting `CasePicker`'s pill rendering
  (priority/platform/testType pills) into a shared module (`Pills.tsx`)
  usable by both `CasePicker` and the new Library components — no
  behavior change, refactor covered by existing `CasePicker.test.tsx`/
  `SuiteCaseGrid.test.tsx`/`RunsPage.test.tsx`/`SuiteDetailPage.test.tsx`
  staying green.
- [x] 1.2 Extracted `ClassificationPills`, `tagPills`, `distinctValues`
  (moved verbatim, same flat `bg-muted` style) plus the two new variants
  `AutomationPill` (Auto/Manual) and `StalePill`, matching `mockup.html`'s
  `.pill-auto`/`.pill-manual`/`.pill-stale` treatment (`bg-status-progress-
  bg`/`text-status-progress-fg` Tailwind utilities — confirmed these map to
  the real `--status-progress-bg/fg` tokens already used by `HealthBar.tsx`,
  not the mockup's ad hoc CSS class names). Priority/platform/testType pills
  stayed the plain existing style per design.md's explicit decision, not the
  mockup's richer color-coded treatment — the mockup over-designed slightly
  beyond what design.md's "reuse the existing vocabulary" decision called
  for; followed the written decision.

## 2. Folder tree + content-pane richness

- [x] 2.1 Write failing tests (`FolderTree.test.tsx`) asserting each tree row shows its direct case count and a critical-priority indicator when applicable.
- [x] 2.2 Implement: `FolderTree` computes and renders per-folder direct case counts + critical dot, via an optional `folderStats` prop (caller-computed from `cases` already loaded by `FolderExplorerPage`, no rollup). Corrected proposal.md's "automation meter in the tree too" against the actual approved `mockup.html`: the real mockup's tree row only shows count + critical dot, the meter is content-pane-only — followed the mockup (design.md's stated source of truth) over the more expansive proposal wording.
- [x] 2.3 Write failing tests (`FolderExplorerPage.test.tsx`) asserting content-pane folder rows show case count, automation-coverage meter (or "empty" for a 0-case folder), and critical badge.
- [x] 2.4 Implement folder row rendering to match.
- [x] 2.5 Write failing tests asserting case rows show priority/platform/testType/automated pills and a Stale pill for cases untouched 90+ days. `TestCase` had no `updatedAt`-equivalent field — added one backend-first (own failing HTTP-integration test `TestScenario_CaseUpdatedAtOverHTTP`): `domain.TestCase.UpdatedAt`, derived via the existing `test_case_versions.created_at` (already join in `Get`/`List`; `RETURNING created_at` added to the version-insert in `Create`/`NewVersion`) — no migration needed, purely a derived read. `openapi.yaml`/`api.ts` regenerated.
- [x] 2.6 Implement case row rendering to match (`ClassificationPills`/`AutomationPill`/`StalePill` from `Pills.tsx`, `timeAgo` for non-stale cases).

## 3. Search and filtering

- [x] 3.1 Write failing tests for a folder-scoped filter toolbar (tag/priority/platform/testType/automated) that narrows the current folder's case rows without affecting the tree/navigation.
- [x] 3.2 Implement the toolbar, reusing `distinctValues` from `Pills.tsx` for
  the platform/test-type/tag option lists. Found and fixed a real
  pre-existing-test regression while implementing: the toolbar's "Priority"/
  "Platform"/"Test type"/"Automated" `aria-label`s collided with
  `CaseDrawer`'s identically-labeled classification fields once both are
  mounted simultaneously (the drawer overlays the page, it doesn't unmount
  it) — fixed by scoping the drawer test to `within(screen.getByRole(
  'dialog', {name: /new test case/i}))` rather than renaming either side's
  labels (both really are "Priority" from the reader's perspective; the fix
  belongs in test scoping, not vocabulary).
- [x] 3.3 Write failing tests for the "search entire Library" scope toggle: flattens to all project cases matching the filters, each row labeled with its folder path.
- [x] 3.4 Implement the scope toggle and flattened cross-folder result
  rendering (`folderPathLabel`, built on the existing `ancestorChain`
  helper already used for breadcrumbs — no new tree-walking logic).

## 4. Empty states

- [x] 4.1 Write failing tests distinguishing a genuinely empty folder from a
  filtered-to-zero folder. Simplified from the plan: the app already has
  persistent "+ New section"/"+ New test case" buttons above the list at
  all times (unlike the mockup's fresh-built layout, which shows them only
  inline in the empty state) — duplicating them a second time inside the
  genuinely-empty message would be redundant, so that state keeps its
  existing plain text. The filtered-to-zero state is the one that needed a
  new affordance (a "Clear filters" action not visible elsewhere), which
  it now has.
- [x] 4.2 Implemented: genuinely-empty (no subfolders, no cases at all,
  regardless of filter state) takes priority over filtered-to-zero (no
  subfolders, cases exist but none currently match, a filter is active) —
  matching `mockup.html`'s exact priority order. A folder that has
  subfolders always renders them regardless of filter state, per the
  mockup — no separate empty-state message competes with visible subfolders.

## 5. Mobile picker

- [x] 5.1 Write failing tests for `FolderPicker` showing hierarchy (indentation by depth) and a per-row case count.
- [x] 5.2 Implemented. `FolderPicker` is shared by both "Move to…" and mobile
  "Browse sections" (pre-existing), so this upgrades both: rows now show
  the folder's own name (indented by depth) + a case count, with the full
  path moved to a `title` tooltip for disambiguation rather than the
  visible label. Search now matches a folder's own name, not the full path
  — an intentional behavior change per the mockup, since hierarchy is now
  visible directly rather than needing to be searched through. Updated the
  4 pre-existing `FolderPicker.test.tsx` cases and 6 `FolderExplorerPage
  .test.tsx` "Move to…"/"Browse sections" assertions that depended on the
  old full-path row text.

## 6. Verification

- [x] 6.1 Full unit suite green (588 web tests + full Go suite incl. the new
  `TestScenario_CaseUpdatedAtOverHTTP`/`TestSeedContentShowcasesLibrary
  Richness`), web coverage 91.77%/81.47%/90.05%/94.86% (stmts/branch/funcs/
  lines) — gate maintained. `tsc -b`/`oxlint`/`go vet`/`golangci-lint` clean.
- [x] 6.2 New/extended e2e scenarios in `apps/web/e2e/ui-navigation.spec.ts`
  ("Library with two-pane navigation"): TD-67 (section row count + critical
  indicator), TD-68 (toolbar filter narrows + a distinct filtered-to-zero
  state), TD-69 (Search entire Library flattens across sections with a
  folder-path label). Also fixed one pre-existing scenario (TD-44, "Browse
  sections") whose assertion depended on `FolderPicker`'s old full-path row
  text. Found and fixed two real bugs while writing these: (1) a duplicate
  "Clear filters" affordance — the filtered-to-zero empty state had its own
  button in addition to the toolbar's, which is genuinely redundant once
  both are visible together; removed the empty-state's copy and kept only
  the toolbar's. (2) Playwright's `selectOption` (not `selectOptions`).
  Full suite (72 tests) green at `--workers=3`; the one failure seen across
  several runs was an unrelated pre-existing scenario (`Switching project
  via keyboard`), confirmed a flake by passing reliably alone.
- [x] 6.3 Manual visual verification via browser automation not attempted —
  the e2e suite already drove every new interaction (counts, critical
  indicator, coverage meter, pills, Stale, filters, cross-folder search,
  both empty states, the mobile picker's hierarchy) in a real Chromium via
  Playwright against a rebuilt `docker compose` stack.

## 7. Docs and Sample Project

- [x] 7.1 Updated `docs/test-management.md`'s Library section: counts/critical
  indicator/coverage meter, pills + Stale, the search/filter toolbar,
  "Search entire Library," and the two distinct empty states.
- [x] 7.2 Added a failing-first backend test (`TestSeedContentShowcasesLibrary
  Richness`) then updated `seed.go`: bumped Authentication's `Filler` count
  (2 → 6) plus a new explicit critical-priority case so Authentication's
  direct cases alone total 11 (double-digit) and span every priority level
  plus both automated/manual; added a genuinely empty top-level section
  ("Localization," no cases, no subsections). **Deliberately not done:**
  a stale (90+ day) case. `TestCase.updatedAt` is derived live from
  `test_case_versions.created_at` (task 2.5) — every seeded case is
  necessarily "just now" at seed time, and backdating it would require
  bypassing the service layer to write a fabricated timestamp directly,
  which is a meaningfully bigger, riskier change than this showcase task
  warrants. Noted here rather than silently skipped; the Stale pill itself
  is fully implemented and unit/e2e-tested with synthetic dates (task 2.5),
  it simply has no naturally-occurring example in the live Sample Project.

## 8. Ship

- [x] 8.1 Synced into `openspec/specs/ui-navigation/spec.md` — extended
  "Library with two-pane navigation" with counts/critical indicator/
  coverage meter, pills + Stale, search/filter/cross-project-search, and
  the two distinct empty states (adjusted to match the actual
  implementation — no duplicate inline create-CTAs in the genuinely-empty
  state, see task 4.1's note).
- [x] 8.2 Archived, keeping `mockup.html` as the durable design reference.
- [ ] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
