## Context

TestPulse's project root route (`/projects/:projectKey`, `ProjectPage.tsx`) has always rendered a single fixed dashboard (Folders/Suites/Runs/Reports/Releases panels via `useProjectLanding`) since `redesign-ui`. GitHub issue #2 flagged this as a real limitation: projects that lean on folder structure more than TestPulse's own Suite feature (test cases can exist independently of any suite) get a landing page that isn't the one their team actually uses first.

Two existing patterns this design builds on, both verified against the current codebase:
- **Instance Settings**: a genuine singleton-row table (`instance_settings`, one row enforced by `CHECK (id)`), Tenant-Admin-configurable via `GET/PATCH /api/v1/instance-settings`. New settings are added via `ALTER TABLE instance_settings ADD COLUMN` migrations — `ColorTheme` (`00002_color_theme.sql`) is the closest precedent: a `text NOT NULL DEFAULT 'teal'` column with a `CHECK (color_theme IN (...))` constraint, validated again in `apps/api/internal/service/instance_settings.go`'s `validColorThemes` map.
- **Per-project settings with an instance-wide relationship**: `AutoArchiveExempt` (per-project bool) opts a project out of the instance-wide `AutoArchiveInactiveDays` policy — but it's a boolean *gate*, not a value that itself defaults to an instance-wide value. This change introduces that "nullable override, falls back to instance default" sub-pattern for the first time in this codebase.

## Goals / Non-Goals

**Goals:**
- Let a Tenant Admin set an instance-wide default landing view, and a Project Admin override it per project.
- Preserve every existing instance's and project's current behavior unchanged unless a Tenant Admin or Project Admin explicitly opts in (Dashboard stays the universal factory default).
- Keep the resolution and redirect logic simple: at most one extra route-resolution step before rendering, no new page, no content duplicated across pages.

**Non-Goals:**
- Releases and Requirements as selectable landing views — both are account-only routes (no anonymous/public equivalent); supporting them would need a defined non-member fallback this change doesn't design.
- Per-role landing views (e.g. a Viewer always lands on Reports while a Contributor lands on Library) — out of scope; the setting is per-project, not per-role, per-user, or per-membership.
- A "remember the last page I visited" personalization feature — a different, unrelated idea from the same original issue discussion; this change is strictly the instance-default/project-override setting.

## Decisions

**D1: Two new columns, not a new table.** `instance_settings.default_landing_view` (`text NOT NULL DEFAULT 'dashboard'`) and `projects.landing_view` (`text`, nullable). Mirrors `ColorTheme`'s exact migration shape (`00002_color_theme.sql`) — a `CHECK` constraint enumerating the five allowed values (`'dashboard', 'library', 'suites', 'runs', 'reports'`), nullable variant for `projects.landing_view` reading `CHECK (landing_view IS NULL OR landing_view IN (...))`. Two separate migration files (one per table), per this project's one-file-per-change incremental migration policy — never combined into one file, and never editing an existing migration file.

**D2: Resolution — per-project override wins, else the instance default; computed server-side, not client-side.** `domain.Project`'s `LandingView` field is the raw nullable per-project value (mirrors how `AutoArchiveExempt` is stored raw, not resolved). The *effective* view a client should redirect to is computed by the frontend from two already-fetched values (the project's own `landingView` from `GET /projects/{projectKey}` and the instance's `defaultLandingView` from `GET /instance-settings`, both already fetched by existing hooks on `ProjectPage.tsx`) — no new endpoint needed, since both values are already available client-side by the time `ProjectPage` renders.
*(Rejected)* A dedicated `GET /projects/{projectKey}/effective-landing-view` endpoint — rejected as unnecessary indirection; both inputs are already fetched, and the resolution rule (`projectValue ?? instanceDefault`) is a one-line client-side computation, not business logic worth hiding behind a new endpoint.

**Addendum, discovered during implementation**: the instance-wide default is NOT read from `GET /api/v1/instance-settings` (Tenant-Admin-only) for this resolution — an anonymous or public visitor can't call that endpoint. It's exposed instead via the public, unauthenticated `GET /api/v1/meta` endpoint's new `defaultLandingView` field, the exact precedent `colorTheme`/`customPalette`/`jiraSiteUrl` already established (every instance-wide value a pre-login or anonymous visitor needs is duplicated onto `Meta`, per that schema's own documented rationale: "Read here since this endpoint is unauthenticated and needed by both the anonymous public frontend and the authenticated ... page"). `useAuth.tsx` already fetches `/api/v1/meta` once on mount for every visitor type and exposes `colorTheme`/`customPalette`/`jiraSiteUrl` from it — `defaultLandingView` is added to that same fetch and exposed the same way, so `ProjectPage` reads it via `useAuth()` uniformly regardless of visitor type, rather than needing a member-only vs. anonymous branch for this one value.

**D3: Selectable views for v1 — Dashboard, Library, Suites, Runs, Reports; Releases and Requirements excluded.** All five chosen values map to `PROJECT_CONTENT_ROUTES` in `apps/web/src/App.tsx` (`anonymous: true`) — the setting behaves identically for members, anonymous, and public visitors. Releases and Requirements are `ACCOUNT_ONLY_ROUTES` with no public equivalent; a project whose landing view pointed there would need a defined redirect-to-Dashboard-for-anonymous-visitors fallback this change deliberately doesn't build, since it's real, separable complexity with no clear immediate demand.

