## 1. Generate schema.sql from the current migration history

- [x] 1.1 Apply all 15 existing goose migrations to a fresh throwaway database
- [x] 1.2 `pg_dump --schema-only` that database; strip boilerplate (`SET` session settings, `COMMENT ON EXTENSION`, ownership/privilege statements) to produce `apps/api/internal/db/schema.sql`
- [x] 1.3 Verify: apply `schema.sql` to a second fresh throwaway database, `pg_dump --schema-only` that too, diff the two dumps — they must match (proves `schema.sql` is byte-accurate to the goose-migrated result, not a hand-reconstruction error) — diff showed only the expected differences: goose's own bookkeeping table gone, `schema_info` added

## 2. New startup logic: apply-once, checksum-verify

- [x] 2.1 Write failing tests in `apps/api/internal/db/db_test.go`: `TestApplySchemaOnEmptyDatabaseReachesCurrent`, `TestApplySchemaIsIdempotentOnRestart` (apply twice, second call is a no-op, no error), `TestSchemaCurrentTrueAfterApply`, `TestSchemaCurrentFalseOnChecksumMismatch` (apply, then simulate a differing embedded schema and assert `SchemaCurrent` returns false), `TestReadyFailsOnSchemaMismatch` (mirrors existing `TestNotReadyOnUnmigratedDatabase`)
- [x] 2.2 Implement in `apps/api/internal/db/db.go`: `//go:embed schema.sql`, `ApplySchema(ctx, pool) error` (query `schema_info`; table-not-found → apply `schema.sql` in one transaction + insert checksum row; table exists → compare checksums, log a warning on mismatch, do not error), `SchemaCurrent(ctx, pool) (bool, error)` (checksum match check, backs `/readyz` the same way `MigrationsCurrent` did); remove `Migrate`/`MigrateWithOptions`/`MigrationsCurrent` and the goose import
- [x] 2.3 Verify tests pass — also caught and fixed a real gap: `pg_dump --schema-only` excludes table data, so the seed-data `INSERT`s three migrations carried inline (`instance_settings`'s row, four default roles) were missing from the first `schema.sql` draft; re-verified with a full structure+data diff, not just structure

## 3. Update call sites

- [x] 3.1 `apps/api/cmd/testpulse-api/main.go` — `db.ApplySchema(ctx, pool)` in place of `db.MigrateWithOptions(ctx, pool, cfg.AllowMissingMigrations)`
- [x] 3.2 `apps/api/cmd/seed-demo/main.go` — same call-site update
- [x] 3.3 `apps/api/internal/testutil/testutil.go` — same call-site update (this is what every DB-backed test package depends on)
- [x] 3.4 `apps/api/internal/db/identity_schema_test.go`, `project_enrichment_schema_test.go`, `schema_test.go` — update their `Migrate`/`resetSchema` call sites to the new function name
- [x] 3.5 Remove `AllowMissingMigrations` from `apps/api/internal/config/config.go` (field, env var read, doc comment) and its tests in `config_test.go`
- [x] 3.6 Verify full `go build ./...` and `go test ./...` pass

## 4. Remove the migrations directory and goose dependency

- [x] 4.1 Delete all 15 files under `apps/api/internal/db/migrations/` and the now-empty directory
- [x] 4.2 `go mod tidy` to drop `github.com/pressly/goose/v3` from `go.mod`/`go.sum`
- [x] 4.3 Remove the CI `migrations` immutability job from `.github/workflows/ci.yml`
- [x] 4.4 Verify `go build ./...`, `go vet ./...`, `golangci-lint run` all pass with goose gone

## 5. Docs and CLAUDE.md

- [x] 5.1 Rewrite CLAUDE.md's "Architecture constraints" migration-policy paragraph: state the pre-1.0-only reversal explicitly, why it's structurally different from the outage it's reversing (checksum mismatch fails loud, not silent), and that real incremental migrations must return before 1.0.0
- [x] 5.2 Rewrite `docs/database.md`'s opening ("schema.sql is the single source of truth, edited in place pre-1.0" instead of "goose migrations... those SQL files are the source of truth") — also fixed one stale per-column `00003_identity.sql` citation further down the page
- [x] 5.3 Update `docs/deployment.md`, `docs/architecture.md` ("Migrations at startup" section + tech-choices table entry), `docs/getting-started.md`
- [x] 5.4 Update `docs/development.md`'s already-stale "wipe your local DB" paragraph — it becomes accurate again, just needs re-dating/light editing to reference `schema.sql` instead of the old amend-in-place migration policy

## 6. Local/CI/E2E database resets

- [x] 6.1 Wipe and recreate the local dev Postgres volume(s) used by `make dev-api`/`docker compose up`; verify a fresh `docker compose up --build` reaches ready — verified live: `/healthz`/`/readyz` both `ok`, login works, all 4 seeded roles present with correct flags, sample project seeded
- [x] 6.2 Verify CI's ephemeral test database (used by `make coverage-api`/the `API (Go)` CI job) works against the new `ApplySchema` with no leftover goose state — the full Go test suite (`go test ./...`, all packages including `internal/db` itself) passes cleanly against `testpulse-testdb`, which is the same fresh-per-run mechanism CI uses
- [x] 6.3 Verify `make e2e`'s compose stack reaches ready and the full E2E suite passes against the new schema — compose reaches ready; the E2E suite hit the pre-existing, already-diagnosed local-only login rate-limiter (#113, all local requests share one client IP) on repeated back-to-back local runs, not a schema-related failure — `teams.spec.ts` (the test most directly exercising the new schema's seeded roles/permissions path) passes reliably in isolation every time; CI (fresh runner, no accumulated local request history) is the authoritative signal for this suite, per established practice this session

## 7. testpulse.fly.dev — explicit, separate step

- [ ] 7.1 **Stop and get explicit confirmation from the user immediately before this task** — wiping `testpulse.fly.dev`'s database is destructive and irreversible for whatever evaluation data currently lives there
- [ ] 7.2 Wipe and redeploy `testpulse.fly.dev` from the new `schema.sql`; verify `/healthz` and `/readyz` both report healthy against the fresh schema

## 8. Spec sync

- [ ] 8.1 Sync `specs/platform-deployment/spec.md`'s delta into `openspec/specs/` at archive time
