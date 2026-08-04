package db

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func stdlibOpenDB(t *testing.T, pool *pgxpool.Pool) *sql.DB {
	t.Helper()
	sqlDB := stdlib.OpenDBFromPool(pool)
	t.Cleanup(func() { _ = sqlDB.Close() })
	return sqlDB
}

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

func TestMigrateIsIdempotent(t *testing.T) {
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

// TestMigrateWithAllowMissingRecoversFromAHistoryGap reproduces the
// production incident (2026-08-03): a deploy applied migrations up to
// version 7 without ever recording version 6 as applied (most likely a
// stale build that didn't embed that file), so every later startup that
// does embed it refuses to proceed rather than silently skip the gap.
// AllowMissing (TESTPULSE_ALLOW_MISSING_MIGRATIONS) is the deliberate
// escape hatch: it applies the missing migration and continues, instead
// of leaving the instance crash-looping forever.
func TestMigrateWithAllowMissingRecoversFromAHistoryGap(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	ctx := context.Background()

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("SetDialect: %v", err)
	}
	sqlDB := stdlibOpenDB(t, pool)
	if err := goose.UpToContext(ctx, sqlDB, "migrations", 5); err != nil {
		t.Fatalf("UpTo 5: %v", err)
	}
	// Simulate a deploy that recorded version 7 as applied without version
	// 6 ever running — the exact gap goose's missing-migration check exists
	// to catch.
	if _, err := pool.Exec(ctx,
		"INSERT INTO goose_db_version (version_id, is_applied) VALUES ($1, true)", 7,
	); err != nil {
		t.Fatalf("simulating history gap: %v", err)
	}

	if err := Migrate(ctx, pool); err == nil {
		t.Fatal("Migrate should refuse to proceed past a migration-history gap")
	}

	if err := MigrateWithOptions(ctx, pool, true); err != nil {
		t.Fatalf("MigrateWithOptions(allowMissing=true): %v", err)
	}
	current, err := MigrationsCurrent(ctx, pool)
	if err != nil {
		t.Fatalf("MigrationsCurrent: %v", err)
	}
	if !current {
		t.Error("schema not current after allow-missing recovery")
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
