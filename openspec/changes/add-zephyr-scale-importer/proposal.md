## Why

As a QA lead migrating off Zephyr Scale, when I have an existing Zephyr Scale project with folders, cases, and custom fields, I want to import it into TestPulse in one operation, so I don't have to manually recreate existing test content by hand. TestPulse has no import path from Zephyr Scale today — only JUnit-XML result import (a different shape of problem: execution results, not authored content) and, as of `add-testrail-importer`/`add-qase-importer`, importers for TestRail and Qase. Those changes deliberately established a source-opaque `import_jobs`/`tools/import-connector` contract precisely so the next vendor (this one, GitHub issue #191, split from an original combined Zephyr Scale/Xray card once investigation showed the two vendors are architecturally distinct enough to need separate designs) plugs in without redesigning the job/route/report machinery — only the vendor-specific client and mapping logic are new.

## What Changes

- Add `zephyr-scale` as a third `source` value for the existing import-job machinery (`import_jobs` table, `POST/GET /projects/{projectKey}/import-jobs`, agent-facing claim/patch endpoints) — no schema or route changes, since both are already source-opaque.
- Add a `zephyrscaleclient` package to `tools/import-connector` (Zephyr Scale Cloud REST API v2: single Bearer-token auth against a fixed `api.zephyrscale.smartbear.com` endpoint — decoupled from any specific Jira site, unlike Xray's Jira-native model — project addressed by string `projectKey`, folders scoped by `folderType`, cases with an embedded step script).
- Add Zephyr Scale-specific mapping logic (`internal/importer`): Zephyr Scale's `TEST_CASE`-type folder tree (`parentId`-linked, scoped by `folderType`) → nested TestPulse Folder tree, matching Qase's direct-tree shape (no TestRail-style suite/section split, since Zephyr Scale has no separate "suite" concept); step-by-step test scripts → `domain.Step` sequences; BDD-style (Gherkin) test scripts have no step-list equivalent and are noted per-case in the report rather than synthesized into fake steps; custom field types that map cleanly to TestPulse's `text`/`select` are created and reused, everything else dropped and named individually in the report.
- Add "Import from Zephyr Scale" as a third entry in the existing data-driven source list on `ProjectsPage.tsx`'s entry-point menu, navigating to `/projects/import/zephyr-scale` (the existing `/projects/import/:source` route, unchanged).
- Add a Connect screen for Zephyr Scale's credential shape (API access token + project key — no site URL needed, since the Cloud API endpoint is fixed and vendor-hosted, unlike TestRail's always-required site URL).
- Extend `docs/integrations.md` with a Zephyr Scale importer section, sibling to the TestRail/Qase ones, including a trademark disclaimer footnote (SmartBear's trademark policy not yet independently verified — defaulting to the same conservative pattern used for TestRail/Qase until confirmed, per the standing concern tracked in #195).

## Capabilities

### New Capabilities
- `zephyr-scale-import`: importing a Zephyr Scale project's test-case folder tree, cases, and mappable custom fields into a TestPulse project via the existing import-job machinery, with a mandatory dry-run preview.

### Modified Capabilities
(none — `testrail-import`'s and `qase-import`'s requirements are unchanged; this change reuses the same underlying `import_jobs`/route contract without altering its documented behavior. The new `zephyr-scale-import` capability spec documents Zephyr Scale's own scenarios.)

## Impact

- **Affected code**: `tools/import-connector/` (new `internal/zephyrscaleclient`, `internal/importer` gains a Zephyr Scale mapping branch alongside TestRail's and Qase's), `apps/web/src/pages/ProjectsPage.tsx` (source list entry), `apps/web/src/pages/ImportProjectPage.tsx` (Zephyr Scale Connect-screen credential fields), `docs/integrations.md`.
- **Not affected**: `apps/api` (no schema/route/handler changes — the `source` field was already opaque), `packages/shared/openapi.yaml` (no new endpoints).
- **Dependencies**: none new — Zephyr Scale's REST API is public to discover (no SDK dependency needed, matching `testrailclient`/`qaseclient`'s hand-rolled approach).
- **Deployment**: `deploy/compose/docker-compose.yml` and the Helm chart's `import-connector` deployment/secret templates gain a Zephyr Scale-flavored example (`--source=zephyr-scale`), reusing the same off-by-default profile mechanism as TestRail/Qase.
