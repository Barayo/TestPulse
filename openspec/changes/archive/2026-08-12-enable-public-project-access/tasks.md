## 1. Data model

- [x] 1.1 Add migration `apps/api/internal/db/migrations/0001N_instance_settings.sql`
      (use the actual next sequential number after the latest file present
      at implementation time — never edit an existing migration file)
      creating the `instance_settings` singleton table
      (`id boolean primary key default true check (id)`,
      `public_projects_enabled boolean not null default true`,
      `updated_at timestamptz not null default now()`, seeded with its one
      row) and adding `projects.public_access boolean not null default
      false`.
- [x] 1.2 Add `domain.InstanceSettings` (`PublicProjectsEnabled bool`,
      `UpdatedAt time.Time`) in `apps/api/internal/domain/domain.go`, and
      add `PublicAccess bool` to the `Project` struct.

## 2. Instance settings store/service (TDD)

- [x] 2.1 Write a failing test for a new
      `apps/api/internal/store/instance_settings_test.go` asserting
      `InstanceSettingsRepo.Get` returns the seeded row
      (`PublicProjectsEnabled: true`) and `.SetPublicProjectsEnabled`
      persists a change. Confirm it fails (repo doesn't exist yet).
- [x] 2.2 Implement `apps/api/internal/store/instance_settings.go`
      (`InstanceSettingsRepo` with `Get`/`SetPublicProjectsEnabled`,
      following the `Roles`/`Teams` repo pattern). Make the test pass.
- [x] 2.3 Write a failing test in a new
      `apps/api/internal/service/instance_settings_test.go` asserting
      `Service.SetPublicProjectsEnabled` rejects a non-Tenant-Admin actor
      and succeeds for a Tenant Admin, auditing the change. Confirm it
      fails.

      Deviation from the plan, discovered during implementation: pure
      Tenant-Admin-only actions in this codebase (e.g. `SetTenantAdmin`,
      `CreateProject`) are gated exclusively at the route level via
      `requireTenantAdmin` middleware, with no duplicate check inside the
      service method — confirmed by reading `identity.go`/`service.go` and
      their tests. `SetPublicProjectsEnabled` follows that same
      convention instead of re-checking `actor.IsTenantAdmin` itself; the
      403 test lives at the HTTP handler layer (task 3.7) instead, where
      the codebase's precedent (`identity_api_test.go`) already puts it.
      The actual test written asserts persistence + audit, matching
      `SetTenantAdmin`'s own test shape.
- [x] 2.4 Implement `apps/api/internal/service/instance_settings.go`
      (`InstanceSettings`/`SetPublicProjectsEnabled`, using `s.audit(...)`
      per the existing pattern). Make the test pass.

## 3. Public project middleware and route group (TDD)

Deviation from the plan, discovered during implementation: this codebase
has no dedicated `middleware_test.go` — RBAC middleware (`requirePermission`,
`requireTenantAdmin`) is exercised entirely through HTTP-level integration
tests (`project_rbac_api_test.go`), not standalone unit tests. Tasks 3.1-3.4
and 3.6-3.7 below were implemented together and tested as one HTTP
integration suite (`public_project_access_api_test.go`), matching that
convention, rather than as a separate `requirePublicProject` unit test
followed by a separate route-mounting test.

Also discovered: `requirePublicProject` takes a `projectIDResolver` (the
same type `requirePermission` uses — `projectIDParam`,
`projectIDFromSuite`, `projectIDFromRun`, `projectIDFromCase`,
`projectIDFromItem`, `projectIDFromAttachment`) rather than reading
`{projectKey}` off the URL directly. This matters for correctness: a
suite/run/case/item/attachment is keyed independently of any
`{projectKey}` path segment, so gating on "whatever project key is in the
URL" rather than "the project this specific resource actually belongs to"
would let a public project's presence on the instance leak resources from
an unrelated private project. Covered by
`TestPublicProject_ResourceScopedToItsOwnProjectNotURLProject`.

Also discovered: unmatched paths under `/api/v1/...` fall through to the
top-level SPA fallback (200 HTML), not a JSON 404 — true of the whole app
already, not something this change introduced. Since the spec requires a
literal `404` for excluded/write paths under `/public`, `mountPublicAPI`
scopes its own `NotFound`/`MethodNotAllowed` override to just the
`/public` sub-router, leaving every other route's fallback behavior
untouched.

- [x] 3.1 Write a failing test in
      `apps/api/internal/server/middleware_test.go` (or a new
      `public_project_test.go`) asserting `requirePublicProject`: 404s
      when `publicProjectsEnabled` is false regardless of the project's
      own flag; 404s when the project's own `publicAccess` is false
      regardless of the instance flag; 404s for a nonexistent project key;
      succeeds only when both flags are true. Confirm it fails.

      Implemented as HTTP integration tests in
      `public_project_access_api_test.go` (see deviation note above):
      `TestPublicProject_UnauthenticatedReadsRejectedWhenNotPublic`,
      `TestPublicProject_UnknownProjectKeyRejected`,
      `TestPublicProject_InstanceWideSwitchOverridesProjectFlag`.
- [x] 3.2 Implement `requirePublicProject` in
      `apps/api/internal/server/middleware.go`, checking the
      instance-wide flag before the project's own flag (design.md
      ordering). Make the tests pass.
