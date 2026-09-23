## 1. Migration: audit_log.project_id

- [x] 1.1 Created `apps/api/internal/db/migrations/00021_audit_log_project_id.sql` — `Up`: `ALTER TABLE audit_log ADD COLUMN project_id text;` + `CREATE INDEX audit_log_project_id_occurred_at_idx ON audit_log (project_id, occurred_at DESC);`. `Down`: drop the index, then the column. No backfill.
- [x] 1.2 Confirmed the migration applies cleanly: ran a `store` package test, goose migrated to version 21 with no errors.

## 2. Service layer: shared project-ID resolution, reused by write and read paths

- [x] 2.1 Wrote a failing test `TestProjectIDForAuditEntityResolvesEachEntityType` in `apps/api/internal/service/identity_test.go` (the existing home for audit-related tests) covering `"project"`, `"case"`, `"run"` (representative sample of the project-scoped types, all routed through the same switch/method calls) and `"user"` → `store.ErrNotFound`.
- [x] 2.2 Ran the test, confirmed it failed (compile error: method doesn't exist).
- [x] 2.3 Implemented `Service.ProjectIDForAuditEntity` in `apps/api/internal/service/identity.go` — the exact same switch, moved from `middleware.go`.
- [x] 2.4 Updated `middleware.go`'s `projectIDFromAuditEntity` to a one-line call-through.
- [x] 2.5 Ran the test: GREEN. Full `server`/`service` regression sweep running in background (see task 2.6 note).

## 3. Service + store: populate project_id at write time

- [x] 3.1 Wrote a failing test `TestAuditRecordsProjectIDForProjectScopedEntities` in `identity_test.go` — a case write records the case's project ID; a user write (tenant-level, no owning project) records an empty `ProjectID`. (Caught and fixed a test-authoring bug along the way: `mustCreateUser`'s helper always uses `context.Background()` internally, no actor — had to call `s.CreateUser(ctx, ...)` directly with the actor-bearing context to actually exercise `audit()`'s write path, matching `TestCreateUserRecordsAuditEntryWhenActorPresent`'s existing pattern.)
- [x] 3.2 Ran the test, confirmed it failed (compile error: no `ProjectID` field).
- [x] 3.3 Added `ProjectID string` to `domain.AuditEntry`. Updated `store/audit.go`: `Append` converts `""` → SQL `NULL` via an `any` local (mirroring the file's own existing `detail` pattern, not `instance_settings.go`'s pointer-input convention, since this file already had a closer precedent); `ListByEntity` scans into a nullable `*string`, converts back to `""`.
- [x] 3.4 Updated `audit()` to resolve `projectID, _ := s.ProjectIDForAuditEntity(ctx, entityType, entityID)` (best-effort, error discarded) and set it on the entry.
- [x] 3.5 Ran the test: GREEN. Full `go build`/`go test ./...` regression sweep launched (see 3.6 note below — results confirmed before starting group 4).

## 4. Store + service: project-scoped activity query

