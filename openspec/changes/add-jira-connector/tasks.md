## 1. Domain model and migration

- [x] 1.1 Add a new incremental migration (`apps/api/internal/db/migrations/NNNNN_jira_link_fields.sql`) adding nullable `jira_issue_key`, `jira_issue_summary`, `jira_issue_status`, `jira_last_synced_at` columns to `test_cases` and `run_items`.
- [x] 1.2 Add the four fields to `domain.TestCase` and `domain.RunItem` (`apps/api/internal/domain/domain.go`), with a failing store test first (`apps/api/internal/store/*_test.go`) asserting round-trip persistence, then implement the store layer changes to pass it.
- [x] 1.3 Add a failing service-layer test asserting a `jira-sync` call is rejected when the case/run-item has no `jiraIssueKey` set, then implement the rejection.
- [x] 1.4 Add a failing service-layer test asserting clearing `jiraIssueKey` also clears the three cached fields, then implement it.
- [x] 1.5 Add a failing test asserting a closed run rejects a run-item Jira-link change, then wire the existing closed-run guard to cover it.
- [x] 1.6 Add `JiraSiteURL` to `domain.InstanceSettings`/`InstanceSettingsUpdate` (a Tenant-Admin-configurable Jira Cloud site base URL, e.g. `https://mycompany.atlassian.net`, used only to build browsable issue links in the UI) with a failing store test first asserting round-trip via the existing `InstanceSettingsRepo.Update` partial-update pattern, then implement it. New nullable `jira_site_url` column on `instance_settings` in the same migration as task 1.1.
- [x] 1.7 Expose `jiraSiteUrl` on `GET /api/v1/meta` (public, alongside `colorTheme`) and thread it through `apps/web/src/lib/useAuth.tsx`'s existing meta-fetch/context (defaults to `''`, refreshed by the existing `refreshColorTheme` refetch too) — with a failing `useAuth.test.tsx` test first. This is the app-wide read path every page uses; no per-page fetch needed.

## 2. REST API surface

- [x] 2.1 Update `packages/shared/openapi.yaml`: `TestCase`/`RunItem` gain the four fields (three read-only), `InstanceSettings`/`InstanceSettingsUpdate` gain `jiraSiteUrl`, dedicated `PUT .../jira-link` and `PUT .../jira-sync` paths for cases and run items, case/run-item list endpoints gain a `jiraLinked` boolean query parameter. Run `make generate` and commit the regenerated client types.
- [x] 2.2 Add a failing handler test asserting `GET /projects/{key}/cases?jiraLinked=true` returns only cases with a non-null `jiraIssueKey`, backed by a DB-level filter (not a client-side scan), then implement the store query and handler wiring.
- [x] 2.3 Add the equivalent `jiraLinked` filter and test for the run-item list endpoint, scoped to a single run.

## 3. Web UI (Pepe design pass first)

- [x] 3.1 Dispatch Pepe (Fable 5 persona) for a concrete visual design of the Jira badge: case detail page placement, run item row placement, linked/unlinked/stale states, and the inline set/clear affordance — get user sign-off on the mock before writing any component code (standing project rule for UI changes).
- [x] 3.2 Add a failing component test for the Jira badge (renders issue key + status when linked, renders a plain non-clickable key when `jiraSiteUrl` isn't configured, renders a working link built from `jiraSiteUrl` + key when it is, renders nothing/an "add link" affordance when unlinked, shows a staleness indicator when `jiraLastSyncedAt` is old or never set), then implement the component per the signed-off mock.
- [x] 3.3 Wire the badge into `CaseDetailPage` and the run item row component on `RunPage`, with a failing test for the set/clear interaction calling the new `jira-link` endpoints, then implement it. `jiraSiteUrl` comes from the instance settings already fetched app-wide (check for an existing hook/context before adding a new fetch).
- [x] 3.4 Add a `jiraSiteUrl` text field to `apps/web/src/pages/InstanceSettingsPage.tsx` (Tenant-Admin-only, existing page — follow its established pattern for a simple string setting), with a failing test first.

## 4. Jira connector service

- [x] 4.1 Scaffold `tools/jira-connector` as its own Go module (own `go.mod`), with a `main.go` that reads `TESTPULSE_JIRA_*`/`TESTPULSE_URL`/`TESTPULSE_JIRA_AGENT_TOKEN` config and fails fast naming any missing required variable — write the failing config-validation test first.
- [x] 4.2 Implement a minimal Jira REST API v3 client (Basic auth, batched JQL search by issue keys) with a failing test against a stubbed HTTP server before implementation.
- [x] 4.3 Implement a minimal TestPulse REST API client (list cases/run-items with `jiraLinked=true`, update a case/run-item's cached Jira fields) with a failing test against a stubbed HTTP server first. Uses small connector-local Go structs, not `packages/shared`'s generated types — those are TypeScript, not importable from a Go module.
- [x] 4.4 Implement the sync loop (per-project batch fetch → Jira batched search → write-back), with a failing test asserting a Jira failure for one item doesn't block writing results for the rest of the batch, then implement it.
- [x] 4.5 Add a `Dockerfile` for the connector (distroless, multi-arch, following the same pattern as the root `Dockerfile`).

## 5. Deployment

- [x] 5.1 Add an optional `jira-connector` service to `deploy/compose/docker-compose.yml`, disabled/absent unless Jira env vars are supplied (documented, not started by default). Gated with a compose `profiles:` entry, not `${VAR:?required}` interpolation — the latter is validated at parse time for every service regardless of active profile, which would break plain `docker compose up` for everyone.
- [x] 5.2 Add equivalent optional Helm chart values/template for the connector deployment (`deploy/helm/testpulse`).

## 6. Docs and Sample Project showcase

- [x] 6.1 Write `docs/integrations.md` covering connector configuration, deployment, and the sync model; add it to `docs/README.md`'s index. Also added a Jira-link paragraph to `docs/test-management.md`'s case-properties section.
- [ ] 6.2 Update `ROADMAP.md`'s v0.4 line to reflect the shipped state once this change is archived.
- [x] 6.3 Update `apps/api/internal/sampledata/seed.go` to set `jiraIssueKey` on a couple of sample cases/run items (leaving cached fields empty, since there's no live Jira account to sync against in the sample), and update `seed_test.go` accordingly. Also fixed `CaseRepo.List` to include the jira fields, which it was missing (inconsistent with `RunItem.Items`, which already had them).

## 7. Final validation

- [x] 7.1 Run `make coverage-api` and `make coverage-web`, confirm both stay ≥ 80%. API: 80.9%. Web: 92.26% statements / 84.54% branches / 90.26% functions / 94.66% lines. (One flaky failure hit an unrelated, pre-existing test on the first `coverage-web` run and my own new test on the second — both pass 100% reliably in isolation; a clean third run confirms this is the project's known coverage-run worker-contention flakiness, not a regression.)
- [x] 7.2 Add an E2E scenario (`apps/web/e2e/`) covering setting a Jira issue key on a case and seeing the badge render, titled with the `test-authoring` requirement/scenario name above. Added a second scenario for clearing the link too. (Also found and fixed a stray pre-existing uncommitted edit in `docker-compose.yml` that had disabled the admin bootstrap E2E's `global-setup.ts` depends on — unrelated to this change, left over from earlier `act`/CI debugging this session.)
