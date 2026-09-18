## 1. Migrations

- [x] 1.1 Write `apps/api/internal/db/migrations/00019_landing_view_instance_default.sql`: `ALTER TABLE instance_settings ADD COLUMN default_landing_view text NOT NULL DEFAULT 'dashboard' CONSTRAINT instance_settings_default_landing_view_check CHECK (default_landing_view IN ('dashboard', 'library', 'suites', 'runs', 'reports'));` with a `-- +goose Down` dropping the column, mirroring `00002_color_theme.sql`'s shape exactly.
- [x] 1.2 Write `apps/api/internal/db/migrations/00020_landing_view_project_override.sql`: `ALTER TABLE projects ADD COLUMN landing_view text CONSTRAINT projects_landing_view_check CHECK (landing_view IS NULL OR landing_view IN ('dashboard', 'library', 'suites', 'runs', 'reports'));` with a `-- +goose Down` dropping the column.
- [x] 1.3 Run `make test-db-up` then `TESTPULSE_TEST_DATABASE_URL=... make test-api` (or the project's equivalent) and confirm both migrations apply cleanly against a fresh database.

## 2. OpenAPI contract

- [x] 2.1 Add `defaultLandingView` (string enum: dashboard/library/suites/runs/reports) to the `InstanceSettings` schema and `InstanceSettingsUpdate` schema in `packages/shared/openapi.yaml`.
- [x] 2.2 Add `landingView` (nullable string enum, same five values) to the `Project` schema and `ProjectUpdate` schema in `packages/shared/openapi.yaml`.
- [x] 2.3 Run `make generate` and confirm no drift (CI's contract-drift check would otherwise fail).

## 3. Domain model, validation, store

- [x] 3.1 Write a failing test in `apps/api/internal/service/instance_settings_test.go` (or wherever `validColorThemes` is tested) asserting `UpdateInstanceSettings` rejects an invalid `DefaultLandingView` value and accepts a valid one.
- [x] 3.2 Add `DefaultLandingView string` to `domain.InstanceSettings` and `*string` to `InstanceSettingsUpdate` in `apps/api/internal/domain/domain.go`; add a `validLandingViews` map (D6) in `apps/api/internal/service/instance_settings.go` and validate `DefaultLandingView` in `UpdateInstanceSettings`. Confirm the test passes.
- [x] 3.3 Write a failing test asserting `apps/api/internal/store/instance_settings.go`'s read/update methods correctly persist and return `default_landing_view`.
- [x] 3.4 Implement the column read/write in the instance settings store. Confirm the test passes.
- [x] 3.5 Write a failing test in `apps/api/internal/store/store_test.go` (mirroring `TestSetAutoArchiveExemptPersists`) asserting a new `SetLandingView(ctx, id, *string)` store method on `ProjectRepo` persists `NULL` and each valid value, and that `NULL` round-trips as `nil`.
- [x] 3.6 Add `LandingView *string` to `domain.Project` and `ProjectUpdate` in `domain.go`; implement `ProjectRepo.SetLandingView` in `apps/api/internal/store/projects.go`, mirroring `SetAutoArchiveExempt`/`SetAssigneeRestrictedRecording`'s shape. Confirm the test passes.
- [x] 3.7 Write a failing test in `apps/api/internal/service/service_test.go` asserting `UpdateProject` rejects an invalid `LandingView` value, accepts a valid one, accepts explicit clearing (setting back to unset), and rejects the change when the caller lacks `manageProject` on that project (D5).
- [x] 3.8 Add `LandingView *string` handling to `service.ProjectUpdate`/`UpdateProject` in `apps/api/internal/service/service.go`, validating against the shared `validLandingViews` map (D6) and the existing `manageProject` permission check. Confirm the test passes.
- [x] 3.9 Wire the new PATCH body fields (`defaultLandingView` in `instance_settings_handlers.go`, `landingView` in `handlers.go`'s project update handler). Write a failing handler-level test for each confirming the field round-trips through the real HTTP PATCH, then implement. Confirm tests pass.
- [x] 3.10 Run `go test ./apps/api/internal/...` and confirm full pass; run `make coverage-api` and confirm it remains at or above 80%.

## 4. Web: Instance Settings — default landing view

- [x] 4.1 Write a failing test in `apps/web/src/pages/InstanceSettingsPage.test.tsx` asserting a "Default landing view" selector renders with the five options and calls `PATCH /api/v1/instance-settings` with `defaultLandingView` on change.
- [x] 4.2 Implement the selector in `apps/web/src/pages/InstanceSettingsPage.tsx`, following that page's existing selector-field conventions (e.g. the retention pill selectors). Confirm the test passes.

## 5. Web: project Settings — landing view override

- [x] 5.1 Write a failing test in `apps/web/src/pages/ProjectSettingsPage.test.tsx` asserting a "Landing view" selector renders (gated on `canManageProject`, D5) with "Use instance default" plus the five explicit choices, shows the resolved current instance default inline next to "Use instance default" (per design.md's Risks mitigation), and calls `PATCH /api/v1/projects/{projectKey}` with `landingView` (or `null` for "Use instance default") on change.
- [x] 5.2 Implement the selector in `apps/web/src/pages/ProjectSettingsPage.tsx`. Confirm the test passes.

## 6. Web: effective-view resolution and redirect

- [x] 6.1 Write a failing test in `apps/web/src/pages/ProjectPage.test.tsx` asserting that when the project's `landingView` is unset and the instance's `defaultLandingView` is "dashboard" (or absent from the fetch), `ProjectPage` renders the existing dashboard unchanged.
- [x] 6.2 Write a failing test asserting that when the project's `landingView` is "suites" (overriding a different instance default), `ProjectPage` redirects (`<Navigate replace>`) to `/projects/{projectKey}/suites`.
- [x] 6.3 Write a failing test asserting that when the project's `landingView` is unset and the instance's `defaultLandingView` is "library", `ProjectPage` redirects to `/projects/{projectKey}/library` — confirming the override-wins-else-instance-default resolution (D2) for both the member and anonymous/public fetch paths.
- [x] 6.4 Implement the effective-view resolution and redirect in `apps/web/src/pages/ProjectPage.tsx` (D2/D4). Confirm all three tests pass.
- [x] 6.5 Run the full web test suite and confirm no regressions in `ProjectPage.test.tsx` or elsewhere.

## 7. E2E, docs, and Sample Project confirmation

- [x] 7.1 Add E2E scenarios to the appropriate spec file (project-settings or instance-settings E2E spec) covering: a Tenant Admin changing the instance default, a Project Admin setting and clearing a per-project override, and opening a project that redirects to its configured non-Dashboard view — titled with their requirement/scenario names per this project's BDD convention.
- [x] 7.2 Document the new "Default landing view" instance setting and the per-project "Landing view" setting in the appropriate docs page(s) (e.g. `docs/deployment.md` for the instance setting, the project-settings reference for the per-project one).
- [x] 7.3 Confirmed `seed.go`/`seed_test.go` are correctly untouched (`git diff --stat` against both is empty). This feature is operator-facing configuration (a setting + its override), not new showroom *content* — the Sample Project's value is in what it demonstrates (folders, cases, suites, runs), and it stays on "dashboard" by default like every other project, which itself already showcases the dashboard (summary strip, panels) a landing-view change would otherwise hide. Confirmed via `git log` that every prior instance/project-setting-only feature in this family (`sessionTimeoutDays`, `colorTheme`, `autoArchiveExempt`, SSO/OIDC settings) also never touched `seed.go` — the same precedent applies here, not a new exemption invented for this change.
- [x] 7.4 Run `make coverage-api` and `make coverage-web` and confirm both remain at or above their 80% gates.

## 8. Verification

- [x] 8.1 Deployed locally and, in a real browser as a Tenant Admin: confirmed the "Default landing view" selector renders/updates (PATCH 200, persisted), created a real project with no override and confirmed it redirected to `/projects/LV/reports` (the new instance default) rendering the real Reports page; set a per-project "Suites" override on that project's Settings page and confirmed it redirected to `/projects/LV/suites` instead, taking precedence over the instance default; confirmed the "Use instance default (currently: Reports)" inline-default label rendered correctly. Anonymous-visitor path confirmed via direct unauthenticated HTTP calls (no session cookie) to `/api/v1/public/projects/LV` and `/api/v1/meta`, both correctly returning `landingView`/`defaultLandingView` — the frontend redirect logic reads both through the same code path regardless of fetch source, already covered by `ProjectPage.test.tsx`'s anonymous/dual-mode tests. Cleaned up: reverted the instance default to "dashboard", archived and deleted the test project. One caveat: two `computer`-tool clicks on Pill buttons didn't register (same intermittent click-registration issue seen in prior importer verifications) — worked around with a direct JS `.click()` dispatch each time, which did register and produced real, confirmed PATCH round-trips.
- [x] 8.2 Run `make lint` and confirm it passes.
