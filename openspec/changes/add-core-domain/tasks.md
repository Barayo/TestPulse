# Tasks: Add Core Domain

TDD throughout: each task's tests are written first (red), then the implementation (green). Spec scenarios map to named tests.

## 1. Schema and domain types

- [x] 1.1 Goose migration for the domain tables (projects, test_cases, test_case_versions, test_suites, suite_cases, test_runs, test_run_items, test_run_results) with FKs, unique constraints, and indexes per design D1–D3; integration test proves migration applies and is idempotent
- [x] 1.2 `internal/domain` types and invariants (status enum with validation, verdict enum, version immutability rules) with unit tests for every invariant

## 2. Store layer (integration-tested against real Postgres)

- [x] 2.1 Project repository: create/list/rename/archive + tests
- [x] 2.2 Case repository: create-as-v1, edit-creates-version, version history, soft delete + tests (including "deleted case's versions remain readable")
- [x] 2.3 Suite repository: create, n:m membership add/remove + tests
- [x] 2.4 Run repository: create with version pinning (transactional), add-item-to-open-run, item status update, append result (insert-only), summary query + tests (including "pin survives later edits" and "results accumulate in order")

## 3. Service + REST API (contract-first)

- [x] 3.1 Extend `packages/shared/openapi.yaml` with the full domain surface (design D6) and regenerate the TypeScript client
- [x] 3.2 `internal/service` use cases wiring stores with transactions; unit tests validate-before-store (nil-store proof), happy paths via API integration tests
- [x] 3.3 HTTP handlers for projects/cases/suites with validation errors naming fields + handler tests
- [x] 3.4 HTTP handlers for runs/items/results/status/summary + handler tests covering every test-execution spec scenario reachable via API
- [x] 3.5 Coverage check: 87.9% with -coverpkg cross-package accounting (fixed parallel-package db clobbering via per-package test databases in internal/testutil)

## 4. Web UI

- [x] 4.1 Add React Router with routes `/`, `/projects/{id}`, `/runs/{id}`; navigation shell (title links home, health badge) + component tests
- [x] 4.2 Authoring screens (plain forms): project list/create, case list/create/edit (inline edit creates a new version, version badge shown), suite list with membership add (select + button) and remove (per-case button) + component tests for form validation, version badge, edit, and suite membership
- [x] 4.3 Run creation flow (from all current project cases) + component tests
- [x] 4.4 Run execution board (the polished screen): item list with status chips, pinned-version detail pane with newer-version hint, verdict (pass/failed/blocked/skipped) + comment controls, result history, retest action + component tests for each board interaction
- [x] 4.5 Coverage check: 95.26% statements / 80.76% branches / 100% functions / 99.36% lines, all ≥ 80%

## 5. E2E (BDD, named after spec scenarios)

- [x] 5.1 Playwright: test-authoring journeys (create project → case → edit creates version → suite membership) — 4 scenarios, `e2e/test-authoring.spec.ts`. Caught and fixed a real gap: the UI had no suite-creation form (added with TDD).
- [x] 5.2 Playwright: test-execution journeys (create run → pin proven by editing case mid-run → execute from board → retest flow → summary counts) — 4 scenarios, `e2e/test-execution.spec.ts`. Caught and fixed a real bug: `RunPage` didn't refresh the result log/status after recording a verdict (stale-closure bug masked by unit-test mocks; E2E against the real API caught it). Also updated the inherited `platform-deployment.spec.ts` (Dashboard text and SPA-fallback route no longer exist post-router).

## 6. Docs and wrap-up

- [x] 6.1 Updated `docs/api.md` (full domain endpoint reference), `docs/architecture.md` (domain model + internal package layout), added `docs/database.md` (ER diagram + table-by-table reference), added `docs/test-management.md` user guide with the run board walkthrough; linked all from `docs/README.md`
- [x] 6.2 Updated README status section and added the "endpoints are open until add-identity-basics" security warning to README and docs/deployment.md
- [x] 6.3 Full verification sweep: Go 7/7 packages green, 87.9% coverage (≥80% gate), 0 lint issues; web 39/39 tests green, 95.58%/83.03%/100%/99.4% coverage (all ≥80%), 0 lint issues, typecheck clean; compose stack rebuilt clean and 13/13 E2E scenarios green end-to-end

## 7. Folders (amendment — added after database review, before commit; see design D8)

- [x] 7.1 Amended migration `00002_core_domain.sql`: `test_case_folders` (self-referencing tree per project, partial unique index enforcing exactly one root) + `test_cases.folder_id` (mandatory FK); root folder created via a DB trigger on project insert (`create_project_root_folder`), guaranteeing the invariant regardless of insert path. 5 schema tests green (table existence, root auto-creation + duplicate-root rejection, mandatory folder_id + nested subfolder).
- [x] 7.2 `internal/domain`: `Folder`/`NewFolder` types + invariants (name required, parent required — only the DB trigger creates a root) with unit tests; `TestCase` gained `FolderID`.
- [x] 7.3 `internal/store`: `FolderRepo` — `Root`, `Get`, `Create` (subfolder only), `List` (flat, tree reconstructed by caller), `Delete` (transactional reparent of child folders + cases to the deleted folder's parent, `ErrRootFolder` sentinel when targeting root); `CaseRepo` gained `Move` and folder-aware `Create`/`Get`/`List`. 8 store integration tests green (root creation, default-to-root, nested subfolders, tree listing, move preserves suite membership, reparent-on-delete, root-not-deletable).
- [x] 7.4 `internal/service` (`CreateFolder`/`ListFolders`/`DeleteFolder`/`MoveCase`, validate-before-store tests) + `packages/shared/openapi.yaml` (`Folder`, `NewFolder`, `CaseCreateInput` schemas; `/projects/{id}/folders`, `/folders/{id}`, `/cases/{id}/folder` paths) + REST handlers, with `store.ErrRootFolder` mapped to 400 in the shared error responder; regenerated TypeScript client. 6 API-level tests green covering every folder scenario end-to-end over HTTP.
- [x] 7.5 `ProjectPage`: minimal folder UI — an optional folder `<select>` on case creation (blank = "Root (default)", omitted from the request body so the API resolves it; non-root folders selectable) and a basic create-folder form (name only, parent always root — arbitrary-parent picking and full tree browsing are the sidebar's job, `redesign-ui` design already updated). 4 new component tests (default-to-root omits folderId from body, explicit folder sent, folder creation, empty-name validation); 21/21 `ProjectPage` tests green.
- [x] 7.6 E2E: extended `test-authoring.spec.ts` with 3 folder scenarios reachable through the actual UI (root folder available and cases default into it, nested folder creation + case placement, folder name validation — verified via the `request` fixture against the real API for data assertions). Move/delete/root-not-deletable have no UI surface yet (deferred to `redesign-ui`'s sidebar) and stay covered at the store/API layers (tasks 7.3/7.4). 16/16 E2E green, twice in a row (no flakiness).
- [x] 7.7 Updated `docs/database.md` (Mermaid `erDiagram`, replacing the old ASCII art, covering all tables including folders) and `docs/api.md` (folder endpoints) and `docs/test-management.md` (folders-vs-suites explainer). Full verification sweep re-run clean: Go 7/7 packages, 86.8% coverage, 0 lint issues; web 95.58%/83.06%/100%/99.47% coverage, 0 lint issues, typecheck clean; compose stack rebuilt from scratch and 16/16 E2E scenarios green.
