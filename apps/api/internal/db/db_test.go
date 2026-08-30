package db

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// Integration tests: require a disposable PostgreSQL database.
// Skipped unless TESTPULSE_TEST_DATABASE_URL is set (CI provides a service
// container; locally: make test-db-up).

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TESTPULSE_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TESTPULSE_TEST_DATABASE_URL not set; skipping db integration tests")
	}
	pool, err := Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func resetSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		"DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
	if err != nil {
		t.Fatalf("resetting schema: %v", err)
	}
}

func TestConnectRejectsUnreachableHost(t *testing.T) {
	if os.Getenv("TESTPULSE_TEST_DATABASE_URL") == "" {
		t.Skip("TESTPULSE_TEST_DATABASE_URL not set; skipping db integration tests")
	}
	_, err := Connect(context.Background(),
		"postgres://nobody:nothing@localhost:1/nowhere?connect_timeout=1")
	if err == nil {
		t.Fatal("expected error connecting to unreachable database")
	}
}

func TestMigrateOnEmptyDatabaseReachesCurrent(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)

	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate on empty database: %v", err)
	}
	current, err := MigrationsCurrent(context.Background(), pool)
	if err != nil {
		t.Fatalf("MigrationsCurrent: %v", err)
	}
	if !current {
		t.Error("schema not current after migrating an empty database")
	}
}

func TestMigrateIsIdempotentOnRestart(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)

	for i := range 3 {
		if err := Migrate(context.Background(), pool); err != nil {
			t.Fatalf("Migrate run %d: %v", i+1, err)
		}
	}
	current, err := MigrationsCurrent(context.Background(), pool)
	if err != nil {
		t.Fatalf("MigrationsCurrent: %v", err)
	}
	if !current {
		t.Error("schema not current after repeated migrations")
	}
}

func TestReadyWhenMigratedAndReachable(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	if err := NewHealth(pool).Ready(context.Background()); err != nil {
		t.Errorf("Ready = %v, want nil", err)
	}
}

func TestNotReadyOnUnmigratedDatabase(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)

	// goose's version table itself is missing, so readiness must fail.
	if err := NewHealth(pool).Ready(context.Background()); err == nil {
		t.Error("Ready = nil on unmigrated database, want error")
	}

	// Leave the database migrated for any test that runs after.
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("re-migrating: %v", err)
	}
}

// TestMigrateWithOptionsAllowMissingMatchesNormalMigrateWhenNoGapExists
// verifies MigrateWithOptions(allowMissing=true) doesn't change behavior in
// the common case (no history gap) — it's a narrow correctness check of the
// wiring (env var -> Config.AllowMissingMigrations -> this flag), not a
// reproduction of the full 2026-08-03 gap-recovery incident. That scenario
// needs at least two embedded migrations where an earlier one was skipped;
// with only 00001_baseline.sql present, there is nothing for a gap to be
// below. Full end-to-end gap-recovery coverage is meaningful again once a
// second real migration ships — the underlying detection/recovery logic
// itself is goose's own, already covered by goose's test suite.
func TestMigrateWithOptionsAllowMissingMatchesNormalMigrateWhenNoGapExists(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	ctx := context.Background()

	if err := MigrateWithOptions(ctx, pool, true); err != nil {
		t.Fatalf("MigrateWithOptions(allowMissing=true) on empty database: %v", err)
	}
	current, err := MigrationsCurrent(ctx, pool)
	if err != nil {
		t.Fatalf("MigrationsCurrent: %v", err)
	}
	if !current {
		t.Error("schema not current after MigrateWithOptions(allowMissing=true)")
	}
}

// TestReleaseTestPlanMigrationBackfillsExistingProjects reproduces a
// pre-existing production database (project + run created before this
// migration existed) and verifies 00011_release_test_plan.sql applies
// cleanly on top of it: the existing run's test_plan_id stays nil, and the
// project's release/plan key counters — normally seeded only at project
// creation by the create_project_defaults trigger — are backfilled so
// claimEntityKey works for a Release/Test Plan created afterward
// (introduce-release-test-plan design.md, migration plan step 1).
func TestReleaseTestPlanMigrationBackfillsExistingProjects(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	ctx := context.Background()

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("SetDialect: %v", err)
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()

	if err := goose.UpToContext(ctx, sqlDB, "migrations", 10); err != nil {
		t.Fatalf("UpTo(10): %v", err)
	}

	var projectID, runID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('PRE', 'Pre-existing project') RETURNING id`,
	).Scan(&projectID); err != nil {
		t.Fatalf("seeding pre-existing project: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_runs (key, project_id, name) VALUES ('PRE-R1', $1, 'Existing run') RETURNING id`,
		projectID,
	).Scan(&runID); err != nil {
		t.Fatalf("seeding pre-existing run: %v", err)
	}

	if err := goose.UpContext(ctx, sqlDB, "migrations"); err != nil {
		t.Fatalf("migrating the rest of the way: %v", err)
	}

	var testPlanID *string
	if err := pool.QueryRow(ctx, `SELECT test_plan_id FROM test_runs WHERE id = $1`, runID).Scan(&testPlanID); err != nil {
		t.Fatalf("querying pre-existing run: %v", err)
	}
	if testPlanID != nil {
		t.Errorf("pre-existing run's test_plan_id = %v, want nil", *testPlanID)
	}

	for _, entityType := range []string{"release", "plan"} {
		var counter int
		err := pool.QueryRow(ctx,
			`SELECT next_value FROM project_key_counters WHERE project_id = $1 AND entity_type = $2`,
			projectID, entityType,
		).Scan(&counter)
		if err != nil {
			t.Errorf("%s counter not backfilled for pre-existing project: %v", entityType, err)
		}
	}
}

func TestNotReadyWhenConnectionClosed(t *testing.T) {
	url := os.Getenv("TESTPULSE_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TESTPULSE_TEST_DATABASE_URL not set; skipping db integration tests")
	}
	pool, err := Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	pool.Close()

	if err := NewHealth(pool).Ready(context.Background()); err == nil {
		t.Error("Ready = nil on closed pool, want error")
	}
}
