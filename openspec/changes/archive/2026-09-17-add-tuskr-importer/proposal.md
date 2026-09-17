## Why

As a QA lead migrating off Tuskr, when I have an existing project with test suites, sections, and cases, I want to import it into TestPulse in one operation, so I don't have to manually recreate existing test structure and content by hand. This is the sixth and final card in the structural-importer family (TestRail, Qase, Zephyr Scale, Kiwi TCMS, Xray already shipped) — the last remaining sibling split from #182, previously flagged as lower-confidence than the others because Tuskr's API maturity was unverified. That question is now resolved: Tuskr has a real, documented REST API with genuine list/read endpoints across projects, suites, sections, and cases, confirmed against its own official docs (not assumed) — the importer is feasible.

## What Changes

- Add a new `tuskrclient` package (`tools/import-connector/internal/tuskrclient`) — a REST+JSON client against Tuskr's documented API (`https://api.tuskr.live/api/tenant/<tenant-id>/`), authenticated via a per-user Bearer Personal Access Token, paginated (100 records/page), and respecting Tuskr's own documented account-wide rate limit (10 requests/second) with real pacing, not just awareness — the first importer in this family that needs to actually throttle its own request rate.
- Add an `internal/importer` branch (`BuildTuskrPlan`, `RunTuskr`) mapping a project's Test Suite → Section hierarchy to TestPulse folders, and cases within each section to TestPulse cases. Tuskr models a case's steps as one particular custom-field type (`steps`) rather than a first-class property — the mapping logic detects and extracts this specifically, distinct from the generic custom-field fallback used for everything else.
- Extend the web import wizard ("+ New project" → "Import from Tuskr") with a Connect screen collecting a tenant ID, a Personal Access Token, and a project identifier — a single auth shape, no mode toggle needed (unlike Xray).
- Wire the new source into `tools/import-connector`'s poller/CLI (`--source=tuskr`), `docker-compose.yml`, and the Helm chart, mirroring the prior five importers.
- Update `docs/integrations.md` with a new Tuskr section.

## Capabilities

### New Capabilities
- `tuskr-import`: Importing a Tuskr project's Test Suite/Section tree and its test cases into a TestPulse project via the shared import-job machinery, with a mandatory dry-run preview.

### Modified Capabilities
(none — this reuses the existing `import_jobs` machinery and adds a new source, the same way every prior importer in this family did without changing that capability's requirements)

## Impact

- New Go packages: `tools/import-connector/internal/tuskrclient` (client + tests), plus additions to `internal/importer`, `internal/poller`, `cmd/import-connector/main.go` — no `apps/api` schema or route changes, matching every prior importer in this family.
- Web: `apps/web/src/pages/ProjectsPage.tsx`, `apps/web/src/pages/ImportProjectPage.tsx` (a new, single-auth-shape Connect screen) and their tests.
- `apps/web/e2e/import-connector.spec.ts`: new scenarios for the Connect flow.
- `docs/integrations.md`, `deploy/compose/docker-compose.yml`, `deploy/helm/testpulse/values.yaml`: new Tuskr section/comment updates.
- No live Tuskr account is available for real end-to-end verification (API access is confirmed gated to trial/paid plans only) — matching the Zephyr Scale/Xray precedent, verification relies on real-but-wrong-endpoint / real-HTTP-error checks, documented as a stated v1 limitation.
- `apps/api/internal/sampledata/seed.go`: expected to be correctly exempt under the same standing precedent every prior importer already established (a live import can't be seeded without a real account) — confirmed explicitly during implementation, not silently skipped.
- Depends on real investigation during design into: the exact nesting shape of Tuskr's Suite→Section list response, whether a case with no `steps`-type custom field configured has any step data at all, and the concrete custom-field type mapping table (dropdown/multi-select/date/checkbox/integer/url) — each follows this project's established norm of narrowing scope and documenting honestly rather than guessing when unverifiable.
- This closes out the entire structural-importer family started by `add-testrail-importer` (#182) — no further vendor-importer cards remain planned after this one.
