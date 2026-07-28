## Why

As a user scanning TestPulse's UI for entity type (is this a suite, a section, a run?), when I look at a run's detail page or the Suites/Runs list pages, I want the icon vocabulary the app already established (Folder for sections, Layers for suites, CirclePlay for runs, FileText for cases — used consistently in `ProjectLandingPanels.tsx` and `RolesPage.tsx`) to actually be consistent, not contradicted or missing. The user asked Pepe (Fable 5) whether every entity type should get its own icon; Pepe's firm verdict was **no full icon-per-entity system** — the app has no mixed-entity list/search surface that would earn its keep — but the investigation surfaced real, narrow bugs in the *existing* partial vocabulary worth fixing regardless of that broader answer.

## What Changes

- `RunPage.tsx`'s "From suite: …" link uses `FolderIcon` — the Section icon — when every other Suite reference in the app (`ProjectLandingPanels.tsx`, `RolesPage.tsx`) uses `LayersIcon`. Swap it to `LayersIcon`.
- `SuitesPage.tsx`'s list rows render bare text with no entity icon, unlike `FolderExplorerPage.tsx` which already pairs `FolderIcon`/`FileTextIcon` with every row. Add `LayersIcon` per row, matching the existing `size-4 text-muted-foreground` treatment.
- `ProjectPage.tsx`'s onboarding checklist step "Add your first test case" uses `FolderIcon` (it links to the Library) while Test Case's established icon elsewhere is `FileTextIcon`. Swap it — low priority (a one-time checklist, not persistent nav) but still a real inconsistency.
- No new icon-per-entity system, no changes to breadcrumbs, no color coding — explicitly out of scope per Pepe's verdict (see design.md).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: adds a requirement that the app's existing entity icon
  vocabulary (Section/Case/Suite/Run) is applied consistently wherever it
  already claims to apply — no new capability, just naming a consistency bar
  the 3 fixes above bring the code up to.

## Impact

- `apps/web/src/pages/RunPage.tsx` — suite-link icon.
- `apps/web/src/pages/SuitesPage.tsx` — row icon addition.
- `apps/web/src/pages/ProjectPage.tsx` — onboarding step icon.
