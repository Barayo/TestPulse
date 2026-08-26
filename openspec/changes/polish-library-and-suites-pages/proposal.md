## Why

As a user browsing the Library or Suites pages, I want case rows I can actually scan (not a ragged pile of same-shaped pills), suite health I can read at a glance the way the redesigned Runs list already lets me, and a Suite Detail run history that doesn't silently grow unbounded — so these pages read as considered as the rest of the app, not as the plainest screens left behind after the Runs list redesign raised the bar.

Grounded in three rounds of Pepe/Fable-5 review across both pages (functional diagnosis, then an explicit beauty pass after "this is about making it more beauty, not just functional gaps").

## What Changes

**Library (`FolderExplorerPage.tsx`, `FolderTree.tsx`)**
- Case rows: drop the version chip entirely (nobody scans a list for it), demote platform/test type from pills to plain `web · functional` text (they're attributes, not status), cap suite-name tags reusing the existing `tagPills()` overflow helper verbatim (caps at 2 + "+N"), add a truncation guard on the title. Fixes real, reproducible ragged row heights (confirmed against seed data: a case in 3 suites wraps to 2 lines while neighbors stay at 1).
- Sidebar tree gets a filled `bg-muted/60` panel (replacing a too-faint `border-r`) plus a "SECTIONS" label caption.
- Folder rows get hover-lift physics (`hover:-translate-y-px hover:shadow-md`, matching the Runs redesign's hero-card treatment — you navigate *into* a folder); case rows keep a flat `hover:bg-accent` highlight (you're scanning a dense list) — same physics distinction the Runs redesign established for Open vs. Closed.
- Static `▸`/`▾` chevrons become real rotating icons; the "⋯" row menu becomes hover/focus-reveal instead of always-visible; the folder icon gets a `text-primary` tint (the one deliberate color touch); filter bar gets its own grouped panel, active filters get a quiet tint, "Clear filters" only renders when something's active.

**Suites list (`SuitesPage.tsx`)**
- Drop the outer wrapping `Card`; each suite card becomes its own `bg-card` surface (was a plain bordered tile inside one big card — a box inside a box).
- Replace `HealthBar`'s thin sliver with `StatusPill` + `ProgressBar` (parity with `ProjectsPage.tsx`'s own card idiom, which `rework-suites-landing-ux`'s original design intent named but never actually shipped).
- Add a tinted icon chip (`bg-primary/10`/`text-primary`), a 4px left accent spine colored by health band, hover-lift physics (reusing the Runs redesign's `OpenRunCard` motion), and an `auto-fit` grid instead of a fixed 3-column breakpoint (a fixed grid strands a lone trailing card at the Sample Project's real count of 4).

**Suite Detail (`SuiteDetailPage.tsx`)**
- Stability card's "Latest closed run" line becomes a 72px `HealthRing` hero (reusing `HealthRing`'s new `size` prop from the Runs redesign) instead of a thin `PropertyRow`.
- Chart and Run history both get a recessed `bg-muted/40` panel (matching `RunSection`/`ClosedRunsLedger`'s existing "zone of run data" treatment).
- **Real regression fix**: Run history currently renders an unbounded flat list via raw `RunRow` (not `RunSection`), so it never had the `SECTION_CAP`/"Show N more" protection every other run list in the app has post-redesign. Add the same cap + expand behavior.
- Actions sidebar buttons (Run suite / Rename / Delete) get icons (`PlayIcon`/`PencilIcon`/`Trash2Icon`) — already imported by `SuiteActionsMenu.tsx`'s sibling "⋯" variant, just missing from the buttons variant.
- Properties sidebar's plain `HealthBar` pass-rate row is explicitly left unchanged — `rework-suite-run-flow/design.md` D11 already considered and rejected `StatusPill` there; not reopened here.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: a new requirement is added for Suite Detail's run history cap (currently unspec'd — this page's list was never covered by a capping requirement at all, unlike every other run list in the app).

## Impact

- **Frontend only.** No API/schema changes.
- Files: `apps/web/src/pages/FolderExplorerPage.tsx`, `apps/web/src/components/FolderTree.tsx`, `apps/web/src/components/Pills.tsx` (reusing, not modifying, its existing `tagPills()`), `apps/web/src/pages/SuitesPage.tsx`, `apps/web/src/pages/SuiteDetailPage.tsx`, `apps/web/src/components/SuiteActionsMenu.tsx`.
- **Docs**: `docs/design-system.md`/`docs/test-management.md` wherever the Library and Suites pages are described.
- **Sample Project**: existing seed data (multi-suite cases, 4 suites with mixed health, a suite with >10 runs is not currently seeded — verify during implementation whether the Run history cap needs a seed addition to be demonstrable).
