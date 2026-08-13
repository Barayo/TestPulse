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

func TestApplySchemaOnEmptyDatabaseReachesCurrent(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)

	if err := ApplySchema(context.Background(), pool); err != nil {
		t.Fatalf("ApplySchema on empty database: %v", err)
	}
	current, err := SchemaCurrent(context.Background(), pool)
	if err != nil {
		t.Fatalf("SchemaCurrent: %v", err)
	}
	if !current {
		t.Error("schema not current after applying to an empty database")
	}
}

func TestApplySchemaIsIdempotentOnRestart(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)

	for i := range 3 {
		if err := ApplySchema(context.Background(), pool); err != nil {
			t.Fatalf("ApplySchema run %d: %v", i+1, err)
		}
	}
	current, err := SchemaCurrent(context.Background(), pool)
	if err != nil {
		t.Fatalf("SchemaCurrent: %v", err)
	}
	if !current {
		t.Error("schema not current after repeated ApplySchema calls")
	}
}

func TestSchemaCurrentFalseOnChecksumMismatch(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	ctx := context.Background()
	if err := ApplySchema(ctx, pool); err != nil {
		t.Fatalf("ApplySchema: %v", err)
	}

	// Simulate a database whose applied schema no longer matches the
	// running binary's schema.sql — the case a manual reset is required
	// for, per design.md.
	if _, err := pool.Exec(ctx, "UPDATE schema_info SET checksum = 'stale-checksum'"); err != nil {
		t.Fatalf("simulating a stale checksum: %v", err)
	}

	current, err := SchemaCurrent(ctx, pool)
	if err != nil {
		t.Fatalf("SchemaCurrent: %v", err)
	}
	if current {
		t.Error("SchemaCurrent = true with a mismatched checksum, want false")
	}
}

func TestReadyWhenSchemaAppliedAndReachable(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := ApplySchema(context.Background(), pool); err != nil {
		t.Fatalf("ApplySchema: %v", err)
	}

	if err := NewHealth(pool).Ready(context.Background()); err != nil {
		t.Errorf("Ready = %v, want nil", err)
	}
}

func TestNotReadyOnUnappliedDatabase(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)

	// schema_info itself is missing, so readiness must fail.
	if err := NewHealth(pool).Ready(context.Background()); err == nil {
		t.Error("Ready = nil on an unapplied database, want error")
	}

	// Leave the database with the schema applied for any test that runs after.
	if err := ApplySchema(context.Background(), pool); err != nil {
		t.Fatalf("re-applying: %v", err)
	}
}

func TestNotReadyOnSchemaMismatch(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	ctx := context.Background()
	if err := ApplySchema(ctx, pool); err != nil {
		t.Fatalf("ApplySchema: %v", err)
	}
	if _, err := pool.Exec(ctx, "UPDATE schema_info SET checksum = 'stale-checksum'"); err != nil {
		t.Fatalf("simulating a stale checksum: %v", err)
	}

	if err := NewHealth(pool).Ready(ctx); err == nil {
		t.Error("Ready = nil on a schema/database checksum mismatch, want error")
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
