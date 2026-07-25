## 1. Shared pill/filter primitives

- [ ] 1.1 Write failing tests for extracting `SuiteCaseGrid`'s pill rendering (priority/platform/testType pills) into a shared module usable by both `SuiteCaseGrid` and the new Library components — no behavior change, refactor covered by existing `SuiteCaseGrid.test.tsx` staying green.
- [ ] 1.2 Extract the shared pill components/classes; add the new `Auto`/`Manual` and `Stale` pill variants (tests first) matching `mockup.html`'s `.pill-auto`/`.pill-manual`/`.pill-stale` treatment (amber `--status-progress-*` tokens for Stale).

## 2. Folder tree + content-pane richness

- [ ] 2.1 Write failing tests (`FolderTree.test.tsx`) asserting each tree row shows its direct case count and a critical-priority indicator when applicable.
- [ ] 2.2 Implement: `FolderTree` computes and renders per-folder direct case counts + critical dot, sourced from `cases` already loaded by `FolderExplorerPage`.
- [ ] 2.3 Write failing tests (`FolderExplorerPage.test.tsx`) asserting content-pane folder rows show case count, automation-coverage meter, and critical badge.
- [ ] 2.4 Implement folder row rendering to match.
- [ ] 2.5 Write failing tests asserting case rows show priority/platform/testType/automated pills and a Stale pill for cases untouched 90+ days (needs an `updatedAt`-equivalent field — confirm it exists on `TestCase`/`CaseContent`; if not, add the minimal plumbing, backend-first with its own failing test, before wiring the UI).
- [ ] 2.6 Implement case row rendering to match.

## 3. Search and filtering

- [ ] 3.1 Write failing tests for a folder-scoped filter toolbar (tag/priority/platform/testType/automated) that narrows the current folder's case rows without affecting the tree/navigation.
- [ ] 3.2 Implement the toolbar, reusing the shared filter-option-population logic from `SuiteCaseGrid` where possible.
- [ ] 3.3 Write failing tests for the "search entire Library" scope toggle: flattens to all project cases matching the filters, each row labeled with its folder path.
- [ ] 3.4 Implement the scope toggle and flattened cross-folder result rendering.

## 4. Empty states

- [ ] 4.1 Write failing tests distinguishing a genuinely empty folder (shows "+ New section"/"+ New test case" CTAs) from a filtered-to-zero folder (shows "clear filters," no case-creation CTA).
- [ ] 4.2 Implement both empty states.

## 5. Mobile picker

- [ ] 5.1 Write failing tests for `FolderPicker` showing hierarchy (indentation by depth) and a per-row case count.
- [ ] 5.2 Implement.

## 6. Verification

- [ ] 6.1 Full unit suite green (`make test-web` or equivalent), coverage gate maintained (≥80% all metrics).
- [ ] 6.2 Update/add `apps/web/e2e/test-authoring.spec.ts` scenarios for: folder case counts visible, filtering the current folder, cross-folder search, empty-folder CTA, filtered-to-zero state. Run full e2e suite green.
- [ ] 6.3 Manual verification against `docker compose` with real seeded data (light + dark theme), matching the approved `mockup.html` interactions.

## 7. Docs and Sample Project

- [ ] 7.1 Update `docs/test-management.md`'s Library section to describe the new counts/badges/filtering/search.
- [ ] 7.2 Update `apps/api/internal/sampledata/seed.go` (and `seed_test.go`) so the Sample Project demonstrates the new richness: a section with a double-digit case count, a genuinely empty section, at least one case stale 90+ days, and a mix of automated/manual + all priority levels within one section — verify against the standing "Sample Project showcase" rule in CLAUDE.md.

## 8. Ship

- [ ] 8.1 Sync delta specs into `openspec/specs/ui-navigation/spec.md` (`/opsx:sync-specs rework-library-ux`).
- [ ] 8.2 Archive the change, keeping `mockup.html` as the durable design reference (matching `rework-suite-membership-ux`'s precedent).
- [ ] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
