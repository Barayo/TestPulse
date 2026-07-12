# Design: Add Core Domain

## Context

Builds on the walking skeleton (archived `establish-architecture`): Go + chi + pgx + goose, OpenAPI contract-first, embedded React UI, TDD/BDD with enforced coverage gates. The domain semantics were settled during v0.1 planning and are recorded in `ROADMAP.md`; this design turns them into a schema and API shape. Auth intentionally does not exist yet.

## Goals / Non-Goals

**Goals:**

- Relational schema honoring the two core decisions: immutable case versioning and append-only result logs.
- Service layer designed so REST is a thin adapter — the same services back the MCP server later (D8 of the founding design).
- Run execution board as the UI centerpiece; authoring UI stays plain.

**Non-Goals:**

- Auth/RBAC (next change), MCP tools, reporting beyond run summary, attachments, comments-on-cases, bulk import/export, search beyond simple listing (FTS arrives when it has users).

## Decisions

### D1: Versioning via `test_case_versions` table

`test_cases` holds identity + mutable metadata pointer (`project_id`, `current_version`); `test_case_versions` holds immutable content rows `(case_id, version, title, description, steps JSONB, expected_result, priority, tags, created_at)`. Every edit inserts a new version row and bumps `current_version`. Deleting a case soft-deletes (versions referenced by runs must survive).

- *Alternative — mutable row + history table*: rejected; makes "what did run X execute" a join against history reconstruction instead of a direct FK.

### D2: Runs pin versions at creation

`test_run_items` rows are `(run_id, case_id, case_version, assignee, current_status)` with FK to the exact version row. Adding a case to an open run pins the version current *at that moment*. No mechanism re-pins mid-run — a newer case version means a new run (UI shows a "newer version exists" hint).

### D3: Result log is append-only, status is derived-but-stored

`test_run_results` rows `(run_item_id, actor, verdict, comment, created_at)` are insert-only (no UPDATE/DELETE grants in code paths). `current_status` on the run item is updated in the same transaction as a result insert (or by an explicit status action: assign/block/retest). Statuses: `pending, pass, failed, skipped, blocked, retest`. `retest` is a status set by a human action, never a verdict; verdicts are `pass, failed, skipped, blocked`.

- *Rationale*: storing current_status avoids computing it from the log on every list; the log stays the source of truth for history/flakiness (v0.3).

### D4: Actor is a free-text identity placeholder

Until `add-identity-basics`, `actor` on results is a required plain string (e.g. name from the UI). The column type (text) survives the identity change — it becomes a stable actor identifier then. Documented as transitional.

### D5: Service layer package shape

`internal/domain` (types + invariants), `internal/store` (pgx repositories, transactions), `internal/service` (use cases: CreateRun pins versions, RecordResult appends + updates status), `internal/server` (HTTP only). MCP later consumes `internal/service` directly.

### D6: API shape

Nouns under `/api/v1`: `projects`, `projects/{id}/cases` (POST creates v1, PUT creates new version), `cases/{id}/versions`, `suites` (+ `PUT /suites/{id}/cases` for membership), `runs` (create from suite and/or explicit case list), `runs/{id}/items`, `items/{id}/results` (POST), `items/{id}/status` (PUT for assign/block/retest), `runs/{id}/summary`. Cursor-less offset pagination (`limit/offset`) — adequate pre-v1.

### D7: UI routes

`/projects` (list + form), `/projects/{id}` (cases + suites tabs, plain forms), `/runs/{id}` (the execution board: item list with status chips, case detail pane showing the *pinned* version, verdict buttons + comment box). React Router added; state kept simple (fetch + local state, no state library yet).

### D8: Folders — project-level, orthogonal to suites, mandatory single parent

`test_case_folders` forms a self-referencing tree per project (`id`, `project_id`, `parent_folder_id NULL`, `name`). Every project gets a root folder created in the same transaction as the project itself (`parent_folder_id IS NULL`, one per project, not user-deletable). Every `test_case` has a mandatory `folder_id` — defaults to the project's root folder if not specified at creation, never null. Folders are **orthogonal to suites**: a case's folder is its one authoritative location (browsing/organizing, like a filesystem), while suite membership stays n:m (a case can be in many suites regardless of which folder it lives in) — two independent groupings, not a hierarchy replacing the other.

- *Deleting a non-empty folder*: reparents its direct children (subfolders and cases) to the deleted folder's parent (or to root, if deleting a root-level folder) — avoids orphaning content, mirrors "move contents up a level" filesystem behavior. The root folder itself cannot be deleted.
- *Rejected — case in multiple folders*: breaks the "authoritative location" property that makes folders useful for browsing; multi-membership is what suites are already for.
- *Rejected — optional folder*: leaves cases in an inconsistent "nowhere" state that the UI would need to special-case everywhere; a default root folder is simpler and matches the filesystem mental model users already have.

## Risks / Trade-offs

- **Open endpoints until identity lands** → v0.1 is explicitly not for shared deployments yet; README and docs carry the warning. Identity is the very next change.
- **Version-per-edit could grow rows fast** → content rows are small; acceptable until proven otherwise. No dedup of identical saves in this change.
- **Free-text actor is weak data** → transitional by design (D4); the identity change migrates semantics, not schema.
- **Offset pagination degrades on large tables** → fine for v0.1 scale; revisit with FTS/search work.

## Migration Plan

Single goose migration adding all tables with FKs and indexes (`test_case_versions(case_id, version)` unique; `test_run_items(run_id, case_id)` unique; `test_run_results(run_item_id, created_at)`). Rollback = goose down (drops tables). No data migration (nothing exists).

## Open Questions

- Suite membership ordering (does case order in a suite matter?) — start unordered; decide when the execution board proves the need.
- Whether `PUT /cases/{id}` with identical content should skip creating a version — deferred (no dedup in v0.1).
