## Why

As a QA lead migrating off Xray (Xpand IT's native Jira test-management add-on), when I have an existing project with a Test Repository folder tree and Test issues, I want to import it into TestPulse in one operation, so I don't have to manually recreate existing test structure and content by hand. This is the fifth and final card in the structural-importer family (TestRail, Qase, Zephyr Scale, Kiwi TCMS already shipped), split from #191 once real investigation confirmed Xray's data model — Tests as native Jira issues rather than an independent test-case store — is architecturally distinct enough to need its own design.

## What Changes

- Add a new `xrayclient` package (`tools/import-connector/internal/xrayclient`) supporting **both** Xray Cloud and Xray Server/Data Center, since the two have genuinely different auth and API shapes:
  - Cloud: client_id/client_secret exchanged for a 24h bearer JWT via Xray's own `/api/v2/authenticate` endpoint, data read via Xray's GraphQL API (region-specific host).
  - Server/DC: standard Jira Basic Auth or Personal Access Token, data read via Xray's REST API (`/rest/raven/<version>/api/...`).
- Add an `internal/importer` branch (`BuildXrayPlan`, `RunXray`) mapping a project's Test Repository folder tree directly to TestPulse folders, and Test issues within each folder to TestPulse cases with structured steps.
- Extend the web import wizard ("+ New project" → "Import from Xray") with a Connect screen that distinguishes Cloud vs. Server/DC (different credential fields per mode), consistent with the other four importers' pattern otherwise.
- Wire the new source into `tools/import-connector`'s poller/CLI (`--source=xray`), `docker-compose.yml`, and the Helm chart, mirroring the prior four importers.
- Update `docs/integrations.md` with a new Xray section and `apps/api/internal/sampledata/seed.go` per this project's standing Sample-Project-showcase rule.

## Capabilities

### New Capabilities
- `xray-import`: Importing an Xray project's Test Repository folder tree and Test issues into a TestPulse project via the shared import-job machinery, supporting both Xray Cloud and Xray Server/Data Center, with a mandatory dry-run preview.

### Modified Capabilities
(none — this reuses the existing `import_jobs` machinery and adds a new source, the same way Qase/Zephyr Scale/Kiwi TCMS each did without changing that capability's requirements)

## Impact

- New Go packages: `tools/import-connector/internal/xrayclient` (client + tests), plus additions to `internal/importer`, `internal/poller`, `cmd/import-connector/main.go` — no `apps/api` schema or route changes, matching every prior importer in this family.
- Web: `apps/web/src/pages/ProjectsPage.tsx`, `apps/web/src/pages/ImportProjectPage.tsx` (new Cloud/Server toggle — a new UI pattern this family hasn't needed before, since every prior importer had exactly one auth shape) and their tests.
- `apps/web/e2e/import-connector.spec.ts`: new scenarios for both Cloud and Server/DC Connect flows.
- `docs/integrations.md`, `deploy/compose/docker-compose.yml`, `deploy/helm/testpulse/values.yaml`: new Xray section/comment updates.
- `apps/api/internal/sampledata/seed.go` + `seed_test.go`: Sample Project showcase update per CLAUDE.md's standing rule.
- No live Xray account (Cloud or Server/DC) is available for real end-to-end verification — matching the Zephyr Scale/Kiwi TCMS precedent, verification relies on real-but-wrong-endpoint / real-HTTP-error checks, documented as a stated v1 limitation.
- Depends on real investigation during design into: exactly which fields live in Jira's own issue API vs. Xray's test-specific API for a "Test" issue, the full Server/DC REST endpoint set, and whether Xray custom fields can be verified against a real type system — each follows this project's established norm of narrowing scope and documenting honestly rather than guessing when unverifiable (see Zephyr Scale D-Z5, Kiwi TCMS D-K6).
