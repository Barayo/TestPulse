## 1. Fix the 3 icon violations

- [x] 1.1 Wrote a failing test (icon queried via lucide's own `.lucide-*`
  class, e.g. `.lucide-layers`, since these icons are `aria-hidden` and have
  no accessible name): `RunPage.tsx`'s "From suite: …" link renders
  `LayersIcon`, not `FolderIcon`.
- [x] 1.2 Implemented: swapped the icon and its import in `RunPage.tsx`.
- [x] 1.3 Wrote a failing test: `SuitesPage.tsx`'s list rows render
  `LayersIcon` per row (`size-4 text-muted-foreground`, matching
  `FolderExplorerPage.tsx`'s row-icon treatment).
- [x] 1.4 Implemented: added the icon to `SuitesPage.tsx`'s row rendering.
- [x] 1.5 Wrote a failing test: `ProjectPage.tsx`'s "Add your first test
  case" onboarding step renders `FileTextIcon`, not `FolderIcon`.
- [x] 1.6 Implemented: swapped the icon in `ProjectPage.tsx`.

## 2. Verification

- [x] 2.1 Full unit suite green (628 tests), coverage gate maintained
  (91.6%/82.0%/90.0%/94.7%, all ≥80%), `tsc -b`/`oxlint` clean.
- [x] 2.2 Manual visual check against the rebuilt `docker compose` stack
  (Sample Project, light + dark) — no new e2e coverage added, per plan; the
  new unit tests assert icon identity directly, which the existing e2e suite
  doesn't and isn't the right layer for.

## 3. Ship

- [x] 3.1 Sample Project showcase and docs: exempt — pure visual-consistency
  fix, no new user-facing capability or documented behavior to update.
- [x] 3.2 Synced delta spec into `openspec/specs/ui-navigation/spec.md`.
- [x] 3.3 Archived the change.
- [x] 3.4 Commit + push; wait for CI green.
