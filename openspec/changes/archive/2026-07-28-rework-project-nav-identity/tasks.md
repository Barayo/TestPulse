## 1. Header chip rework (`ProjectSwitcher.tsx`)

- [x] 1.1 Write failing tests: the chip renders an avatar, name, and chevron sharing one visual container; the avatar+name portion is a link to the project's own page; only the chevron opens the switcher dialog; hover/focus reads as one shared control, not two
- [x] 1.2 Write failing tests: with a single accessible project, the chip renders as plain, non-interactive text — no avatar, no pill background, no chevron, no hover feedback
- [x] 1.3 Implement the chip to pass 1.1–1.2, replacing the current bold-name-link + separate `ArrowLeftRight` button
- [x] 1.4 Resolve the avatar initials/color derivation left open in `design.md` — reused the app's existing `lib/avatar.ts` (`initialsFor`/`avatarStyle`, single-letter initial + deterministic hue), already the shared pattern for People/Team avatars, rather than inventing a new derivation

## 2. Landing-page heading chevron (`ProjectPage.tsx`, `App.tsx`)

- [x] 2.1 Write a failing test: the header chip does not render on the project's own landing page (wordmark only)
- [x] 2.2 Write failing tests: a chevron fused onto the page's `<h1>` opens the same switcher dialog; the chevron is absent with a single accessible project (plain heading, no affordance)
- [x] 2.3 Implement 2.1–2.2 — required lifting the switcher's dialog/open-state/⌘K listener out of `ProjectSwitcher.tsx` into a new `ProjectSwitcherProvider`/`useProjectSwitcher` context (`lib/useProjectSwitcher.tsx`), since ⌘K must keep working on the landing page even though the chip itself doesn't mount there

## 3. Breadcrumb trimming

- [x] 3.1 Write failing tests for a shared segment-trimming rule (drop the leading "Projects › {Project}" segment; drop a trailing segment that duplicates the current page's own heading) — `lib/trimProjectBreadcrumb.ts` + `.test.ts`
- [x] 3.2 Implement the trimming rule as a shared helper, used by every page that builds breadcrumb segments today. Also found and fixed an 8th page not in the original scope: `RunItemDetailPage.tsx` (`RunPage`, `SuitesPage`, `RunsPage`, `SuiteDetailPage`, `CaseDetailPage`, `FolderExplorerPage`, `ProjectMembersPage`, `RunItemDetailPage`)
- [x] 3.3 Write a failing test: `Breadcrumbs.tsx` renders a single real ancestor segment as a back-link (e.g. "‹ Suites") instead of being suppressed by today's `segments.length <= 1` threshold
- [x] 3.4 Implement 3.3 — also had to make `CaseDetailPage`/`FolderExplorerPage` omit the `Library` segment's `href` when it would be the sole remaining segment (case/folder lives directly in root), so that case renders as "nothing to show" (matching Suites/Runs) rather than a spurious self-link to the page you're already on
- [x] 3.5 Update each page's own unit tests for its new (often empty) breadcrumb — done for all 8 pages
- [x] 3.6 Update the corresponding scenarios in `apps/web/e2e/ui-navigation.spec.ts` — TD-31 needed a 6th nesting level to still exceed the 5-segment collapse threshold now that the leading 2 segments are gone; TD-32 rewritten for the run page's now-empty breadcrumb

## 4. Verification

- [x] 4.1 `make coverage-web` / full unit suite — 654/654 green, tsc clean
- [x] 4.2 `make e2e` — two full parallel runs each showed a different scattered set of failures (19, then 8) spanning specs this change never touches (project-rbac, test-authoring, test-execution's execution-board flows) — confirmed as resource-contention flakiness against the shared compose stack under parallel workers, not a regression: every one of the failing scenarios from both runs passes cleanly when re-run with `--workers=1`. One real bug was found and fixed along the way: my own new run-page test asserted `getByRole('heading')` against `RunPage`'s `CardTitle`, which isn't a semantic heading element
- [x] 4.3 Verified via targeted `--workers=1` reruns of every breadcrumb-trimming scenario category (empty-trail pages, single-real-segment back-link, deep nesting collapse) — see 4.2

## 5. Docs and showcase

- [x] 5.1 Updated `docs/test-management.md`'s navigation section: header chip shape/split click-targets, landing-page heading chevron, and the general breadcrumb-trimming rule (empty on pages with nothing distinct to show, single back-link where exactly one real ancestor remains)
- [x] 5.2 Decided: no `seed.go` change. The Sample Project showroom has always been single-project (this isn't a gap this change introduces), the multi-project chip/switcher states are fully covered by automated tests (`ProjectSwitcher.test.tsx`, `App.test.tsx`), and adding a second seeded project purely to exercise one nav element's hover state is disproportionate scope creep for this change — it would also change what every fresh evaluator sees on the Projects list immediately, a much bigger side effect than intended here

## 6. Ship

- [x] 6.1 Commit and push, following this project's one-change-per-commit discipline (do not bundle with unrelated work)
- [x] 6.2 Filed issue #99 retrospectively (this change emerged from live design iteration, not a filed issue) and moved the board card to To Review — never straight to Done, per standing practice, pending the user's own verification
