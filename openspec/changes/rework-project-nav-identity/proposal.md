## Why

As a user browsing a project, when I land on the project page, I want to see its name once instead of stacked three times (top bar, breadcrumb, page heading) — the current top bar (`ProjectSwitcher.tsx`) repeats the active project's name next to the "TestPulse" wordmark, using a bare `ArrowLeftRight` icon button as the only way to switch projects, and several pages layer a `Breadcrumbs` trail and their own `<h1>` on top of that, so the same name shows up two or three times with no single element clearly "owning" the answer to "where am I." Switching projects is also a rare action, not a frequent one, and some users only ever have access to a single project — the current design gives the switcher constant, undifferentiated visual weight regardless of how often it's actually used or whether there's anything to switch to.

## What Changes

- Rework the top bar's project identity control (`ProjectSwitcher.tsx`) into a fused "chip" — a colored initials avatar, the project name, and a chevron sharing one visual container (background/hover/focus treatment) — replacing the current bold name text plus a separate floating `ArrowLeftRight` icon button. The avatar+name portion stays a direct link to the project's own page (today's behavior, preserved); only the chevron opens the switch dialog.
- On the project landing page (`ProjectPage.tsx`) specifically, the top-bar chip does not render at all; the switch affordance (a small chevron) fuses directly onto the page's own `<h1>` instead, so the project name appears exactly once while switching stays discoverable (click or ⌘K).
- Trim `Breadcrumbs.tsx` usage on every project-scoped page so it only ever shows real, unique, navigable segments between the project and the current page: always drop the leading "Projects › {Project}" segment (the top bar's job now) and drop a trailing segment when it would just repeat the page's own `<h1>` (e.g. Suites/Runs list breadcrumbs disappear entirely; Suite/Case detail keeps a real ancestor segment like "‹ Suites").
- For a user with access to exactly one project: the chip (and the landing-page h1's chevron) renders as fully plain, non-interactive-looking text — no avatar, no pill background, no chevron, no hover feedback — rather than a disabled-looking control. (The underlying `canSwitch = projects.length > 1` gate already exists in `ProjectSwitcher.tsx`; this changes how that state *looks*, not the gating logic itself.)
- The switch dialog itself is unchanged in mechanism (same centered search-and-jump dialog, same ⌘K shortcut) — only its trigger changes.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: the project-scoped top bar's identity/switcher control and the breadcrumb-trimming rule described above are new requirements on top of the existing navigation scenarios.

## Impact

- `apps/web/src/App.tsx` (`Layout` component — top bar composition, project-scoped/admin-settings route detection)
- `apps/web/src/components/ProjectSwitcher.tsx` (chip rework, single-project plain-text state)
- `apps/web/src/components/Breadcrumbs.tsx` and every page that renders it with project-scoped segments: `SuitesPage.tsx`, `RunsPage.tsx`, `SuiteDetailPage.tsx`, `CaseDetailPage.tsx`, `FolderExplorerPage.tsx`, `ProjectMembersPage.tsx`
- `apps/web/src/pages/ProjectPage.tsx` (h1-fused switch trigger on the landing page — the visible `<h1>{project.name}</h1>` + `<p>{key} · project overview</p>` block shipped earlier stays, gains the fused chevron)
- No API/schema changes — this is UI-only.

## Design reference

Three distinct proposals were explored and visually validated (Fable-5-drafted interactive mockup, `mockup.html` in this change directory — also published as a Claude Artifact during design review): **A — Fused Chip**, **B — Breadcrumb Rail**, **C — Anchored Popover**. **Proposal A (Fused Chip) is the chosen direction** (see `design.md`). Proposal C is fully built out and preserved in the same mockup file in case of reconsideration; it was not discarded.