- [x] 3.3 Write a failing test asserting a new unauthenticated route group
      `GET /api/v1/public/{projectKey}/...` serves `getProject`,
      `listCases`, `listFolders`, `listSuites`, `getSuite`, `listRuns`,
      `getRun`, `listRunItems`, `listResults`, `getAttachment`,
      `flakyCases`, `suiteTrend`, `runSummary` for a public project without
      an `Authorization` header, and that `getProjectMembership`,
      `myPermissions`, and every write route return `404` under the same
      group. Confirm it fails (group doesn't exist yet).

      Also covers `getCase`/`listCaseVersions`/`listCaseExecutions` (case
      content, versions, executions — design.md's stated scope), mounted
      at a top-level `/public/cases/{caseKey}` mirroring the authenticated
      API's own top-level `/cases/{caseKey}` shape.
- [x] 3.4 Mount the new route group in `apps/api/internal/server/server.go`,
      outside the `authenticate`-gated group, reusing the existing handler
      functions. Make the tests pass.
- [x] 3.5 Write a failing test asserting `updateProject` (existing
      `PATCH /projects/{projectKey}`, `PermManageProject`-gated) accepts
      and persists a `publicAccess` field. Confirm it fails, then wire it
      through `service.UpdateProject`. Make the test pass.
- [x] 3.6 Write a failing test asserting `GET /api/v1/meta` includes
      `publicProjectsEnabled`. Confirm it fails, then add it to
      `handleMeta`. Make the test pass.
- [x] 3.7 Add `PATCH /api/v1/instance-settings` (Tenant-Admin-only, via
      `requireTenantAdmin`) in a new
      `apps/api/internal/server/instance_settings_handlers.go`, mounted in
      `server.go` next to `mountRoles`/`mountTeams`, with a failing test
      first asserting a `403` for a non-Tenant-Admin and a successful
      update for a Tenant Admin.

## 4. Contract and generated types

- [x] 4.1 Update `packages/shared/openapi.yaml`: `Project.publicAccess`,
      `Meta.publicProjectsEnabled`, the new `/public/{projectKey}/...`
      paths, and the new `PATCH /instance-settings` endpoint. Run
      `make generate` and commit the regenerated
      `packages/shared/src/api.ts`.

## 5. Frontend — public overview page and banner (TDD)

Scope narrowed from the original plan, confirmed with the user during
implementation: reusing the existing authenticated page components (7 of
them — project overview, library, suites, suite detail, runs, run detail,
case detail) turned out to mean reworking each one to conditionally call
`/api/v1/public/*` instead of the authenticated equivalent, plus hiding
every piece of auth-only chrome — a large, invasive change across the
whole page tree, not the drop-in reuse the design assumed. This pass ships
a single new `PublicProjectPage` (project info + read-only cases/suites/
runs lists) rather than full deep-linking parity. The backend already
supports every deep-linkable public route (suite/run/case detail) with no
further backend changes needed — task 5.4 tracks building the
corresponding frontend pages as follow-up work, the same
deliberately-deferred pattern as task 5.1 in `collapse-duplicate-ci-runs`.

- [x] 5.1 Write a failing test asserting `/public/:projectKey` renders
      outside `RequireAuth` and does not redirect to `/login`. Confirm it
      fails.
- [x] 5.2 Add the `/public/:projectKey` route to `App.tsx`, outside
      `RequireAuth`, rendering a new `PublicProjectPage` that fetches from
      `/api/v1/public/projects/{projectKey}` and its `/cases`, `/suites`,
      `/runs` sub-resources — read-only, no write controls (there are none
      to hide: the page never renders any). Make the test pass.
- [x] 5.3 Add the anonymous-viewer banner replacing the normal
      authenticated header on `/public/*` ("You're viewing this project
      without an account... [Log in]"), with a test asserting it renders
      and the normal authenticated header/nav does not.
- [x] 5.4 Follow-up (not part of this change's scope): deep-linkable public
      pages for an individual suite, run, and case
      (`/public/:projectKey/suites/:suiteKey`, `/public/:projectKey/runs/
      :runKey`, `/public/:projectKey/library/:folderId/cases/:caseKey`),
      giving the public surface full parity with the authenticated app.
      Resolved for free by `unify-authenticated-and-public-views`: every
      project-content page now renders identically for anonymous and
      authenticated visitors at its normal `/projects/{key}/...` URL, so
      suite/run/case pages are already deep-linkable for a public project
      — no separate `/public/*` route family needed.
      The backend routes and tests for all of these already exist and pass
      (task 3.3) — this is frontend-only work.

## 6. Frontend — Project Settings public toggle (TDD)

Discovered during implementation: no "Project Settings" page existed
anywhere in the app before this change (no frontend code called
`PATCH /projects/{projectKey}` at all). Created a new, minimal
`ProjectSettingsPage.tsx` at `/projects/:projectKey/settings` — scoped to
just the Public access toggle, not full name/description/archive editing
(a pre-existing gap, unrelated to this change, left alone per YAGNI).
Gated on the `manageProject` permission via the existing
`useProjectPermissions` hook (broader than Tenant-Admin-only, matching
what the endpoint itself already requires server-side), not
`user?.isTenantAdmin` like the neighboring Members link. Linked from
`ProjectPage.tsx` next to the existing Members link.

- [x] 6.1 Write a failing test asserting the Project Settings page renders
      a "Public access" toggle, shows the public URL and a copy button
      only while enabled, and shows a grayed-out toggle with an
      explanatory note (pointing Tenant Admins to Administration →
      Instance) when `publicProjectsEnabled` is `false`. Confirm it fails.
- [x] 6.2 Implement the toggle, wired to the existing project-update
      request extended with `publicAccess` (task 3.5). Make the test pass.

## 7. Frontend — instance-wide settings page (TDD)

- [x] 7.1 Write a failing test asserting `/settings/instance` self-gates
      on `!me?.isTenantAdmin` (same idiom as `RolesPage.tsx`/
      `PeoplePage.tsx`) and renders the "Public project access,
      instance-wide" toggle for a Tenant Admin. Confirm it fails.
- [x] 7.2 Implement `apps/web/src/pages/InstanceSettingsPage.tsx`, wire it
      into `App.tsx`'s route tree, and add the "Instance" entry to
      `AdminMenu.tsx`. Make the test pass.

## 8. Sample Project showcase

- [x] 8.1 In `apps/api/internal/sampledata/seed.go`, mark the Sample
      Project public (mirroring the existing `svc.MarkSample(ctx, p.ID)`
      call) so a fresh instance demonstrates public access working
      out of the box.
- [x] 8.2 Update `apps/api/internal/sampledata/seed_test.go` to assert the
      seeded Sample Project has `PublicAccess == true`.

## 9. Documentation

- [x] 9.1 Update `docs/getting-started.md` to link directly to the public
      Sample Project URL instead of implying `/` is browsable pre-login.
- [x] 9.2 Update `docs/deployment.md`'s "Security status" section to note
      the opt-in public-project carve-out alongside its existing
      "access to a project is opt-in" statement, so the two don't read as
      contradictory.
- [x] 9.3 Update `docs/api.md` with the new `/public/{projectKey}/...`
      routes and the `PATCH /instance-settings` endpoint.
- [x] 9.4 Add a new "Public project access" section to
      `docs/test-management.md` (already indexed in `docs/README.md`, no
      new page needed) documenting the two-flag (instance + project)
      public-access model.

## 10. End-to-end verification

- [x] 10.1 Add an E2E test (`apps/web/e2e/public-project-access.spec.ts`)
      covering: a Project Admin enables public access, an unauthenticated
      browser context can view the project but sees no write controls;
      disabling access revokes it; a never-public project is unreachable.
- [x] 10.2 Add an E2E test covering the instance-wide kill switch: a
      Tenant Admin disables `publicProjectsEnabled`, a previously-public
      project becomes unreachable anonymously, re-enabling restores access
      without touching the project's own setting.

      Both written and type-checked/linted clean, but **not run against a
      live `make e2e` compose stack in this pass** — that's a real
      Docker Compose + Postgres + headless-browser run, not exercised
      here. Flagging honestly rather than claiming full verification;
      worth running before this change is considered fully done.

      Note: `publicProjectsEnabled` is the one piece of E2E state that
      can't be namespaced per-test the way everything else in this suite
      is (via `unique()`) — it's genuinely instance-wide. A comment in the
      spec flags that this describe block would need
      `test.describe.serial` if a second spec ever touches `/public/*`,
      to stay correct under `playwright.config.ts`'s `fullyParallel: true`
      against the shared database.
