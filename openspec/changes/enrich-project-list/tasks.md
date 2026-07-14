# Tasks: Enrich project list

TDD throughout: write the failing test first, then the minimal change to pass
(CLAUDE.md standing rule). Contract-first: `openapi.yaml` changes land in the
same commit as the Go handlers they describe, then `make generate`.

## 1. Migration and domain

- [x] 1.1 Amend `00003_identity.sql` (not `00002_core_domain.sql` — see
      design.md D-migration-plan, corrected 2026-07-14): add `description
      text NOT NULL DEFAULT ''` and `owner_id uuid REFERENCES users (id)
      ON DELETE SET NULL` to `projects`. New `project_favorites(user_id,
      project_id, created_at)` table, composite PK, both FKs `ON DELETE
      CASCADE`. Migration test asserting the columns/table/constraints.
- [x] 1.2 `domain.Project` gains `Description`/`OwnerID *string`;
      `domain.ProjectSummary` gains `IsFavorite bool`.

## 2. Store layer (test-first)

- [x] 2.1 `ProjectRepo.Create`/`Update` (or wherever project mutation
      lives) accepts `description`/`ownerId`. Integration tests: create
      with/without them, update sets them, owner deactivation doesn't
      break the reference.
- [x] 2.2 `FavoriteRepo` (or a method group on an existing repo): `Star(ctx,
      userID, projectID) error`, `Unstar(ctx, userID, projectID) error`,
      `IsFavorite(ctx, userID, projectID) (bool, error)` or a batched
      `FavoriteSet(ctx, userID) (map[string]bool, error)` for the
      summaries join. Integration tests covering per-user isolation
      (task's own "Favorites are per-user" scenario) and idempotent
      star/unstar.
- [x] 2.3 `ProjectRepo.Summaries` extended with a fourth grouped query
      joining the calling actor's favorites, following the same
      one-query-per-concern shape as the existing suite/case/pass-rate
      queries (design D3). Integration test asserting `IsFavorite` is
      correct per project per caller.

## 3. Service layer (test-first)

- [x] 3.1 `CreateProject`/`UpdateProject` accept and validate
      `description`/`ownerId` (e.g. reject an `ownerId` that doesn't
      resolve to a real user). `StarProject`/`UnstarProject(ctx, actor,
      projectID) error`. `ProjectSummaries` takes the actor and threads it
      into the store call.
- [x] 3.2 `healthLabel`-equivalent is a **web-side** pure function (see
      task 6.1) — no service-layer counterpart needed; note this
      explicitly so it isn't accidentally duplicated server-side.

## 4. Contract and handlers (test-first)

- [x] 4.1 `packages/shared/openapi.yaml`: `Project`/`ProjectInput`/
      `ProjectUpdate` gain `description`/`ownerId`; `ProjectSummary` gains
      `isFavorite`; new `POST/DELETE /api/v1/projects/{projectId}/favorite`
      (star/unstar as create/delete of the favorite association, not PUT).
      `make generate`.
- [x] 4.2 Handlers + tests: create/update with the new fields, star/unstar
      (including the "unauthenticated" and "project doesn't exist" cases),
      summaries reflecting `isFavorite` correctly for the calling actor.

## 5. Web data layer

- [x] 5.1 Extend `useProjectSummaries` (or the type it returns) with
      `description`, `ownerId`, `isFavorite`. Hook test asserting the new
      fields pass through from the batched response.
- [x] 5.2 `resolveViewMode(count, isMobile, manualOverride)` (design D1) as
      a standalone, directly unit-tested pure function — the four ui-navigation
      scenarios (small→expanded, large→compact, mobile→compact,
      manual-override-wins) map directly to its test cases. Precedence
      corrected 2026-07-14: `isMobile` is checked before `manualOverride`
      (mobile always wins), not after — see design.md D1.
- [x] 5.3 `useIsMobile()` hook (matchMedia against the existing `sm`
      breakpoint).
- [x] 5.4 `useViewModeOverride()` hook: reads/writes the manual override to
      `localStorage` (design D1, confirmed 2026-07-14 — persists across
      reloads, not just component state); returns the stored value plus a
      setter. Test covering: no stored value → `null` override (automatic
      threshold applies), a stored value → returned and re-applied on next
      mount, setter writes through to `localStorage`.

## 6. Web UI

- [x] 6.1 `healthLabel(rate)` alongside `HealthBar`'s existing
      `healthColor` (same file or a sibling) — unit tested against the
      three named bands plus the caller-side null→"No runs yet" case.
- [x] 6.2 `ProjectsPage.tsx`: wire `resolveViewMode` + `useViewModeOverride`
      + manual toggle control; expanded view renders a "Favorites" section
      (starred projects) above the main grid; compact view drops it.
- [x] 6.3 Star/unstar control on each card (icon toggle, optimistic or
      immediate refetch — match the existing `DataRevision` bump pattern
      used elsewhere for post-mutation refresh).
- [x] 6.4 Search input (client-side filter by name) and status filter
      chips (client-side filter by `healthLabel`/"No runs yet") in
      compact view.
- [x] 6.5 Description/owner fields on the create form (optional) and shown
      on the card (description truncated, owner as a small label). Used a
      plain native `<select>` populated from `GET /api/v1/users`, not a
      `CasePicker`-style dialog — a flat, usually-short user list doesn't
      warrant a searchable picker.
- [x] 6.6 Update existing `ProjectsPage.test.tsx`/E2E scenarios
      (`apps/web/e2e/ui-navigation.spec.ts`'s "Listing projects") for any
      selector changes from the new layout. Added two new E2E scenarios
      (manual view persistence, search-by-name).
- [x] 6.7 Single-project skip (design D6): when `useProjectSummaries()`
      resolves to exactly one project and `useAuth().user.role !==
      'admin'`, navigate directly to that project instead of rendering the
      list — no per-project access control required, reacts to whatever
      the list already is. Tests: non-admin with one project redirects,
      admin with one project still sees the list, either role with zero or
      multiple projects sees the list/empty-state as today.

## 7. Docs and verification

- [x] 7.1 Update `docs/api.md` (new fields/endpoints) and
      `docs/database.md` if it documents the `projects` schema.
- [x] 7.2 Full verification sweep: `make coverage-api` (≥80%), `make
      coverage-web` (≥80% all metrics), `make lint`, `make generate` (no
      drift), `make e2e`. Manually verify view-mode switching at the
      threshold boundary (10/11 projects) and on a mobile viewport width.
      (Mobile-viewport check done via automated tests only — the browser
      automation tool couldn't shrink its own viewport in this environment;
      desktop threshold/toggle/favorites verified live against the compose
      stack.)
