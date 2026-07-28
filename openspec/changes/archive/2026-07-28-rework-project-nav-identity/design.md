## Context

The top bar (`Layout` in `App.tsx`) shows the "TestPulse" wordmark and, on project-scoped routes, a "›" separator followed by `ProjectSwitcher.tsx`: the active project's name as a bold link, plus (when the user has more than one accessible project) a separate `ArrowLeftRight` icon button that opens a search dialog (also reachable via ⌘K).

Two rounds of user feedback on a live redesign of the project landing page (`enrich-project-landing-panels`, already shipped) surfaced that this control, combined with each page's own `Breadcrumbs` trail and `<h1>`, causes the project name to repeat up to three times on screen with no single element clearly responsible for it. The user also clarified two product facts that hadn't been designed for: switching projects is a rare action, not a frequent one, and some users will only ever have access to a single project.

Three design directions were explored with a Fable-5-drafted interactive mockup (`mockup.html`, also published as a Claude Artifact during review) that simulated the full top bar across a "Suites"-style page, the project landing page, and a "Suite detail" page, in both themes and both single/multi-project states:

- **A — Fused Chip**: wordmark → "›" → one rounded chip (colored initials avatar + name + chevron), a single click target, opening the existing centered search dialog.
  - **Refined post-selection** (see Decisions below): the chip keeps one shared visual container (background/hover/focus ring as a unit), but is split into two click targets — avatar+name navigates directly to the project's own page, the chevron alone opens the switcher — rather than the whole chip being one button. The mockup's built version of A treats the whole chip as a single button; this refinement was decided after visual sign-off, so the mockup is the visual reference for the chip's *appearance*, not its exact click-target split.
