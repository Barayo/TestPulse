## 1. Dependencies

- [x] 1.1 Re-add `github.com/pressly/goose/v3` and `github.com/jackc/pgx/v5/stdlib` to `apps/api/go.mod`/`go.sum` (`go get`, matching the versions last used at git commit `6bb287f^` unless a newer compatible release exists).

## 2. Baseline migration

- [x] 2.1 Create `apps/api/internal/db/migrations/00001_baseline.sql`: a single goose "up" migration containing today's full schema (the current `schema.sql`'s CREATE statements, adapted to goose's `-- +goose Up` / `-- +goose Down` markers). No `Down` beyond `-- +goose Down` with a comment noting the baseline is not meant to be rolled back.

## 3. `db` package: restore goose (TDD)

- [x] 3.1 Write failing tests in `apps/api/internal/db/db_test.go` for the goose-based API: `TestMigrateOnEmptyDatabaseReachesCurrent`, `TestMigrateIsIdempotentOnRestart`, `TestMigrationsCurrentFalseOnVersionGap` (or equivalent — a database ahead of/behind the embedded migration set), `TestMigrateWithAllowMissingAppliesGappedVersion`. Confirm each fails for the right reason (undefined `Migrate`/`MigrationsCurrent`, not a typo) — reference the pre-removal shape at `6bb287f^` for the equivalent tests' structure, but rewrite against the new `00001_baseline.sql`, not the old 14-file set.
- [x] 3.2 Restore `apps/api/internal/db/db.go`'s `Migrate`, `MigrateWithOptions`, `MigrationsCurrent` (embedding `migrations/*.sql`, `goose.SetBaseFS` / `goose.SetDialect("postgres")` / `goose.UpContext` / `goose.GetDBVersionContext` / `goose.CollectMigrations`), remove `ApplySchema`/`SchemaCurrent`/`schemaChecksum`, update `Health.Ready` to call `MigrationsCurrent`. Confirm 3.1's tests now pass.
- [x] 3.3 Delete `apps/api/internal/db/schema.sql`.
- [x] 3.4 Update `apps/api/internal/db/schema_test.go`, `identity_schema_test.go`, `project_enrichment_schema_test.go` (all currently call `ApplySchema` directly) to call `Migrate` instead; confirm they pass against the new baseline.
- [x] 3.5 Update the package doc comment at the top of `db.go` (currently describes the pre-1.0-only apply-once model) to describe the incremental model as permanent.

## 4. Config: escape hatch

- [x] 4.1 Write a failing test in `apps/api/internal/config/config_test.go` asserting `TESTPULSE_ALLOW_MISSING_MIGRATIONS=true` sets `Config.AllowMissingMigrations = true` and it defaults to `false`.
- [x] 4.2 Restore `Config.AllowMissingMigrations` and its `Load` wiring in `apps/api/internal/config/config.go`, restore its doc-comment block. Confirm 4.1 passes.

## 5. Wire into entrypoints

- [x] 5.1 Update `apps/api/cmd/testpulse-api/main.go`: replace `db.ApplySchema(ctx, pool)` / `db.SchemaCurrent(ctx, pool)` calls with `db.MigrateWithOptions(ctx, pool, cfg.AllowMissingMigrations)`.
- [x] 5.2 Update `apps/api/cmd/seed-demo/main.go`: replace `db.ApplySchema(ctx, pool)` with `db.Migrate(ctx, pool)`.
- [x] 5.3 Update `apps/api/internal/testutil/testutil.go`'s shared test-database helper to call `db.Migrate` instead of `db.ApplySchema`; run the full `internal/...` test suite locally against a freshly wiped test database and confirm it passes.

## 6. CI immutability gate

- [x] 6.1 Restore the `migrations` job in `.github/workflows/ci.yml` (from `git show 6bb287f -- .github/workflows/ci.yml`): diffs `apps/api/internal/db/migrations/` against the base ref, fails if any file shows git status `M`.
- [x] 6.2 Verify the job locally by simulating: create a throwaway commit editing `00001_baseline.sql` on a branch and confirm the diff logic would flag it (`git diff --name-status <base> HEAD -- apps/api/internal/db/migrations/`), then discard the throwaway commit.

## 7. Docs

- [x] 7.1 Update `CLAUDE.md`'s "Architecture constraints" section: remove the `replace-migrations-with-schema-sql` paragraph, reinstate incremental-migration policy as permanent (goose, one file per change, CI-enforced immutability), referencing this change instead of the old one.
- [x] 7.2 Update `docs/architecture.md`'s schema/migration section to describe the goose-based model (embedded `migrations/*.sql`, applied incrementally at startup, `TESTPULSE_ALLOW_MISSING_MIGRATIONS` escape hatch) in place of the apply-once/checksum model.
- [x] 7.3 Update `docs/development.md` (or wherever the "wipe your local volume after a schema change" caveat currently lives) to note this is now only needed for this one transition, not for every future migration.
- [x] 7.4 Update `docs/api.md` or any other docs page that references `schema.sql` or the checksum-mismatch `/readyz` behavior by name. Also updated `docs/database.md` and `docs/deployment.md` (found to reference `schema.sql` extensively, in scope of the same standing docs rule) and a stray Go comment in `internal/service/project_rbac.go`.

## 8. Sample Project showcase

- [x] 8.1 N/A — purely internal/infra change with no new user-visible surface (CLAUDE.md's explicit exemption for infra/CI/refactors applies). No `seed.go` / `seed_test.go` changes needed.

## 9. Local verification

- [x] 9.1 `docker compose down -v` (or equivalent) to wipe the local dev volume, then `make dev-api` / `make compose-up` and confirm a clean startup applies `00001_baseline.sql` and reaches ready. (Caught and fixed a real bug this way: the first baseline draft had inline forward-referencing FKs that broke table-creation order — rewritten to defer all FKs to `ALTER TABLE` at the end, matching the original `schema.sql` structure.)
- [x] 9.2 `make coverage-api` passes with the `internal/...` ≥ 80% gate intact. (81.1%.)
- [x] 9.3 `make test-db-up` (wiped) + `make e2e` passes against the new baseline. (117/119 on first run with default rate limits; 2 failures traced to the compose file's production-strict login rate limit, not this change — CI overrides it via shell env before `docker compose up`, which a plain local `make e2e` doesn't. Rerun with `TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE=600 TESTPULSE_LOGIN_RATE_LIMIT_BURST=100` matching CI: 114/116, with the remaining 2 confirmed as pre-existing parallel-worker timing flakes — both pass serially with `--workers=1`.)

## 10. Rollout: `testpulse.fly.dev`

- [ ] 10.1 Merge this change to `main`. Expect `testpulse.fly.dev`'s automatic Fly deploy to crash-loop (`/readyz` failing because `goose_db_version` doesn't exist yet) — this is expected, not a signal to revert.
- [ ] 10.2 Run the documented wipe-and-redeploy recovery procedure against `testpulse.fly.dev`: temporary env-var-gated wipe step in `main.go`, `flyctl deploy --strategy immediate` (bypassing git/CI, never committed), verify via `flyctl logs` and `curl /readyz`, then `git checkout -- apps/api/cmd/testpulse-api/main.go` and redeploy clean, confirmed via an empty `git diff`.

## 11. Close out

- [ ] 11.1 Sync this change's specs delta into `openspec/specs/platform-deployment/spec.md`.
- [ ] 11.2 Archive this OpenSpec change.
