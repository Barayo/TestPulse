package db

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
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
