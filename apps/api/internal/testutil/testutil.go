// Package testutil provides database helpers for integration tests.
// Each test package gets its own database (derived from the base URL) so
// packages can run in parallel without clobbering each other's schema.
package testutil

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Barayo/TestPulse/apps/api/internal/db"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// Pool returns a pooled connection to a per-suffix database with a freshly
// reset, fully migrated schema. Skips the test when
// TESTPULSE_TEST_DATABASE_URL is unset.
func Pool(t *testing.T, suffix string) *pgxpool.Pool {
	t.Helper()
	base := os.Getenv("TESTPULSE_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TESTPULSE_TEST_DATABASE_URL not set; skipping integration tests")
	}
	ctx := context.Background()

	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("parsing TESTPULSE_TEST_DATABASE_URL: %v", err)
	}
	dbName := fmt.Sprintf("testpulse_%s", suffix)

	// Ensure the per-package database exists (connect to the base database).
	admin, err := pgxpool.New(ctx, base)
	if err != nil {
		t.Fatalf("connecting to admin database: %v", err)
	}
	defer admin.Close()
	var exists bool
	if err := admin.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`, dbName).Scan(&exists); err != nil {
		t.Fatalf("checking database: %v", err)
	}
	if !exists {
		if _, err := admin.Exec(ctx, "CREATE DATABASE "+dbName); err != nil {
			t.Fatalf("creating database %s: %v", dbName, err)
		}
	}

	u.Path = "/" + dbName
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatalf("connecting to %s: %v", dbName, err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
		t.Fatalf("resetting schema: %v", err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrating: %v", err)
	}
	return pool
}

// AuthCookie bootstraps an admin user (if the instance has none yet) and
// logs in via the given service, returning a ready "session=<id>" Cookie
// header value — so HTTP-level tests can authenticate as an admin without
// going through the login endpoint themselves for every test (task 5.1,
// add-identity-basics).
func AuthCookie(t *testing.T, svc *service.Service) string {
	t.Helper()
	ctx := context.Background()
	const email, password = "test-admin@example.com", "correcthorse1"
	if err := svc.BootstrapAdmin(ctx, email, password); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	sess, _, err := svc.Login(ctx, email, password)
	if err != nil {
		t.Fatalf("login as bootstrap admin: %v", err)
	}
	return "session=" + sess.ID
}
