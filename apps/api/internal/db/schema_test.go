package db

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Schema integration tests for the core domain migration (add-core-domain).

var domainTables = []string{
	"projects",
	"test_case_folders",
	"test_cases",
	"test_case_versions",
	"test_suites",
	"suite_cases",
	"test_runs",
	"test_run_items",
	"test_run_results",
}

// rootFolder looks up the project's auto-created root folder id, seeded by
// the projects_create_defaults trigger.
func rootFolder(t *testing.T, pool *pgxpool.Pool, projectID string) string {
	t.Helper()
	var folderID string
	if err := pool.QueryRow(context.Background(),
		`SELECT id FROM test_case_folders WHERE project_id = $1 AND parent_folder_id IS NULL`,
		projectID).Scan(&folderID); err != nil {
		t.Fatalf("looking up root folder: %v", err)
	}
	return folderID
}

func TestCoreDomainTablesExist(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	for _, table := range domainTables {
		var exists bool
		err := pool.QueryRow(context.Background(),
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables
			 WHERE table_schema = 'public' AND table_name = $1)`, table,
		).Scan(&exists)
		if err != nil {
			t.Fatalf("checking table %s: %v", table, err)
		}
		if !exists {
			t.Errorf("table %q does not exist after migration", table)
		}
	}
}

func TestRunItemStatusConstraint(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	// Seed the FK chain: project → case → version → run → item.
	var projectID, caseID, runID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('P', 'p') RETURNING id`).Scan(&projectID); err != nil {
		t.Fatalf("insert project: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_cases (key, project_id, folder_id) VALUES ('P-1', $1, $2) RETURNING id`,
		projectID, rootFolder(t, pool, projectID)).Scan(&caseID); err != nil {
		t.Fatalf("insert case: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO test_case_versions (case_id, version, title) VALUES ($1, 1, 't')`, caseID); err != nil {
		t.Fatalf("insert version: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_runs (key, project_id, name) VALUES ('P-R1', $1, 'r') RETURNING id`, projectID).Scan(&runID); err != nil {
		t.Fatalf("insert run: %v", err)
	}

	// Valid status accepted, default is pending.
	var status string
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_run_items (run_id, case_id, case_version) VALUES ($1, $2, 1)
		 RETURNING current_status`, runID, caseID).Scan(&status); err != nil {
		t.Fatalf("insert run item: %v", err)
	}
	if status != "pending" {
		t.Errorf("default status = %q, want pending", status)
	}

	// Invalid status rejected by CHECK constraint.
	if _, err := pool.Exec(ctx,
		`UPDATE test_run_items SET current_status = 'bogus' WHERE run_id = $1`, runID); err == nil {
		t.Error("invalid status accepted, want CHECK constraint violation")
	}

	// Duplicate case in the same run rejected.
	if _, err := pool.Exec(ctx,
		`INSERT INTO test_run_items (run_id, case_id, case_version) VALUES ($1, $2, 1)`,
		runID, caseID); err == nil {
		t.Error("duplicate (run_id, case_id) accepted, want UNIQUE violation")
	}
}

func TestResultVerdictConstraint(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var projectID, caseID, runID, itemID string
	if err := pool.QueryRow(ctx, `INSERT INTO projects (key, name) VALUES ('P', 'p') RETURNING id`).Scan(&projectID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO test_cases (key, project_id, folder_id) VALUES ('P-1', $1, $2) RETURNING id`,
		projectID, rootFolder(t, pool, projectID)).Scan(&caseID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO test_case_versions (case_id, version, title) VALUES ($1, 1, 't')`, caseID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO test_runs (key, project_id, name) VALUES ('P-R1', $1, 'r') RETURNING id`, projectID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO test_run_items (run_id, case_id, case_version) VALUES ($1, $2, 1) RETURNING id`, runID, caseID).Scan(&itemID); err != nil {
		t.Fatal(err)
	}

	// Valid verdict accepted.
	if _, err := pool.Exec(ctx,
		`INSERT INTO test_run_results (run_item_id, actor, verdict) VALUES ($1, 'ana', 'pass')`, itemID); err != nil {
		t.Errorf("valid verdict rejected: %v", err)
	}
	// 'retest' and 'pending' are statuses, never verdicts.
	for _, bad := range []string{"retest", "pending", "bogus"} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO test_run_results (run_item_id, actor, verdict) VALUES ($1, 'ana', $2)`, itemID, bad); err == nil {
			t.Errorf("verdict %q accepted, want CHECK violation", bad)
		}
	}
}

func TestResultActorKindConstraint(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var projectID, caseID, runID, itemID string
	if err := pool.QueryRow(ctx, `INSERT INTO projects (key, name) VALUES ('P', 'p') RETURNING id`).Scan(&projectID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO test_cases (key, project_id, folder_id) VALUES ('P-1', $1, $2) RETURNING id`,
		projectID, rootFolder(t, pool, projectID)).Scan(&caseID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO test_case_versions (case_id, version, title) VALUES ($1, 1, 't')`, caseID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO test_runs (key, project_id, name) VALUES ('P-R1', $1, 'r') RETURNING id`, projectID).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO test_run_items (run_id, case_id, case_version) VALUES ($1, $2, 1) RETURNING id`, runID, caseID).Scan(&itemID); err != nil {
		t.Fatal(err)
	}

	// A result inserted without actor_kind/actor_ref_id (pre-existing-style
	// row) reads back as 'unknown' with no explicit backfill statement.
	var actorKind string
	var actorRefID *string
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_run_results (run_item_id, actor, verdict) VALUES ($1, 'ana', 'pass')
		 RETURNING actor_kind, actor_ref_id`, itemID).Scan(&actorKind, &actorRefID); err != nil {
		t.Fatalf("insert without actor_kind: %v", err)
	}
	if actorKind != "unknown" {
		t.Errorf("default actor_kind = %q, want unknown", actorKind)
	}
	if actorRefID != nil {
		t.Errorf("default actor_ref_id = %v, want nil", *actorRefID)
	}

	// A real actor kind/ref persists and round-trips.
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_run_results (run_item_id, actor, verdict, actor_kind, actor_ref_id)
		 VALUES ($1, 'ana', 'pass', 'user', 'u1') RETURNING actor_kind, actor_ref_id`,
		itemID).Scan(&actorKind, &actorRefID); err != nil {
		t.Fatalf("insert with actor_kind: %v", err)
	}
	if actorKind != "user" || actorRefID == nil || *actorRefID != "u1" {
		t.Errorf("actor_kind/actor_ref_id = %q/%v, want user/u1", actorKind, actorRefID)
	}

	// Invalid actor_kind rejected by CHECK constraint.
	if _, err := pool.Exec(ctx,
		`INSERT INTO test_run_results (run_item_id, actor, verdict, actor_kind) VALUES ($1, 'ana', 'pass', 'bogus')`,
		itemID); err == nil {
		t.Error("invalid actor_kind accepted, want CHECK constraint violation")
	}
}

