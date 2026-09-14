## Why

As a QA lead migrating off TestRail, when I have an existing TestRail project (suites, sections, cases with custom fields), I want to import it into TestPulse in one operation, so I don't have to manually recreate the case library by hand. TestPulse has no import path from any external test-management vendor today — only JUnit-XML result import for CI results, a different shape of problem (execution results, not authored content). TestRail is the priority integration among five vendor-importer cards on the backlog (Qase #190, Zephyr Scale/Xray #191, Kiwi TCMS #192, Tuskr #193); this change also establishes the reusable import route/job-contract/entry-point shape those will plug into later.

## What Changes

- New standalone Go tool `tools/import-connector/` (same architectural shape as `tools/jira-connector/`: its own `go.mod`, a separate deployable, never in-process in `apps/api`). It reads a TestRail project via TestRail's own REST API (site URL, account email, API key) and writes to TestPulse through TestPulse's existing project/folder/case creation endpoints using a scoped agent API token.
- Mapping: TestRail Suite → a top-level TestPulse Folder; TestRail Section (within a suite) → a nested Folder beneath its suite's folder; TestRail Case (steps + custom fields) → a TestPulse Case in that folder. TestPulse's own `Suite` (a saved case selection for running) is not touched by this import — it has no TestRail analog.
- The tool supports a `--dry-run` mode, mandatory from day one: it produces a structured report (counts per entity type, plus a named list of anything that won't survive the mapping — e.g. unsupported custom-field types) without writing anything to TestPulse.
- New backend API surface: endpoints to create an import job (dry-run or real) and to poll its status/report. This is the contract the in-app Preview/Result screens consume, and the same contract every future vendor importer (#190-193) will reuse.
- New in-app entry point: "+ New project" on the Projects page offers a data-driven choice instead of jumping straight to the create form — "Start from scratch" (today's unchanged flow) or "Import from TestRail" (each future vendor is one more list entry, not a redesign).
- New route `/projects/import/:source` (only `testrail` wired up in this change) hosting a Connect → Preview → Result flow: Connect (TestRail credentials + target project), Preview (dry-run report with a folder-tree preview and an exact-count commit button, e.g. "Import 340 cases"), Result (real report + links into the imported folders/cases). A real run's progress is shown as a count-up ("187 of 340 cases imported…"), not the app's usual sub-second spinner.
- Run/result history import is explicitly **out of scope** for this change, deferred to a follow-up: TestPulse's immutable per-edit versioning has no bulk-backfill mechanism today, and reconstructing TestRail's run/result history is a materially harder, separate problem from migrating the case library.
- No breaking changes — this is entirely additive (new tool, new endpoints, new route, new UI entry point); nothing existing changes shape.

## Capabilities

### New Capabilities
- `testrail-import`: importing a TestRail project's structure and cases into TestPulse — the TestRail→TestPulse mapping rules, the dry-run/real-run import-job API contract (create job, get status/report), and the in-app entry point + Connect/Preview/Result flow that drives it.

### Modified Capabilities
(none — this change is purely additive; no existing capability's requirements change)

## Impact

- **New tool**: `tools/import-connector/` — own `go.mod`, own `cmd/`, packaged the same way `tools/jira-connector/` is (see `docs/integrations.md` for that precedent).
- **Backend**: `apps/api/internal/domain` (new import-job types), `apps/api/internal/service`, `apps/api/internal/store` (new persistence for job/report state), `apps/api/internal/server/handlers.go`, `packages/shared/openapi.yaml` (new endpoints, regenerated `packages/shared/src/api.ts`).
- **Frontend**: `apps/web/src/pages/ProjectsPage.tsx` (entry-point menu), a new page for the `/projects/import/:source` route (Connect/Preview/Result).
- **Docs**: `docs/importing-results.md` (or a new page) documenting the TestRail importer tool, its config, and how to run it.
- **Permissions**: importing into a project requires project-admin-equivalent permission (exact permission flag TBD in design.md).
