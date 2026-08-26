## 1. Library case row (TDD: failing test first for each observable change)

- [x] 1.1 Test + remove the version chip from `FolderExplorerPage.tsx`'s case row entirely
- [x] 1.2 Test + demote platform/test type from `Badge`/pill markup to plain `text-muted-foreground` text (`web · e2e`)
- [x] 1.3 Test + cap suite-name tags on the case row using `Pills.tsx`'s existing `tagPills()` verbatim (caps at 2 + "+N", not modified for this change)
- [x] 1.4 Test: title gets a `truncate` guard so a long title no longer wraps the row
- [x] 1.5 Confirm Priority, Auto/Manual, and Flaky/Stale pills are unchanged (regression guard, not new behavior)

## 2. Library visual polish (manual verification — pure CSS, no new DOM behavior to unit test)

- [x] 2.1 Sidebar tree (`FolderTree.tsx`): `bg-muted/60` filled panel replacing the `border-r`, "Sections" caption label
- [x] 2.2 Folder rows: `hover:-translate-y-px hover:shadow-md` lift; case rows: flat `hover:bg-accent` only (no lift) — same physics split as `OpenRunCard`/`ClosedRunRow`
- [x] 2.3 Rotating chevron icons replacing static `▸`/`▾`; row "⋯" menu becomes hover/focus-reveal via `RowActionMenu`'s new opt-in `hoverReveal` prop (TDD, default behavior unchanged for every other call site); folder icon gets `text-primary` tint
- [x] 2.4 Test + filter bar: grouped panel, quiet tint on active filter selects, "Clear filters" renders only when a filter is active

## 3. Suites list card (TDD for content changes; manual verification for pure layout/CSS)

- [x] 3.1 Test + replace `HealthBar` with `StatusPill` + `ProgressBar` on each suite card (Never-run state keeps its existing "Never run" text, unchanged — matches the established convention in `ProjectLandingPanels.tsx`/`ProjectPage.tsx`/`SuiteDetailPage.tsx`, distinct from `StatusPill`'s own generic "No runs yet" wording)
- [x] 3.2 Drop the outer wrapping `Card`; page header becomes a plain `<h1>` (parity with `ProjectsPage.tsx`), each suite card becomes its own `bg-card` surface
- [x] 3.3 Tinted icon chip (`bg-primary/10`/`text-primary`), 4px left accent spine via `statusBorderClass` (same helper `ProjectsPage.tsx`'s `ExpandedGrid` already uses), hover-lift physics (manual verification)
- [x] 3.4 `auto-fit` grid (`repeat(auto-fit, minmax(15rem, 1fr))`) replacing the fixed 3-column breakpoint (manual verification at counts 4/5/7/8)

## 4. Suite Detail: Stability card + panels (TDD for content; manual verification for pure CSS)

- [x] 4.1 Test (pre-existing tests already covered this content, re-verified green) + replace the Stability card's line with a 72px `HealthRing` (reusing the `size` prop already added for the Runs redesign), same label/timestamp/badge content
- [x] 4.2 Chart and Run history panels: `bg-muted/40` recessed background
- [x] 4.3 Test + add icons (`PlayIcon`/`PencilIcon`/`Trash2Icon`) to the Actions sidebar's Run suite/Rename/Delete buttons, in `SuiteActionsMenu.tsx`'s "buttons" variant
- [x] 4.4 Confirm the Properties sidebar's `HealthBar` pass-rate row is untouched (regression guard — D11 already settled this)

## 5. Suite Detail: run history cap (real regression fix — TDD, failing test first)

- [x] 5.1 Test: a suite with 12 runs shows only 10 with a "Show 2 more" control (written and confirmed RED against the pre-existing uncapped `<ul>` first)
- [x] 5.2 Test + replace the raw `RunRow`/`<ul>` list with inline cap/expand logic reusing `RunList.tsx`'s exported `SECTION_CAP = 10` constant and matching "Show N more runs" wording (not `RunSection` itself — its Badge/count header duplicates this card's own `CardTitle`)
- [x] 5.3 Test: a suite with 10 runs renders all of them with no expand control
- [x] 5.4 Test: expanding reveals the rest inline without navigation (covered by 5.1's same test, asserting the post-click count)

## 6. Sample Project showcase

- [x] 6.1 Evaluated `seed.go`: no suite had >10 runs. Added `TestSeedContentShowcasesRunHistoryCap` first (confirmed RED against the Regression suite's pre-existing 3 runs), then extended `seed.go` with 9 additional closed "Regression checkpoint N" runs (login's own verdict cycling pass/failed/skipped/blocked to avoid diluting the unrelated `TestSeedFlagshipCaseShowcasesMultipleVerdictColors` showcase — caught this collision via the full `go test ./internal/sampledata/...` run and fixed by varying login's verdict per checkpoint instead of pinning it to Pass)

## 7. Wiring and regression safety

- [x] 7.1 Full web suite green (1341/1341), typecheck clean (`npm run typecheck`, not ad-hoc `tsc --noEmit`), lint clean (pre-existing warnings only, no errors)
- [x] 7.2 Confirmed `NewRunPage.tsx`'s case picker, `SuiteCaseGrid.tsx`, and `CasePicker.tsx` are untouched by this change (`git status` shows no diff — their redesign is a separate, later change)

## 8. Docs

- [x] 8.1 Updated `docs/test-management.md`: case-row pill/text/tag-cap wording, Suites index card (status pill + progress bar), Run history cap, Latest closed run hero ring. `docs/design-system.md` had no stale references to update.

## 9. Validation

- [x] 9.1 `make lint` clean, web coverage gate 92.05%/84.52%/89.94%/94.47%, API coverage gate 81.0% — all ≥80%
- [x] 9.2 `act pull_request -j web` — contract-types-current, lint, typecheck, 1341/1341 tests, build all green (the job's `if: github.event_name == 'pull_request'` guard means act needs the `pull_request` event explicitly, not the default `push`)
- [x] 9.3 Local docker-compose deploy + manual browser validation against a freshly-wiped-and-reseeded Sample Project: Library case rows (no version chip, plain platform·testType text, 2+"N more" suite tags, hover-reveal "⋯", flat case-row highlight vs. lifted folder rows), Suites list (status pill + progress bar, tinted icon chip, auto-fit grid), Suite Detail (72px HealthRing hero, recessed chart/history panels, Run history capped at 10 with a working "Show 2 more runs" expand, 12-run Regression suite). **Found and fixed a real bug during this pass**: `statusBorderClass`'s `border-l-*` classes never paint anything without an accompanying border-width utility — the "4px accent spine" was invisible. Fixed by switching to `healthColor()` as a background fill instead (`accentSpineClass` helper in `SuitesPage.tsx`); confirmed visible post-fix. (This same latent bug exists in `ProjectsPage.tsx`'s `ExpandedGrid`, out of scope for this change — worth a follow-up.)