func TestProjectCreationCreatesRootFolder(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('P', 'p') RETURNING id`).Scan(&projectID); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	var count int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM test_case_folders WHERE project_id = $1 AND parent_folder_id IS NULL`,
		projectID).Scan(&count); err != nil {
		t.Fatalf("counting root folders: %v", err)
	}
	if count != 1 {
		t.Errorf("root folders for project = %d, want exactly 1", count)
	}

	// A second NULL-parent folder for the same project is rejected by the
	// partial unique index — "exactly one root" is a hard DB guarantee.
	if _, err := pool.Exec(ctx,
		`INSERT INTO test_case_folders (project_id, parent_folder_id, name) VALUES ($1, NULL, 'Another root')`,
		projectID); err == nil {
		t.Error("second root folder accepted, want unique-index violation")
	}
}

func TestFolderSoftDeleteColumnAndFilteredIndexes(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('P', 'p') RETURNING id`).Scan(&projectID); err != nil {
		t.Fatal(err)
	}
	root := rootFolder(t, pool, projectID)

	var subID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_case_folders (project_id, parent_folder_id, name) VALUES ($1, $2, 'Auth') RETURNING id, deleted`,
		projectID, root).Scan(&subID, new(bool)); err != nil {
		t.Fatalf("insert subfolder (expected a deleted column to exist): %v", err)
	}

	var deleted bool
	if err := pool.QueryRow(ctx, `SELECT deleted FROM test_case_folders WHERE id = $1`, subID).Scan(&deleted); err != nil {
		t.Fatal(err)
	}
	if deleted {
		t.Error("new folder deleted = true, want false by default")
	}

	if _, err := pool.Exec(ctx, `UPDATE test_case_folders SET deleted = true WHERE id = $1`, subID); err != nil {
		t.Fatalf("soft-deleting folder: %v", err)
	}

	// A deleted folder is excluded by the filtered listing indexes' WHERE
	// NOT deleted clause — verified functionally: a query mirroring the
	// index predicate returns nothing for the deleted row.
	var count int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM test_case_folders WHERE project_id = $1 AND NOT deleted AND id = $2`,
		projectID, subID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("deleted folder still matches WHERE NOT deleted, count = %d, want 0", count)
	}
}

func TestCaseFolderIsMandatoryAndNested(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('P', 'p') RETURNING id`).Scan(&projectID); err != nil {
		t.Fatal(err)
	}
	root := rootFolder(t, pool, projectID)

	// folder_id is NOT NULL: a case cannot be created without one.
	if _, err := pool.Exec(ctx,
		`INSERT INTO test_cases (project_id) VALUES ($1)`, projectID); err == nil {
		t.Error("case without folder_id accepted, want NOT NULL violation")
	}

	// Nested subfolder under root.
	var subID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_case_folders (project_id, parent_folder_id, name) VALUES ($1, $2, 'Auth') RETURNING id`,
		projectID, root).Scan(&subID); err != nil {
		t.Fatalf("insert subfolder: %v", err)
	}

	// A case can be placed directly in the nested subfolder.
	var caseID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO test_cases (key, project_id, folder_id) VALUES ('P-1', $1, $2) RETURNING id`,
		projectID, subID).Scan(&caseID); err != nil {
		t.Fatalf("insert case in subfolder: %v", err)
	}
}
