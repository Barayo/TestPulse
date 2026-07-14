# Tasks: Add run lifecycle status

TDD throughout: write the failing test first, then the minimal change to pass
(CLAUDE.md standing rule). Contract-first: `openapi.yaml` changes land in the
same commit as the Go handlers they describe, then `make generate`.

## 1. Migration and domain

- [ ] 1.1 Amend `00002_core_domain.sql`: add `status text NOT NULL DEFAULT
      'open' CHECK (status IN ('open', 'closed'))` to `test_runs`. Migration
      test asserting the column, default, and constraint.
- [ ] 1.2 `domain.RunStatus` type (`open`/`closed`) and `Run.Status` field.

## 2. Store layer (test-first)

- [ ] 2.1 `RunRepo.Close(ctx, runID) error` / `Reopen(ctx, runID) error`.
      `RunRepo.Get` already returns the run — extend it to include `Status`.
      Integration tests for close/reopen and for `Get` reflecting the
      current status.
- [ ] 2.2 Guard the three existing mutating run-item store methods
      (`AddItem`, `AppendResult`, `SetItemStatus`/`AssignItem`) so they
      return `ErrRunClosed` (new store-level sentinel, mirroring
      `ErrNotFound`/`ErrRootFolder`) when the parent run is closed.
      Integration tests: each of the three rejected on a closed run,
      unaffected on an open one.

## 3. Service layer (test-first)

- [ ] 3.1 `service.ConflictError` (409), alongside the existing
      `ValidationError`/`UnauthorizedError`/`ForbiddenError`. `CloseRun(ctx,
      runID) error`; `ReopenRun(ctx, actor, runID) error` — `forbidden()`
      unless `actor.Role == domain.RoleAdmin` (design D2). Both `s.audit(...)`
      on success (`close`/`reopen`, entity type `run`).
- [ ] 3.2 Wire `store.ErrRunClosed` → `service.ConflictError` translation in
      `AddRunItem`, `RecordResult`, `UpdateItem`. Service tests: each
      returns `ConflictError` on a closed run.

## 4. Contract and handlers (test-first)

- [ ] 4.1 `packages/shared/openapi.yaml`: `Run` schema gains `status`
      (`open`/`closed` enum); `POST /api/v1/runs/{runId}/close`; `POST
      /api/v1/runs/{runId}/reopen`. `make generate`.
- [ ] 4.2 Handlers + `409` mapping in `respond()`. Handler tests: close
      succeeds for a non-admin who can already write; reopen succeeds for
      admin, `403` for non-admin; a closed run's `/results`, `/status`,
      `/items` all `409`.

## 5. Web UI

- [ ] 5.1 Run board shows the run's status (open/closed badge); disables
      verdict-recording, status, and assignee controls when closed, with a
      message pointing at "ask an admin to reopen it."
- [ ] 5.2 Close control (any authenticated user, matching who can already
      record results); reopen control visible/usable only for `admin`
      (mirrors `UsersPage`'s admin gate from `add-identity-basics`).
- [ ] 5.3 Update E2E specs touching run execution
      (`apps/web/e2e/test-execution.spec.ts`) for the new status badge if
      it changes existing selectors; add a scenario closing a run and
      confirming recording is blocked, then reopening as admin.

## 6. Docs and verification

- [ ] 6.1 Update `docs/api.md` (new endpoints, `409` in the error-shape
      list) and `docs/architecture.md`/`database.md` if they describe the
      run/item schema.
- [ ] 6.2 Full verification sweep: `make coverage-api` (≥80%), `make
      coverage-web` (≥80% all metrics), `make lint`, `make generate` (no
      drift), `make e2e`.
