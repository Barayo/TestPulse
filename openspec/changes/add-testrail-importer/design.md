## Context

TestPulse has no import path from any external test-management vendor today — only JUnit-XML result import (`apps/api/internal/service/execution_import.go`, vendor-neutral, results-only). This change adds the first vendor-specific content importer, TestRail, and — since four more vendor cards (#190-193) sit behind it on the backlog — establishes the reusable job/route/report contract those will plug into later.

The design went through two rounds of external review before being written up:
- A UX pass with the Pepe design persona settled the in-app flow (mock: `https://claude.ai/code/artifact/5b30fbf2-3de4-4bfd-908f-3e048a282003`) — a browser-driven Connect → Preview → Result flow with live progress, not a CLI-only tool.
- An architecture pass with the Jose persona resolved the resulting tension between that browser-driven UX and the standing "connectors are external API clients, never in-process plugins" rule (`establish-architecture`, and its concrete precedent `tools/jira-connector/`). That review's verdict is what this document is built on: **the importer polls `apps/api`, `apps/api` never calls out to the importer.**

## Goals / Non-Goals

**Goals:**
- Import a TestRail project's suites, sections, and cases (with steps and custom fields) into a TestPulse project, via a browser-driven Connect → Preview → Result flow with a mandatory dry-run step.
- Keep all TestRail-specific domain/mapping logic in a separate deployable (`tools/import-connector/`), matching the `jira-connector` precedent — `apps/api` gains only a generic, source-opaque job-tracking mechanism.
- Establish a job/route/report contract generic enough that the four other vendor-importer cards (#190-193) reuse it without redesign.

**Non-Goals:**
- Run/result history import — deferred to a follow-up. TestPulse's immutable per-edit case versioning has no bulk-backfill mechanism today (confirmed: `CaseVersion` rows are only ever created through the normal edit path), and reconstructing TestRail's run/result history is a materially separate, harder problem from migrating the case library.
- A generalized "connector marketplace" UI, a generic multi-vendor credential-schema builder, or folding the unrelated generic CSV/Excel import (#131) into this flow — all explicitly ruled out during the UX brainstorm as premature for four vendors that aren't scoped yet.
- Reconstructing TestRail's own case edit history as TestPulse case versions — an import creates each case at version 1 (its current TestRail state), not an attempted replay of TestRail's history.

## Decisions

**D1: Control direction — the importer polls `apps/api`; `apps/api` never calls the importer.**
Two shapes were considered:
- *(Rejected)* `apps/api` exposes thin proxy endpoints that forward job-create/status requests server-to-server to an always-on HTTP service run by the importer, authenticated by a shared secret only the two processes know.
- *(Chosen)* The importer is an always-on poller — the same skeleton as `tools/jira-connector/cmd/jira-connector/main.go` (`signal.NotifyContext` + `time.NewTicker`), just with a much tighter interval (a few seconds, not `jira-connector`'s 5-minute default — an interactive "click Preview, see a result" flow can't tolerate that). It claims pending jobs and reports progress by calling `apps/api`'s own REST API with a scoped agent Bearer token, exactly like `jira-connector` already does via `testpulseclient`.

The proxy shape was rejected because it inverts the existing, working relationship: `jira-connector` is downstream of `apps/api` (a pure client, `apps/api` has zero knowledge it exists) — proxying would make `apps/api` a client of the importer instead, over a brand-new auth mechanism invented solely to support that inversion. The poll shape needs no shared secret (deleted entirely — it existed only to authenticate the rejected inbound-HTTP-server shape) and structurally cannot grow TestRail-specific request/response shaping inside `apps/api`, since `apps/api` never constructs a request *to* TestRail or the importer at all.

**D2: `apps/api` owns a generic, source-opaque `import_jobs` table — not the importer.**
Forced by the browser: since the browser only ever talks to `apps/api` (unchanged session-cookie auth, per D1), the job/progress state the browser polls must live where `apps/api` can answer directly, not behind a second hop to the importer. The word "testrail" appears in this table only as an opaque `source` column value; `apps/api`'s domain/service/store layers never parse TestRail-shaped data.

New migration `00018_import_jobs.sql` (next after `00017_parameterized_cases.sql`), one incremental file, never edited post-merge (CI's `migrations` job enforces this):

```sql
import_jobs(
  id, project_id (FK projects), source text,        -- opaque, e.g. 'testrail'
  mode text,                                         -- 'dry_run' | 'real'
  status text,                                        -- 'pending'|'running'|'succeeded'|'failed'
  credentials bytea,                                  -- encrypted; NULL once terminal
  report jsonb,                                       -- counts + named unmappable-items list
  progress_current int, progress_total int,
  error text,
  created_by text,                                    -- the authorizing human actor
  created_at, updated_at, started_at, finished_at
)
```

**Credentials are encrypted at rest via the existing `encryptSecret`/`decryptSecret` mechanism** (`apps/api/internal/service/oidc_secret.go`, keyed by `TESTPULSE_ENCRYPTION_KEY`) — the same at-rest path the OIDC client secret already uses, not a new one. Since those functions are unexported in `service` (and `service` already imports `store`, so the reverse import would invert layering), **encryption/decryption happens at the service layer**, exactly where the existing OIDC-secret usage already does it (`instance_settings.go`) — `store.ImportJobRepo` only ever persists and returns opaque `[]byte`, never touching plaintext or calling the encryption functions itself. `credentials` is scrubbed (set `NULL`) the moment a job reaches a terminal state (`succeeded`/`failed`), and the TestRail API key must never be echoed into `report`. `domain.ImportJob` (the type `GetImportJob` returns to the browser) deliberately has no `Credentials` field at all — the only place decrypted credentials are ever exposed is the claim response (agent-facing, `GET /imports?status=pending`), which uses its own response shape carrying the decrypted credentials the importer needs to actually connect to TestRail; the browser-facing status/report response can never include them, structurally, not just by convention. This column and its handling get an explicit Luis security-review pass before merge.

**D3: New `apps/api` endpoints — browser-facing (session auth) and importer-facing (agent-token auth), both generic across `source`.**
**Correction, found before implementing**: `POST/GET /api/v1/projects/{projectKey}/imports` is already taken — it's the existing synchronous JUnit-XML result-import endpoint (`h.importResults`, `Service.ImportResults`), an unrelated feature (CI test *results*, not project *structure*). Reusing that path would collide, not extend it. Renamed this change's endpoints to `import-jobs` throughout, matching `domain.ImportJob`'s own name:
- Browser-facing, gated by `PermManageProject` (the existing precedent for an admin-tier, project-scoped structural action — the same permission that gates `POST /runs/{runKey}/reopen`):
  - `POST /api/v1/projects/{projectKey}/import-jobs` — creates a job (`source`, `mode`, credentials). Returns the created `ImportJob`.
  - `GET /api/v1/projects/{projectKey}/import-jobs/{jobId}` — status/progress/report. This is what the Preview/Result screens and the in-progress count-up poll.
- Importer-facing, agent-token authenticated (same `AuthenticateToken`/Bearer mechanism every scoped agent already uses), not nested under `/projects` since neither route has a project id in its own URL:
  - `GET /api/v1/import-jobs?status=pending&source={source}` — claim pending work for the caller's own scoped project. `source` is required (the importer only ever polls for its own connector's jobs); returns `ClaimedImportJob` (200) or nothing pending (204).
  - `PATCH /api/v1/import-jobs/{jobId}` — report `progressCurrent`/`progressTotal`, or mark terminal completion by setting `status` (plus `report` or `error`). Gated by `PermManageProject` via `ImportJobRepo.ProjectID`'s resolver — the standard `requirePermission` mechanism already handles scoped agent tokens correctly (`scopedProjectPermissions`), so no bespoke agent-ownership check is needed.

Contract-first per standing practice: `packages/shared/openapi.yaml` is edited and `make generate` run before any handler code, same as every other change in this codebase.

**D4: Permission model for the importer's own token — per-project scoped, not unscoped, for v1.**
A scoped agent token (`domain.ApiToken{ProjectID, RoleID}`) confines the importer to exactly one TestPulse project — `GET /imports?status=pending` naturally filters to the token's scoped project. This preserves the existing confinement invariant scoped tokens are built around (`middleware.go`'s scoped-token handling), at the cost of one importer deployment per target project. An unscoped token (`ProjectID == nil`, full inheritance of the creator's access) was considered and rejected for v1: it's more convenient but weakens the confinement guarantee for no v1 requirement that needs it. This is flagged as a **high-scrutiny, expensive-to-reverse** decision — multi-project support can be added later (e.g. a job's target project is validated against the token's actual scope at claim time) without a schema change, so starting narrow costs little.

**D5: Attribution — a shared importer agent identity performs the writes; the job row records the authorizing human separately.**
Matches the existing rule that "an agent's actions are never recorded as if performed directly by the human who created its token" (`domain.go`'s `Actor`/`ActorKind` handling). The honest two-level record: `import_jobs.created_by` captures the human who clicked "Import 340 cases" (the actor who `POST`ed the job, already gated by `PermManageProject`); the 340 created cases/folders are attributed to the importer's own agent identity, with the job row as the provenance link back to the authorizing human. Per-case "human H created this case" attribution was considered and rejected as a fiction — H never touched those cases; an automated crawl did.

**D6: Domain mapping — TestRail Suite → top-level Folder, TestRail Section → nested Folder, TestRail Case → Case.**
Corrected mid-brainstorm after an initial ambiguous mapping risked conflating `TestRail Suite` with `TestPulse Suite` — they are unrelated concepts (TestRail's Suite is an independent case-authoring repository with its own Section tree; TestPulse's `Suite` is a flat, named selection of already-existing cases for scoping a run, with no hierarchy and no authoring role). The corrected, locked mapping:
- TestRail Suite → a top-level TestPulse Folder (one per suite)
- TestRail Section (within a suite) → a nested Folder beneath that suite's folder, preserving TestRail's section hierarchy
- TestRail Case → a TestPulse Case in the appropriate nested folder, with steps and custom fields mapped per D7
- TestPulse's own `Suite` construct is not touched by this import at all

This is load-bearing, not cosmetic: TestRail suites commonly reuse section names across each other (every suite might have a "Login" section) — a flat folder tree with no suite-level parent folder would collide or interleave cases from different suites incorrectly.

**D7: Custom field mapping — downgrade or drop, always reported by name, never silent.**
TestPulse's `CustomField` supports exactly two types: `text` and `select` (`domain.go`). TestRail's richer field-type range (multi-select, integer, date, URL, etc.) has no native TestPulse equivalent. Fields that map cleanly (TestRail text/single-select → TestPulse `text`/`select`) are created as project custom fields on first encounter and reused thereafter; fields that don't map are dropped, and every dropped field is named individually in the dry-run report's unmappable-items list — never silently discarded, never collapsed into a "+N more" summary (a specific requirement from the Preview screen's UX design, since a QA lead can't trust a one-shot migration that hides what it's throwing away).

**D8: In-app entry point and route — data-driven source list, dedicated route, no new wizard primitive.**
"+ New project" on `ProjectsPage.tsx` (currently: click directly expands an inline create-form Card) instead opens a small anchored menu — reusing the exact pattern `CardTagEditor`/`HiddenSegmentsMenu` already establish for this kind of click-to-reveal menu — offering "Start from scratch" (today's flow, unchanged) and "Import from TestRail," rendered from a data-driven list of sources (one entry today; each future vendor is one array entry, not a redesign). Picking a source navigates to `/projects/import/:source` (only `testrail` wired up in this change), which hosts three plain `Card` sections (Connect, Preview, Result) — not a new generalized wizard/stepper component, since none exists in this codebase today and one working source doesn't justify inventing one. Full screen-by-screen detail is in the approved Pepe mock (artifact `5b30fbf2-3de4-4bfd-908f-3e048a282003`); this document covers the contract, not the pixels.

**D9: Progress UI — count-up, not the app's usual sub-second spinner; a tight importer poll interval keeps it responsive.**
The app's only existing loading idiom (`Loader2Icon` + `animate-spin` next to a button) is built for sub-second actions and would read as hung for a multi-minute import. The Result/Preview flow instead polls `GET .../imports/{jobId}` and renders `progress_current`/`progress_total` as a count-up with a flat progress-bar fill. This requires the importer's own poll-and-claim interval (a new `TESTRAIL_IMPORTER_POLL_INTERVAL`-equivalent config, default a few seconds) to be tight — unlike `jira-connector`'s 5-minute default, which would make a "click Preview" button feel broken.

**D10: Tool naming stays generic (`tools/import-connector`), TestRail is one `--source=testrail` backend inside it — a trademark constraint, verified against Idera's actual published policy, not assumed.**
Idera's (TestRail's owner) trademark usage guidelines prohibit incorporating "TestRail" into the name of a third-party product/tool in a way that could imply sponsorship or affiliation — a tool literally named `testrail-importer` would cross that line. Their policy explicitly permits a referential phrase ("imports from TestRail") describing the relationship, provided the mark is less prominent than our own product name and isn't baked into the product/tool's own name. Consequences for this change:
- The standalone tool is `tools/import-connector/` (not `tools/testrail-importer/`), matching the already-generic architecture (D1-D3's opaque `source` field, D8's `/projects/import/:source` route) rather than fighting it — TestRail is the first `--source` value, not the tool's name.
- UI copy ("Import from TestRail" as a list-item label) and internal identifiers (the `source: "testrail"` data value, code comments, this change's own name) are unaffected — they're the sanctioned referential/internal use, not a product name.
- `docs/integrations.md` and the Connect screen (a small footnote near the TestRail credential fields) both get a disclaimer: an independent project, not affiliated with, sponsored by, or endorsed by Idera, Inc.; "TestRail" is Idera's trademark. No use of TestRail's logo anywhere.
- Tracked as a broader, standing concern (not fully resolved by this one change) in issue #195 — the same check is owed to the existing `tools/jira-connector` (Atlassian's policy is more permissive but wasn't verified when that tool shipped) and to each future vendor importer (#190-193) before its own design.md is written.

## Risks / Trade-offs

- **[Risk] A TestRail instance with many/large projects makes the dry-run scan itself slow (TestRail's own API is paginated and rate-limited).** → Mitigation: the dry-run job goes through the exact same async job/poll/progress machinery as a real run (D1-D3) — there is no separate synchronous "preview" code path to design or maintain. If dry-run scans turn out to be slow in practice, the existing progress UI already covers it; no design change needed, just real-world tuning of the poll interval.
- **[Risk] No cancel affordance for a running import.** Raised during the UX pass and deliberately left unresolved rather than inventing backend behavior. → Mitigation: out of scope for this change; a job that's already `running` runs to completion (success or failure) and the resulting partial state (if it fails partway) is visible in the report and in TestPulse's existing folder/case views. Cancel-with-rollback is a real follow-up if this turns out to matter in practice, but isn't designed here.
- **[Risk] One importer deployment per target project (D4) is more deployment overhead than an unscoped token.** → Mitigation: accepted for v1 in exchange for preserving the existing scoped-token confinement guarantee; revisit if multiple concurrent TestRail migrations across many projects turns out to be a common case.
- **[Trade-off] Per-case attribution shows the importer agent, not the human who triggered the import (D5).** → Accepted: the alternative (attributing individual cases to the triggering human) would misrepresent who/what actually performed the writes. The job row's `created_by` preserves the real provenance link.

## Migration Plan

Additive only — new table, new endpoints, new route, new tool, new UI entry point. Nothing existing changes shape or behavior. No rollback complexity beyond the standard incremental-migration `Down` for `00018_import_jobs.sql` (drop the table).

Suggested build sequencing (mirrors `jira-connector`'s own file layout):
1. `00018_import_jobs.sql` migration
2. `apps/api/internal/domain` (new `ImportJob` type) → `apps/api/internal/store/import_jobs.go`
3. `apps/api/internal/service` (job lifecycle: create, claim, patch-progress, complete)
4. `packages/shared/openapi.yaml` + `make generate` (contract-first, before handlers)
5. `apps/api/internal/server/handlers.go` (browser-facing create/poll + importer-facing claim/patch)
6. `tools/import-connector/` — `cmd/import-connector/main.go` (poller skeleton, copied from `jira-connector`'s), `internal/config`, `internal/testrailclient` (new), `internal/testpulseclient` (new, or shared with jira-connector's if practical), `internal/importer` (the D6/D7 mapping logic)
7. Frontend: `ProjectsPage.tsx` entry-point menu (D8), new `/projects/import/:source` route and its Connect/Preview/Result page, per the approved Pepe mock
8. `docs/integrations.md` — extended (not forked) to cover the TestRail importer as a sibling of the Jira connector section; `deploy/compose/docker-compose.yml` gains an off-by-default `import-connector` profile, matching `jira-connector`'s
9. Sample Project: a live TestRail connection can't be seeded (no real TestRail instance to seed against), so `seed.go` is exempt for the import job itself — but the "+ New project → Import from TestRail" entry point is still a real, discoverable, user-facing UI surface and gets E2E coverage for the parts that don't require a live TestRail connection (menu appears, navigates to the route, Connect form validates).

## Open Questions

- ~~**TestRail project selection**~~ — **Resolved while implementing section 6 (`internal/importer`/poll loop)**: the credentials map (design.md D2, the same encrypted blob the Connect screen submits and the claim response decrypts) gains a `testRailProjectId` key alongside `siteUrl`/`email`/`apiKey`, entered as a plain numeric-id text input for v1 — not yet the fetched-dropdown UX Pepe's mock-pass note wanted, since that needs a `get_projects` call to happen *during* the Connect screen's own validation step, a frontend concern section 7 hasn't been built yet. The importer itself (`cmd/import-connector/main.go`) just reads `credentials["testRailProjectId"]` and parses it as an int before calling `importer.Run`. Section 7's Connect screen is free to upgrade this to a fetched dropdown later without any backend/importer change — the credentials map is opaque `map[string]string` all the way through, so the field's presentation is purely a section-7 concern.
- **"Existing empty project" as an import target**: needs a concrete, confirmed definition (the mock assumed `caseCount === 0 && suiteCount === 0`, using data `useProjectSummaries` already exposes) before the Connect screen's target picker is implemented as-is.
- **Whether the dry-run scan itself needs the count-up treatment**, or a plain spinner suffices, is genuinely unresolved until real TestRail API latency is measured (see Risks above) — default to reusing the same job/poll machinery either way, decide the *UI* treatment once real timings exist.
