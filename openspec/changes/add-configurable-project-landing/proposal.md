## Why

As a project admin whose team relies on folder structure more than TestPulse's Suite feature (test cases can exist independently of any suite), when I open my project, I want it to land on the view that actually matters for my team — Library, Suites, Runs, or Reports — instead of always landing on the fixed multi-panel dashboard, so my team isn't stuck clicking through a page nobody uses to get to the one they do. This is GitHub issue #2, filed against `redesign-ui`'s original fixed landing dashboard, still unimplemented today.

## What Changes

- Add an instance-wide **default landing view** setting (Tenant Admin, via Instance Settings) — one of Dashboard (today's fixed panel view, remains the factory default so no existing instance's behavior changes on upgrade), Library, Suites, Runs, or Reports.
- Add a per-project **landing view override** (Project Admin, via the project's own Settings page) — the same five choices, plus "Use instance default" (the factory default for every project, `NULL` in storage).
- `GET /projects/:projectKey` (the project's root route) resolves the effective landing view (per-project override if set, else the instance default) and, for anything other than Dashboard, redirects to the corresponding existing route (`/library`, `/suites`, `/runs`, `/reports`) rather than duplicating that page's content inline.
- Releases and Requirements are explicitly **not** selectable landing views in this version — both are account-only routes with no anonymous/public equivalent, and supporting them would require a separate, undesigned fallback for anonymous visitors.

## Capabilities

### New Capabilities
- `configurable-project-landing`: an instance-wide default and a per-project override for which view a project opens into, with resolution and redirect behavior.

### Modified Capabilities
(none — no existing capability's requirements change; this adds new settings and new routing behavior on top of the existing project/instance-settings capabilities without altering their current requirements)

## Impact

- Database: two new incremental migrations (never editing an existing migration file, per this project's permanent migration policy) — `instance_settings.default_landing_view` (`text NOT NULL DEFAULT 'dashboard'`, CHECK-constrained to the five allowed values) and `projects.landing_view` (`text`, nullable, CHECK-constrained to the five values or `NULL`).
- `apps/api/internal/domain/domain.go`: new fields on `Project`/`ProjectUpdate` and `InstanceSettings`/`InstanceSettingsUpdate`.
- `apps/api/internal/service/service.go` and `instance_settings.go`: validation for the new enum fields, mirroring `ColorTheme`'s existing `validColorThemes` map pattern.
- `apps/api/internal/server/handlers.go` and `instance_settings_handlers.go`: PATCH body fields for both.
- `packages/shared/openapi.yaml`: new fields on `Project`, `ProjectUpdate`, `InstanceSettings`, `InstanceSettingsUpdate` (contract-first; `make generate` after editing).
- `apps/web/src/pages/InstanceSettingsPage.tsx`: new "Default landing view" selector.
- `apps/web/src/pages/ProjectSettingsPage.tsx` (or wherever project-level settings live): new "Landing view" selector.
- `apps/web/src/pages/ProjectPage.tsx`: resolve the effective landing view and redirect for non-Dashboard choices.
- `docs/`: document the new settings (Instance Settings reference, project settings reference).
- Sample Project (`apps/api/internal/sampledata/seed.go`): confirmed explicitly during implementation whether this warrants a showcase update — a reasonable default (Dashboard, i.e. no change) may be sufficient, but the decision must be stated, not silently skipped.