- [x] 4.1 Wrote a failing test `TestListByProjectReturnsNewestFirstCappedToLimit` in new `apps/api/internal/store/audit_test.go` — 4 entries for one project + 1 for another, `limit=2`, asserts only the first project's entries come back, capped, newest-first.
- [x] 4.2 Ran the test, confirmed it failed (method doesn't exist).
- [x] 4.3 Implemented `AuditRepo.ListByProject` in `store/audit.go` — `SELECT ... WHERE project_id = $1 ORDER BY occurred_at DESC LIMIT $2`, `clampLimit`.
- [x] 4.4 Wrote a failing test `TestProjectActivity` in `identity_test.go` — same newest-first/capped/project-isolated behavior at the service layer, via real writes.
- [x] 4.5 Implemented `Service.ProjectActivity` in `identity.go`, calling `s.store.Audit.ListByProject`.
- [x] 4.6 Ran the tests: both GREEN.

## 5. HTTP layer: project-scoped routes

- [x] 5.1 Wrote failing HTTP-level tests in new `apps/api/internal/server/project_activity_api_test.go`, following `TestScenario_AuditHistoryRejectsActorWithoutProjectAccess`'s exact `apiServerWithAdmin`/`loginCookie`/`callAs`/`jmap` pattern: a member with read permission gets 200 with entries; an outsider with no project access gets 403 (matching the existing single-entity `/audit` endpoint's own precedent for this exact class of rejection); an anonymous visitor to a non-public project gets 404; toggling `publicAccess` on lets the same anonymous visitor get 200 via the public route.
- [x] 5.2 Ran the tests, confirmed both failed for the right reason (SPA-fallback HTML instead of JSON — route didn't exist).
- [x] 5.3 Implemented `h.projectActivity` in `handlers.go` (one-line shape matching `flakyCases`/`projectStatusSummary`, reusing `parsePageParams`'s limit half). Registered both routes, mirroring `flaky-cases`'/`runs/status-summary`'s exact dual-mount pattern in `handlers.go` and `public_handlers.go`.
- [x] 5.4 Ran the tests: both GREEN. Full `server` package regression sweep launched (no route conflict expected or found — `/api/v1/projects/{projectKey}/audit` and the pre-existing `/api/v1/audit` are structurally distinct chi routes).

## 6. API contract

- [x] 6.1 Added `projectId` (optional, omitted for tenant-level/pre-migration entries) to the `AuditEntry` schema.
- [x] 6.2 Added `GET /api/v1/projects/{projectKey}/audit` (`listProjectActivity`) and `GET /api/v1/public/projects/{projectKey}/audit` (`listPublicProjectActivity`), both using the shared `limit` parameter component, modeled on `flaky-cases`'s exact operation shape.
- [x] 6.3 Ran `make generate`: `listProjectActivity`/`listPublicProjectActivity` operations and `AuditEntry.projectId` confirmed present in the regenerated `packages/shared/src/api.ts`. `go build ./...` still clean.

## 7. Frontend: hook

- [x] 7.1 Wrote a failing test in `apps/web/src/lib/useProjectActivity.test.ts` asserting the member/public request shapes (`limit: 5`), entry order preserved as returned (no client-side reversal — a list of rows, not a left-to-right timeline), and empty-on-failure behavior.
- [x] 7.2 Ran the test, confirmed it failed (module didn't exist).
- [x] 7.3 Implemented `apps/web/src/lib/useProjectActivity.ts`, mirroring `useProjectReportsTeaser.ts`'s exact dual-mode structure.
- [x] 7.4 Ran the test: 4/4 GREEN. `npx tsc -b` clean.

## 8. Frontend: Activity panel

- [x] 8.1 Wrote failing tests in `apps/web/src/pages/ProjectPage.test.tsx`: up to 5 rows with actor name, action/entity text, relative time; an agent-authored row distinguishable from a human-authored one via `getByLabelText('Human')`/`getByLabelText('Agent')`; zero entries shows an empty-state message via `getByText(/no recent activity/i)`. Added an `activityPath` branch to `mockProjectAPI`.
- [x] 8.2 Ran the tests, confirmed 3/3 failed for the right reason (panel didn't exist).
- [x] 8.3 Implemented `ActivityPanel` in `ProjectLandingPanels.tsx` — no existing user-vs-agent icon precedent found anywhere in the codebase (checked `AdminShell.tsx`/`TokensPage.tsx`/every `actorKind` usage — none render a distinct icon), so introduced one: `UserIcon`/`BotIcon` (lucide-react) per row, wrapped in a span carrying `aria-label="Human"`/`"Agent"`/`"System"`. Own full-width row below Reports, matching Reports' own precedent — no `PanelShell`/"see all" (no full page yet, per design.md scope).
- [x] 8.4 Wired `useProjectActivity` into `ProjectPage.tsx` alongside the other sibling hooks.
- [x] 8.5 Ran the tests: 67/67 `ProjectPage.test.tsx` green (after two test-authoring fixes: `findByLabelText`/`findByText` instead of `getBy*` for the async-loaded rows — `findByLabelText('Activity')` resolves the instant the `<ul>` mounts, before the fetch settles, so the first assertion needs to await too; and `timeAgo()` actually renders "8 minutes ago", not "8m ago"). **Found and fixed a real pre-existing contract gap along the way**: `ActorKind`'s OpenAPI enum only listed `[user, agent]`, missing `system`, even though `domain.ActorKindSystem` has existed since `add-data-retention` (background sweeps). This is the first UI consumer that needs to distinguish all three, so fixed the enum, regenerated types, confirmed `npx tsc -b` clean. Full web suite: 141 files / 1810 tests green.

## 9. Sample Project showcase

- [x] 9.1 Wrote a failing test `TestSeedContentActivityShowsBothHumanAndAgentActors` in `seed_test.go` first (mirroring `TestSeedContentHasMoreThanThreeFlakyCases`'s exact `seededService`/`adminActorCtx`/`ListProjects` pattern), asserting the Sample Project's `ProjectActivity` includes both an `ActorKindUser` and an `ActorKindAgent` entry. Confirmed RED (no agent entry).
- [x] 9.2 Implemented: constructed an agent `Actor` (`ID: "ci-pipeline"`, matching the existing token of the same name) and a derived context via `domain.WithActor`, mirroring the existing `juliaActor`/`juliaCtx` pattern. Used this context for the JUnit-XML import call instead of the admin's.
- [x] 9.3 Ran the test: GREEN. Full `sampledata` package regression sweep: all tests pass, no regressions from changing that write's actor context.

## 10. Documentation

- [x] 10.1 Extended `docs/test-management.md`'s dashboard panel description with a new paragraph describing the Activity panel: what it shows, the human/agent distinction, teaser-only scope, and the no-backfill limitation.

## 11. Full verification

- [x] 11.1 Run the full Go test suite (`go build ./... && go test ./...`), confirm 100% pass, no regressions. Confirmed clean (exit 0), no failures.
- [x] 11.2 Run `make coverage-api`, confirm the ≥80% gate still passes given the new code paths. Confirmed 82.2% total statement coverage (exit 0), run in isolation (uncontended DB) with an extended 20m timeout — the `sampledata` package alone takes ~699s under `-coverpkg` instrumentation, right at Go's default 10m per-package ceiling; this is a pre-existing fragility (measured ~113s uninstrumented), not something this change materially worsened (one new migration + one new test add <1s combined).
- [x] 11.3 Run the full web test suite (`npx vitest run`), confirm all pass. Run `npx tsc -b`, confirm clean. Confirmed clean: 1810/1810 tests pass, `tsc -b` clean.
- [x] 11.4 Run `make lint` (Go + web), confirm clean. Confirmed exit 0, no new warnings in touched files.
- [x] 11.5 Run `make coverage-web`, confirm the ≥80% gate still passes. Confirmed 90.41% stmts / 83.51% branch / 88.64% funcs / 92.99% lines (exit 0), all above the 80% gate. Note: three consecutive default-config full-suite coverage runs each hit a single unrelated pre-existing test's fixed 5000ms timeout (a different file each time — none touching this change's code) under the CPU load of full v8 instrumentation across 141 files; root-caused by rerunning with `--testTimeout=20000` (CLI override only, no repo config change), which passed 141/141 files and 1810/1810 tests cleanly — confirming the flakiness is pre-existing environmental/instrumentation-overhead, not a regression from this change.
- [x] 11.6 Deploy locally (`docker compose down -v` + `up --build -d`, a fresh seed needed since this adds a migration and new seed content) and manually verify on the Sample Project's dashboard: the Activity panel renders below Reports, shows both a human- and an agent-authored entry, each visually distinguishable, and an entry's relative time reads correctly. **Found and fixed a real bug during this step**: the first deploy showed only human (`admin@example.com`) entries in the live Activity panel — the seed's one agent-authored write (the CI import) ends up more than 5 project-scoped writes before the end of `Seed()` (a scratch run, the final go/no-go run, and 3 custom-field case edits all follow it), so it fell outside the panel's real 5-item limit even though `TestSeedContentActivityShowsBothHumanAndAgentActors` passed (it asserted at limit 50, not the production limit of 5 — a test gap, not just a seed gap). Fixed both: tightened the test to limit 5 (watched it fail red for the right reason, reproducing the live symptom), then re-attributed the seed's last case edit (`checkoutValid`'s custom-field write) to `agentCtx` instead of `ctx` — thematically sound (an automation/CI actor tagging component/ownership metadata), and it's the last project-scoped write in the whole script so it's guaranteed to land in the top 5 regardless of what precedes it. Confirmed green on the unit test, full `sampledata` package still 100% green (no other seed assertion depends on that write's actor), and re-verified live: fresh `docker compose down -v && up --build -d`, migrated to version 21, reseeded, Activity panel now shows `ci-pipeline` (bot icon) as the top entry and `admin@example.com` (person icon) below it, both "just now".
