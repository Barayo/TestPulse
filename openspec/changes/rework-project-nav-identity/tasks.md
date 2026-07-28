## 1. Header chip rework (`ProjectSwitcher.tsx`)

- [ ] 1.1 Write failing tests: the chip renders an avatar, name, and chevron sharing one visual container; the avatar+name portion is a link to the project's own page; only the chevron opens the switcher dialog; hover/focus reads as one shared control, not two
- [ ] 1.2 Write failing tests: with a single accessible project, the chip renders as plain, non-interactive text — no avatar, no pill background, no chevron, no hover feedback
- [ ] 1.3 Implement the chip to pass 1.1–1.2, replacing the current bold-name-link + separate `ArrowLeftRight` button
- [ ] 1.4 Resolve the avatar initials/color derivation left open in `design.md` (source: `project.name` vs `project.key`; hue assignment across multiple projects) and add a test locking in the chosen rule

## 2. Landing-page heading chevron (`ProjectPage.tsx`, `App.tsx`)

- [ ] 2.1 Write a failing test: the header chip does not render on the project's own landing page (wordmark only)
- [ ] 2.2 Write failing tests: a chevron fused onto the page's `<h1>` opens the same switcher dialog; the chevron is absent with a single accessible project (plain heading, no affordance)
- [ ] 2.3 Implement 2.1–2.2

## 3. Breadcrumb trimming

- [ ] 3.1 Write failing tests for a shared segment-trimming rule (drop the leading "Projects › {Project}" segment; drop a trailing segment that duplicates the current page's own heading)
- [ ] 3.2 Implement the trimming rule as a shared helper, used by every page that builds breadcrumb segments today (`RunPage`, `SuitesPage`, `RunsPage`, `SuiteDetailPage`, `CaseDetailPage`, `FolderExplorerPage`, `ProjectMembersPage`) instead of each page hand-assembling its own leading segments
- [ ] 3.3 Write a failing test: `Breadcrumbs.tsx` renders a single real ancestor segment as a back-link (e.g. "‹ Suites") instead of being suppressed by today's `segments.length <= 1` threshold
- [ ] 3.4 Implement 3.3
- [ ] 3.5 Update each page's own unit tests for its new (often empty) breadcrumb — `SuitesPage`, `RunsPage`, `RunPage` should assert no breadcrumb nav renders; `SuiteDetailPage`, `CaseDetailPage`, `FolderExplorerPage`, `ProjectMembersPage` should assert the trimmed real segments
- [ ] 3.6 Update the corresponding scenarios in `apps/web/e2e/ui-navigation.spec.ts` (breadcrumb-related scenarios across all affected pages)

## 4. Verification

- [ ] 4.1 `make coverage-web` — full unit suite + coverage gate green
- [ ] 4.2 `make e2e` — full suite green (re-run any flake in isolation before treating it as a regression, per this repo's own recent precedent)
- [ ] 4.3 Verify live against the local compose stack: both themes, a single-project account, and a multi-project account, on the landing page and at least one page from each breadcrumb-trimming category (empty-trail page and single-real-segment page)

## 5. Docs and showcase

- [ ] 5.1 Update `docs/test-management.md`'s navigation description (header chip shape/interaction, breadcrumb trimming) to match shipped behavior — supersedes the "small switch icon" wording already there
- [ ] 5.2 Decide whether `apps/api/internal/sampledata/seed.go` needs a second seeded project so the Sample Project showroom actually demonstrates the multi-project chip/switcher state (today's showroom is single-project, which would only ever show the plain-text state) — add one if the showroom would otherwise never exercise the chip's switching capability at all

## 6. Ship

- [ ] 6.1 Commit and push, following this project's one-change-per-commit discipline (do not bundle with unrelated work)
- [ ] 6.2 Move the GitHub Project card to Done once shipped and CI is green (issue tracking this change: file one if none exists yet)
