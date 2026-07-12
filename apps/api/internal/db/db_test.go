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