**D4: `ProjectPage.tsx` redirects for non-Dashboard views rather than rendering their content inline.** When the effective view is `library`/`suites`/`runs`/`reports`, `ProjectPage` issues a client-side redirect (`<Navigate to={...} replace />`, matching this codebase's existing redirect convention — e.g. `ProjectsPage.tsx`'s single-project skip-to-project redirect) to the corresponding existing route (`/projects/:projectKey/library`, etc.) rather than rendering `FolderExplorerPage`/`SuitesPage`/`RunsPage`/`ProjectReportsPage`'s content directly inside `ProjectPage`. This avoids any content duplication or divergence between "landing on Library via the root route" and "navigating to Library directly" — they become the exact same rendered page either way. `replace` (not push) so the redirect doesn't leave a dead history entry a user would have to click "back" twice to escape.

**D5: Per-project override permission — Project Admin (`canManageProject`), not Tenant-Admin-only.** Matches `AssigneeRestrictedRecording`'s existing convention (a project-level behavioral setting controlled by the project's own admins) rather than `AutoArchiveExempt`'s stricter Tenant-Admin-only precedent (which exists specifically because auto-archive is a data-retention/deletion policy, a materially higher-stakes category than "which page loads first"). The instance-wide default remains Tenant-Admin-only, matching every other `InstanceSettings` field.

**Addendum, discovered during implementation**: clearing a per-project override back to "inherit the instance default" needs a dedicated `clearLandingView` boolean on `ProjectUpdate`, not a JSON `null` sentinel on `landingView` itself — this codebase has an established, explicit preference against null-as-clear-sentinel on a PATCH field (see `DisableOIDC`'s own comment: "a dedicated action rather than an empty-string sentinel, the same trap `ClearAvatarKey` already exists to avoid"), since Go's `encoding/json` can't cheaply distinguish "field omitted" from "field explicitly null" on a plain pointer without extra machinery this codebase doesn't otherwise use. `landingView` sets a specific override value when provided; `clearLandingView: true` clears it to NULL, mirroring `DisableOIDC`'s exact shape.

**D6: Validation — a shared allowed-values set, checked in both the instance-settings and project services.** A single `validLandingViews` map (mirroring `validColorThemes`'s shape) is checked by both `service.UpdateInstanceSettings` (for `DefaultLandingView`) and `service.UpdateProject` (for `LandingView`, additionally allowing `nil`/absent to mean "no override") — one shared constant, not two independently-maintained lists that could drift.

## Risks / Trade-offs

- **[Risk] A future "add Releases/Requirements as landing views" follow-up will need to retrofit an anonymous-visitor fallback this design deliberately skips.** → Accepted: the two excluded routes are already narrower-audience pages (project members with elevated visibility into planning artifacts) than Library/Suites/Runs/Reports; deferring is a real, disclosed v1 boundary, not an oversight.
- **[Trade-off] The effective-view resolution happening client-side (D2) means a user with JavaScript disabled, or hitting the API directly, doesn't get server-side redirect behavior.** → Accepted: this project's entire frontend is already a client-side-rendered SPA behind `apps/api/internal/web`'s embedded bundle; no existing route in this codebase does server-side redirect logic, so this doesn't introduce a new category of behavior, just extends the existing one.
- **[Risk] Adding a fifth "meaningful" value to a previously-boolean-shaped settings area invites confusing UI if not labeled clearly (e.g. "Use instance default" vs the instance default's actual current value).** → Mitigation: the per-project selector's "Use instance default" option shows the resolved current instance default inline (e.g. "Use instance default (currently: Dashboard)"), so a Project Admin never has to cross-reference Instance Settings separately to understand what "default" currently means.

## Migration Plan

Additive only — two new nullable/defaulted columns, no data backfill needed (existing rows get the default/NULL automatically). No `apps/api` route removals, no breaking OpenAPI changes (new fields are additive on existing schemas).

Suggested build sequencing:
1. Migration `apps/api/internal/db/migrations/00019_landing_view_instance_default.sql` — `instance_settings.default_landing_view`.
2. Migration `apps/api/internal/db/migrations/00020_landing_view_project_override.sql` — `projects.landing_view`.
3. `packages/shared/openapi.yaml` — add `defaultLandingView` to `InstanceSettings`/`InstanceSettingsUpdate`, `landingView` to `Project`/`ProjectUpdate`; `make generate`.
4. `apps/api/internal/domain/domain.go` — new fields; `apps/api/internal/service/{instance_settings,service}.go` — `validLandingViews` map (D6) and validation in both update paths; `apps/api/internal/store/{instance_settings,projects}.go` — read/write the new columns; `apps/api/internal/server/{instance_settings_handlers,handlers}.go` — PATCH body fields.
5. `apps/web/src/pages/InstanceSettingsPage.tsx` — "Default landing view" selector.
6. `apps/web/src/pages/ProjectSettingsPage.tsx` — "Landing view" selector (Project-Admin gated, D5), showing the resolved instance default inline per the mitigation in Risks.
7. `apps/web/src/pages/ProjectPage.tsx` — resolve the effective view (D2) and redirect (D4) for non-Dashboard values.
8. `docs/deployment.md` (or wherever Instance Settings fields are documented) and project-settings docs — document both new settings.

## Open Questions

- **Exact UI copy/placement for the per-project selector** on `ProjectSettingsPage.tsx` — left to implementation to match that page's existing settings-list layout conventions, not a structural decision.
