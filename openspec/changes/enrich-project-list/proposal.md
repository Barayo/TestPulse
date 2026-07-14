## Why

The project list (`apps/web/src/pages/ProjectsPage.tsx`) was just redesigned
into a card grid this session (issue #21) — a real improvement over flat
rows, but the user found it "poco" (a small step, not enough) after
reviewing it against a mockup they'd developed separately. The core problem
the mockup identifies: **project count varies wildly by role and doesn't
have one right layout** — an admin might see many projects, a tester
typically 2-3. A single fixed card grid serves neither well: too sparse for
2-3 projects (no room for anything but a name and a number), too
undifferentiated for a large set (nothing helps you find the one project
that needs attention). The mockup also shows the list currently carries no
information beyond suite/case/pass-rate — no way to say what a project
*is* (description) or who's responsible for it (owner).

## What Changes

- **Density-adaptive layout**: an *expanded* view (a pinned "Favorites"
  section, larger cards) for small project counts, and a *compact* view
  (dense grid, no favorites section) for large counts. Auto-switches at a
  threshold of 10 projects on desktop (≤10 → expanded, >10 → compact);
  mobile is always compact regardless of count. A manual toggle lets the
  user override the automatic choice at any time.
- **Favorites**: any user can star/unstar a project. Starred projects
  pin to the top "Favorites" section in expanded view. New per-user
  persistence — favorites belong to the authenticated user, not the
  instance.
- **Status label**: alongside the existing numeric pass rate, a status
  word — "Healthy" (≥80%), "In progress" (50-79%), "At risk" (<50%),
  "No runs yet" (no runs). These are the exact bands `HealthBar` already
  uses for color; this only adds the word. English-only for now (D7,
  2026-07-14) — the UI has no i18n/locale detection yet, so this stays
  consistent with the rest of the app's copy until that lands, rather than
  mixing languages on one page.
- **Search and filter**: search projects by name; filter chips by status
  (the four labels above) in the compact/many-projects view.
- **Project metadata**: `description` (free text, optional) and `owner`
  (a reference to a real user, optional) added to the project entity,
  settable at creation or later, shown on the card.
- **Single-project skip**: a non-admin user who can see exactly one
  project is navigated directly into it instead of landing on the list.
  This does not require per-project access control (`add-project-rbac`,
  still not built) — it reacts to whatever `useProjectSummaries()` already
  returns, whatever the reason its length is 1 (today: a small instance
  with only one project; later: RBAC-scoped visibility, with no code
  change needed here when that lands). Admins always land on the list
  regardless of count, since they need the create-project action and
  future project management visible.

## Capabilities

### New Capabilities

- `project-favorites`: per-user starred projects — create/remove a star,
  list a user's starred project ids.

### Modified Capabilities

- `test-authoring`: "Project management" requirement gains optional
  `description` and `ownerId` fields on create/update.
- `ui-navigation`: "Project list with permission-ready create action"
  requirement gains the density-adaptive layout, status labels, and
  search/filter — the list's presentation contract changes materially,
  not just its styling.

## Impact

- **API**: `packages/shared/openapi.yaml` — `Project` gains `description`/
  `ownerId`; new `POST/DELETE /api/v1/projects/{projectId}/favorite`
  (or equivalent) and a way to list the caller's favorites (likely folded
  into `GET /api/v1/projects/summaries` or a new field on it, to avoid
  reintroducing a per-project request).
- **Backend**: migration amending `projects` (new columns, pre-1.0 policy)
  and a new `project_favorites` table; store/service/handler additions.
- **Frontend**: `ProjectsPage.tsx` gains view-mode state (auto + manual
  override), a favorites section, search input, filter chips, and status
  labels; `useProjectSummaries` (or a sibling hook) needs to also carry
  `description`, `ownerId`, and `isFavorite`.
- **Explicitly deferred** (not in this change):
  - Sortable table columns (the "Tabla minimal" mockup alternative) — a
    different direction, not chosen.
  - A cream-background/serif-display visual direction (the "Editorial"
    mockup alternative) — rejected: it would reopen `redesign-ui`'s
    settled typography/palette decision for one page, not extend it.
