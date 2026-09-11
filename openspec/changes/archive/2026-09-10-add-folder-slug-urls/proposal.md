## Why

As a test author, when I share or bookmark a folder's URL, I want it to look
like the breadcrumb I already see (Library › Authentication › Two-Factor)
instead of an opaque UUID (`/library/1b80a3d2-16af-4c41-9e53-c60526046992`),
so the link is actually followable and shareable. Every other project-scoped
entity (Case, Suite, Run, StepGroup, Release, TestPlan, Project itself)
already has a short human-readable key in its URL — Folder is the one
remaining gap.

## What Changes

- Browser routes for folders switch from `/projects/{projectKey}/library/{folderId}`
  (a raw UUID) to `/projects/{projectKey}/library/{folder-slug-path}`, e.g.
  `/library/authentication/two-factor` — a slash-separated path of slugified
  folder names mirroring the existing breadcrumb. The REST API keeps
  addressing folders by UUID internally (`/api/v1/folders/{folderId}`);
  slug-path resolution happens client-side against the folder tree
  `FolderExplorerPage` already loads.
- **BREAKING**: sibling folder names (and their derived slugs) must be
  unique per parent going forward, both on create and when a folder is
  moved into a new parent. Today no such constraint exists — a one-shot
  data migration disambiguates any existing duplicates (oldest keeps the
  clean name/slug; later duplicates get a numeric suffix) before the
  constraint can apply.
- Each folder gains `previous_slug`/`previous_parent_folder_id` (nullable,
  overwritten on each subsequent move — single-hop only, not a full
  history). A slug-path that doesn't resolve against the live tree is
  retried once against these previous-identity columns; a match triggers a
  client-side redirect to the folder's current URL. A link surviving two
  moves back-to-back 404s — an explicit, accepted scope limit.
- **Descoped, not included**: folder rename. A pre-implementation review
  (Pepe/Luis/Paco) found that renaming a folder doesn't exist anywhere in
  this codebase today — no service method, no API route, no UI control —
  unlike `Suite`, which already has this exact capability. Building it was
  never this change's stated purpose (URL presentation, not new authoring
  capability), so it's left for a future, separately-reviewed change. This
  change's redirect mechanism only needs to handle **move** (which is real
  and fully working today via the existing "Move to…" UI); the
  `previous_slug`/`previous_parent_folder_id` columns are generic enough
  that a future rename change gets single-hop redirect for free.

## Capabilities

### New Capabilities
- `folder-slug-urls`: human-readable, slug-path-based folder URLs, sibling
  slug uniqueness (on create and move), and single-hop move-redirect
  resolution.

### Modified Capabilities
- `test-authoring`: the existing "Project-level case folders" requirement
  gains a sibling-name-uniqueness constraint (previously unconstrained),
  enforced on both folder creation and moving a folder into a new parent.

## Impact

- **API**: `apps/api/internal/service/service.go` (`CreateFolder`,
  `MoveFolder`), `apps/api/internal/domain/domain.go`
  (`ValidateFolderName`), `apps/api/internal/store/folders.go`.
- **DB**: new migration adding `slug`, `previous_slug`,
  `previous_parent_folder_id` to the folders table, plus the one-shot
  disambiguation/backfill migration for existing data — explicitly
  partitioned by `(project_id, parent_folder_id)`, not `parent_folder_id`
  alone (every project's root folder shares `parent_folder_id = NULL` and
  the identical hardcoded name `"Root"`; partitioning without `project_id`
  would treat every project's root as one giant duplicate group and
  silently rewrite most of them).
- **Frontend**: `apps/web/src/pages/FolderExplorerPage.tsx` (route
  matching, slug-path building, redirect resolution, the collision-error
  and move-redirect banner UI), `apps/web/src/components/FolderTree.tsx`
  (collision-error UI on the sidebar's inline create row),
  `apps/web/src/App.tsx` (route definition).
- **Docs**: whatever page documents Library/folder navigation.
- No change to `packages/shared/openapi.yaml`'s folder request/response
  shapes beyond adding the new fields — the REST contract's addressing
  scheme (folder ID) is unchanged, and no rename endpoint is added.
