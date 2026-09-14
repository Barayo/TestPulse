## Why

As a QA lead migrating off Qase, when I have an existing Qase project with suites, cases, and custom fields, I want to import it into TestPulse in one operation, so I don't have to manually recreate existing test content by hand. TestPulse has no import path from Qase today — only JUnit-XML result import (a different shape of problem: execution results, not authored content) and, as of `add-testrail-importer`, an importer for TestRail. That change deliberately established a source-opaque `import_jobs`/`tools/import-connector` contract precisely so the next vendor (this one, GitHub issue #190) plugs in without redesigning the job/route/report machinery — only the vendor-specific client and mapping logic are new.

## What Changes

- Add `qase` as a second `source` value for the existing import-job machinery (`import_jobs` table, `POST/GET /projects/{projectKey}/import-jobs`, agent-facing claim/patch endpoints) — no schema or route changes, since both are already source-opaque.
- Add a `qaseclient` package to `tools/import-connector` (Qase REST API v1: single `Token` header auth, project addressed by string `code`, suites in one `parent_id`-linked tree per project, global custom field definitions filterable by `entity=case`).
- Add Qase-specific mapping logic (`internal/importer`): Qase suite tree → nested TestPulse Folder tree (root suites become top-level folders, preserving Qase's own hierarchy — no "suite is a separate repository" split like TestRail's, since Qase has no such distinction); Qase custom field types `string`/`text` → TestPulse `text`, `selectbox`/`radio` → TestPulse `select`, everything else (`number`, `checkbox`, `multiselect`, `url`, `user`, `datetime`) dropped and named individually in the report.
- Add "Import from Qase" as a second entry in the existing data-driven source list on `ProjectsPage.tsx`'s entry-point menu, navigating to `/projects/import/qase` (the existing `/projects/import/:source` route, unchanged).
- Add a Connect screen for Qase's credential shape (API token + project code, with the base URL defaulting to Qase's public SaaS API and only exposed as an override for Enterprise VPC customers — unlike TestRail's always-required site URL, since Qase has no self-hosted product).
- Extend `docs/integrations.md` with a Qase importer section, sibling to the TestRail one, including a trademark disclaimer footnote (no published Qase trademark policy found; defaulting to the same conservative pattern used for TestRail — generic tool name, referential-only UI copy, no logo).

## Capabilities

### New Capabilities
- `qase-import`: importing a Qase project's suite tree, cases, and mappable custom fields into a TestPulse project via the existing import-job machinery, with a mandatory dry-run preview.

### Modified Capabilities
(none — `testrail-import`'s requirements are unchanged; this change reuses the same underlying `import_jobs`/route contract without altering its documented behavior. The new `qase-import` capability spec documents Qase's own scenarios.)

## Impact

- **Affected code**: `tools/import-connector/` (new `internal/qaseclient`, `internal/importer` gains Qase mapping alongside TestRail's), `apps/web/src/pages/ProjectsPage.tsx` (source list entry), `apps/web/src/pages/ImportProjectPage.tsx` (Qase Connect-screen credential fields), `docs/integrations.md`.
- **Not affected**: `apps/api` (no schema/route/handler changes — the `source` field was already opaque), `packages/shared/openapi.yaml` (no new endpoints).
- **Dependencies**: none new — Qase's REST API is public and unauthenticated to discover (no SDK dependency needed, matching `testrailclient`'s hand-rolled approach).
- **Deployment**: `deploy/compose/docker-compose.yml` and the Helm chart's `import-connector` deployment/secret templates gain a Qase-flavored example (`--source=qase`), reusing the same off-by-default profile mechanism as TestRail's.