- **B — Breadcrumb Rail**: restyles the name at breadcrumb scale (mono, uppercase, tracked, matching `Breadcrumbs.tsx`'s existing voice), opening a compact anchored dropdown.
- **C — Anchored Popover**: keeps the name's current visual weight, fuses a small caret onto it, opens a small popover anchored directly under the trigger (Notion/Linear-style).

## Goals / Non-Goals

**Goals:**
- The project's name appears exactly once per page in the "always-visible chrome" (top bar / breadcrumb / heading) wherever that's achievable without losing the ability to switch projects.
- The switch-project control's resting visual weight matches how rarely it's actually used; a single-project user sees zero switching affordance, not a disabled-looking one.
- Every project-scoped page keeps a legible, persistent answer to "which project am I in," even where the page's own heading is about something else (a suite, a case, a run).

**Non-Goals:**
- No change to the switch dialog's search/jump mechanism itself, nor to ⌘K.
- No change to which projects a user can see or switch to (RBAC/membership logic untouched).
- No change to `ProjectPage.tsx`'s own summary strip, panels, or the visible `<h1>{project.name}</h1>` block shipped earlier this cycle — this change only adds a fused chevron to that existing heading.

## Decisions

**Chosen: Proposal A — Fused Chip.** Rationale (product owner's call, informed by Pepe's analysis): it most directly resolves both original complaints — the generic `ArrowLeftRight` icon disappears entirely, and the name/switcher read as one visual unit instead of two loose pieces sitting "alongside" the wordmark — with the least change to the existing interaction model (same dialog, same shortcut). The avatar also gives instant visual project recognition that scales as more projects are added, which neither B nor C provide.

Proposal C (Anchored Popover) was Pepe's own recommendation after the rare-switching-frequency revision (least resting-state chrome) and is fully built out in the same mockup file — **explicitly preserved, not discarded**, in case the fused-chip avatar approach doesn't hold up once implemented against real project names/lengths. If A needs to be revisited, C is the fallback to reach for first rather than re-exploring from scratch.

> **Update (same day, post-ship):** the product owner did revisit this after seeing A live and switched to **Proposal C**, exactly the fallback anticipated above. Implemented as a follow-up commit rather than a new change: the name+caret trigger replaces the avatar+name+chevron chip (no avatar in C), and the switcher opens as a popover anchored directly under the trigger instead of the shared centered dialog. The split-click-target requirement below (name navigates, caret switches) and the landing-page h1-fused chevron (unchanged — it already used the shared centered dialog, which C's mockup also reuses for that one page) both carry over unmodified; only the top-bar trigger's own shape and popover mechanism changed. `ProjectSwitcherProvider`/`useProjectSwitcher` gained a `registerPopoverOpener` hook so ⌘K opens whichever switcher instance is actually mounted — the top-bar popover everywhere except the landing page, where it still falls back to the shared dialog.

**The chip preserves direct navigation — it is not a single undifferentiated button.** Reviewing the mockup's literal implementation (the whole chip as one `<button>` that only opens the switcher) surfaced a real capability loss versus today: there would be no one-click way back to a project's own landing page from any other project-scoped page, since the breadcrumb's equivalent link is also being trimmed away (see below). The product owner confirmed this should be preserved. Final behavior: the chip keeps one shared visual container (background/hover/focus treatment reads as a single unit, satisfying the original "stop looking like two loose pieces" complaint), but internally splits into two click targets — the avatar+name portion is a link straight to the project's own page (today's behavior, unchanged), and the chevron alone is a button that opens the switcher. This is the same "split cluster" pattern the initial research identified in GitHub's repo header, applied inside the fused chip's visual container rather than as two visually separate elements.

**Landing-page name suppression, not just tolerance.** An earlier iteration of this design treated a 2× repeat (top-bar chip + page `<h1>`) as acceptable, GitHub-repo-header-style. The product owner rejected this — on the landing page, the top-bar chip is dropped entirely and its switch affordance fuses onto the `<h1>` itself (a small chevron after the project name), so the name shows once and switching remains one click (or ⌘K) away. This only applies to `ProjectPage.tsx`; every other project-scoped page keeps the full top-bar chip, since their own `<h1>` is about something else and the chip is the only persistent "which project" signal there.

**Breadcrumb trimming rule, not breadcrumb removal.** Rather than special-casing each page, `Breadcrumbs.tsx`'s segment list is trimmed by a general rule: drop the leading "Projects › {Project}" segment (now the top bar's job) and drop a trailing segment that would just repeat the current page's `<h1>`. This empties the breadcrumb entirely on Suites/Runs (their own heading is "Suites"/"Runs", their breadcrumb previously only ever showed "Projects › {Project}" anyway — pure duplication). It leaves a real, still-useful segment on Suite/Case detail pages (e.g. "‹ Suites"), since that segment is neither the project nor the current page.

**Single-project state renders as genuinely plain text**, not a disabled-styled control: no avatar, no pill background, no chevron, no hover feedback anywhere the chip or the landing-page h1's switch chevron would otherwise appear. The underlying gate (`canSwitch = projects.length > 1` in today's `ProjectSwitcher.tsx`) already exists and is unchanged — this only changes what that state looks like.

## Risks / Trade-offs

- **[Risk]** The breadcrumb-trimming rule touches six pages (`SuitesPage`, `RunsPage`, `SuiteDetailPage`, `CaseDetailPage`, `FolderExplorerPage`, `ProjectMembersPage`), a wider blast radius than the top-bar control alone. → **Mitigation**: `Breadcrumbs.tsx`'s trimming logic is centralized (the rule lives in one place, e.g. as a shared segment-building helper), not duplicated per page; each page's existing e2e coverage (`apps/web/e2e/ui-navigation.spec.ts`) is re-verified rather than rewritten from scratch.
- **[Risk]** An avatar built from initials could collide visually for projects with similar names/keys, or look sparse for very short project names. → **Mitigation**: not blocking for this change (single-tenant, project counts are small in practice); flag as a follow-up if it becomes a real problem once shipped.
- **[Trade-off]** Choosing A over C forgoes C's lower resting-state visual weight in exchange for the avatar's recognizability and the smaller interaction-model change. Explicitly accepted, with C preserved as the documented fallback.
- **[Risk]** Splitting the chip into two click targets (name-link vs. chevron-button) inside one shared visual container needs care so hover/focus still reads as "one chip," not two separately-outlined controls — the built mockup only demonstrates the single-button version, so this split needs its own implementation-time visual check, not just a literal copy of the mockup's DOM. → **Mitigation**: covered explicitly in `tasks.md` once written; verify live in both themes before shipping, same as every other UI change this cycle.

## Migration Plan

UI-only, no data migration. Ship behind the normal TDD/e2e-verification flow used for every other UX rework this cycle; no feature flag needed (the whole app is one deployable, `testpulse.fly.dev` redeploys atomically). Rollback is a normal revert if needed.

## Open Questions

- Exact avatar initials/color derivation (e.g. first letter of `project.name` vs. `project.key`, and the hue-assignment rule for multiple projects) is left to implementation-time inspection of the mockup's `--avatar-N-bg/fg` tokens, not pinned down further here.
