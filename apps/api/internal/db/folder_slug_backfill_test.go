package db

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// freshDBAtVersion is Pool-shaped test setup (see internal/testutil), but
// migrates only up to a specific goose version — so a test can insert
// pre-migration data and then apply exactly one migration to exercise its
// own backfill logic, rather than starting from an already-fully-migrated,
// empty schema. Deliberately self-contained (not shared with testutil) to
// avoid this package's own tests importing a package that imports it back.
func freshDBAtVersion(t *testing.T, suffix string, version int64) *pgxpool.Pool {
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
	if err := MigrateTo(ctx, pool, version); err != nil {
		t.Fatalf("applying migrations up to %d: %v", version, err)
	}
	return pool
}

func mustInsertProject(t *testing.T, pool *pgxpool.Pool, key, name string) string {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO projects (key, name) VALUES ($1, $2) RETURNING id`, key, name,
	).Scan(&id)
	if err != nil {
		t.Fatalf("inserting project: %v", err)
	}
	return id
}

// TestFolderSlugBackfillDoesNotCollideAcrossProjects reproduces the
// scenario the migration's disambiguation must handle correctly: every
// project's root folder is created (by the create_project_defaults
// trigger) with the identical hardcoded name "Root" and
// parent_folder_id IS NULL. If the backfill's duplicate-detection grouped
// only by parent_folder_id (ignoring project_id), it would treat every
// project's root folder in the whole database as one giant duplicate
// group and rewrite most of them to "Root-2", "Root-3", etc.
func TestFolderSlugBackfillDoesNotCollideAcrossProjects(t *testing.T) {
	pool := freshDBAtVersion(t, "folder_slug_backfill_cross_project", 13)
	ctx := context.Background()

	p1 := mustInsertProject(t, pool, "P1", "Project One")
	p2 := mustInsertProject(t, pool, "P2", "Project Two")

	if err := MigrateTo(ctx, pool, 14); err != nil {
		t.Fatalf("applying migration 14: %v", err)
	}

	rows, err := pool.Query(ctx,
		`SELECT project_id, name, slug FROM test_case_folders WHERE parent_folder_id IS NULL ORDER BY project_id`)
	if err != nil {
		t.Fatalf("querying root folders: %v", err)
	}
	defer rows.Close()

	got := map[string]struct{ name, slug string }{}
	for rows.Next() {
		var projectID, name, slug string
		if err := rows.Scan(&projectID, &name, &slug); err != nil {
			t.Fatalf("scanning row: %v", err)
		}
		got[projectID] = struct{ name, slug string }{name, slug}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterating rows: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("got %d root folders, want 2 (one per project)", len(got))
	}
	for _, projectID := range []string{p1, p2} {
		row, ok := got[projectID]
		if !ok {
			t.Fatalf("no root folder found for project %s", projectID)
		}
		if row.name != "Root" {
			t.Errorf("project %s root folder name = %q, want unchanged %q — cross-project backfill collision", projectID, row.name, "Root")
		}
		if row.slug != "root" {
			t.Errorf("project %s root folder slug = %q, want unchanged %q — cross-project backfill collision", projectID, row.slug, "root")
		}
	}
}

// TestFolderSlugBackfillDisambiguatesRealDuplicateSiblings covers the
// actual disambiguation this migration exists to do: two folders that
// really are duplicate siblings (same project, same parent, same name)
// before this migration ever ran.
func TestFolderSlugBackfillDisambiguatesRealDuplicateSiblings(t *testing.T) {
	pool := freshDBAtVersion(t, "folder_slug_backfill_real_duplicates", 13)
	ctx := context.Background()

	projectID := mustInsertProject(t, pool, "P1", "Project One")
	var rootID string
	if err := pool.QueryRow(ctx,
		`SELECT id FROM test_case_folders WHERE project_id = $1 AND parent_folder_id IS NULL`, projectID,
	).Scan(&rootID); err != nil {
		t.Fatalf("finding root folder: %v", err)
	}

	var olderID, newerID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_case_folders (project_id, parent_folder_id, name, created_at)
		 VALUES ($1, $2, 'Auth', now() - interval '1 hour') RETURNING id`,
		projectID, rootID,
	).Scan(&olderID); err != nil {
		t.Fatalf("inserting older duplicate: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_case_folders (project_id, parent_folder_id, name, created_at)
		 VALUES ($1, $2, 'Auth', now()) RETURNING id`,
		projectID, rootID,
	).Scan(&newerID); err != nil {
		t.Fatalf("inserting newer duplicate: %v", err)
	}

	if err := MigrateTo(ctx, pool, 14); err != nil {
		t.Fatalf("applying migration 14: %v", err)
	}

	var olderName, olderSlug, newerName, newerSlug string
	if err := pool.QueryRow(ctx, `SELECT name, slug FROM test_case_folders WHERE id = $1`, olderID).
		Scan(&olderName, &olderSlug); err != nil {
		t.Fatalf("querying older folder: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT name, slug FROM test_case_folders WHERE id = $1`, newerID).
		Scan(&newerName, &newerSlug); err != nil {
		t.Fatalf("querying newer folder: %v", err)
	}

	if olderName != "Auth" || olderSlug != "auth" {
		t.Errorf("older (first-created) duplicate = (%q, %q), want unchanged (\"Auth\", \"auth\")", olderName, olderSlug)
	}
	if newerName != "Auth-2" || newerSlug != "auth-2" {
		t.Errorf("newer duplicate = (%q, %q), want disambiguated (\"Auth-2\", \"auth-2\")", newerName, newerSlug)
	}
}
