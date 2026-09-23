## Why

As a project member, when I land on a project's dashboard, I want to see recent activity across the project — who did what, human or agent — so the dashboard shows real project momentum, not just static panel counts.

## What Changes

- New project-scoped, limit-capped read endpoint (`GET /api/v1/projects/{projectKey}/audit`, plus a public equivalent) returning the project's most recent audit entries, newest first.
- `audit_log` gains a nullable `project_id` column (new migration), populated at write time for the ~8 entity types that actually belong to a project (case, suite, run, run_item, folder, release, test_plan, attachment, and `project` itself) — every other entity type (user, team, role, instance_settings, api_token) stays `NULL` and never surfaces in a project feed, correctly.
- Dashboard gains a new "Activity" panel, own full-width row below Reports (matching Reports' own precedent), showing the last 5 entries with actor name/kind, action, and a relative timestamp.
- Sample Project seed gains an agent actor (attributed to the JUnit-import write) so the feed demonstrates both human and agent entries, not just human ones.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `audit-log`: gains a `projectId` field on `AuditEntry` (populated for project-scoped entity types) and a new requirement — audit history is queryable per project, recency-ordered and limit-capped, alongside the existing per-entity query.
- `ui-navigation`: the project landing page's existing "top-level structure only" requirement gains a fifth panel, Activity, full-width below Reports (matching Reports' own precedent).

## Impact

- **Migration**: one new incremental file, `ALTER TABLE audit_log ADD COLUMN project_id ...` + an index on `(project_id, occurred_at DESC)`. **No backfill of historical rows** — a deliberate v1 limitation (see design.md); only audit entries written after this migration ships will appear in the new feed.
- **Backend**: `apps/api/internal/store/audit.go` (schema + new query method), `apps/api/internal/service/identity.go` (`audit()`'s write path, plus a new shared project-ID-resolution helper reused by both the write path and the existing single-entity `/audit` endpoint's middleware — a de-duplication, not just an addition), `apps/api/internal/server/handlers.go` + `public_handlers.go` (new routes, mirroring `flaky-cases`'/`runs/status-summary`'s exact dual-mount pattern).
- **Contract**: `packages/shared/openapi.yaml` — `projectId` added to `AuditEntry`, new `listProjectActivity`/`listPublicProjectActivity` operations.
- **Frontend**: new sibling hook (mirroring `useProjectReportsTeaser`/`useRunPassRateHistory`) + new `ActivityPanel` in `apps/web/src/components/ProjectLandingPanels.tsx`, wired into `apps/web/src/pages/ProjectPage.tsx`.
- **Sample Project**: `apps/api/internal/sampledata/seed.go` gains an agent actor for the JUnit-import write.
- **Docs**: `docs/test-management.md`'s dashboard panel description extended.
