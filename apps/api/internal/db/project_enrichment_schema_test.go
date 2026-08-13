package db

import (
	"context"
	"testing"
)

// Schema integration tests for the project-enrichment migration
// (enrich-project-list): projects.description and the project_favorites
// table. The owner_id column that originally lived alongside description
// was removed by add-project-rbac (amended in place, pre-1.0 policy) —
// project access is now entirely membership-based, not a single nominal
// owner.

func TestProjectsGainDescriptionColumn(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := ApplySchema(context.Background(), pool); err != nil {
		t.Fatalf("ApplySchema: %v", err)
	}
	ctx := context.Background()

	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name, description) VALUES ('QA', 'QA', 'a project') RETURNING id`,
	).Scan(&projectID); err != nil {
		t.Fatalf("insert project with description: %v", err)
	}

	var description string
	if err := pool.QueryRow(ctx,
		`SELECT description FROM projects WHERE id = $1`, projectID,
	).Scan(&description); err != nil {
		t.Fatalf("select: %v", err)
	}
	if description != "a project" {
		t.Errorf("description = %q, want %q", description, "a project")
	}

	// description defaults to '' when omitted.
	var defaultID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('NM', 'No metadata') RETURNING id`,
	).Scan(&defaultID); err != nil {
		t.Fatalf("insert project without description: %v", err)
	}
	var defaultDescription string
	if err := pool.QueryRow(ctx,
		`SELECT description FROM projects WHERE id = $1`, defaultID,
	).Scan(&defaultDescription); err != nil {
		t.Fatal(err)
	}
	if defaultDescription != "" {
		t.Errorf("default description = %q, want empty", defaultDescription)
	}
}

func TestProjectFavoritesTableAndCascade(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := ApplySchema(context.Background(), pool); err != nil {
		t.Fatalf("ApplySchema: %v", err)
	}
	ctx := context.Background()

	var userID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ('fav@b.com', 'h') RETURNING id`,
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (key, name) VALUES ('QA', 'QA') RETURNING id`,
	).Scan(&projectID); err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO project_favorites (user_id, project_id) VALUES ($1, $2)`, userID, projectID); err != nil {
		t.Fatalf("insert favorite: %v", err)
	}

	// Same (user, project) pair twice must violate the composite PK.
	if _, err := pool.Exec(ctx,
		`INSERT INTO project_favorites (user_id, project_id) VALUES ($1, $2)`, userID, projectID); err == nil {
		t.Error("duplicate favorite accepted, want PK violation")
	}

	// Deleting the user cascades to their favorites. (The project side of
	// the same ON DELETE CASCADE can't be exercised the same way: every
	// project always owns a root folder via the projects_create_defaults
	// trigger, and test_case_folders.project_id has no cascade of its own,
	// so no project row is ever deletable in this schema — that's a
	// pre-existing constraint unrelated to this feature.)
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	var count int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM project_favorites WHERE project_id = $1`, projectID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("favorite survived user deletion, want cascade delete")
	}

	// Verify the project-side FK is also ON DELETE CASCADE at the schema
	// level, since it can't be exercised via an actual row delete here.
	var deleteRule string
	if err := pool.QueryRow(ctx,
		`SELECT rc.delete_rule
		 FROM information_schema.referential_constraints rc
		 JOIN information_schema.key_column_usage kcu
		   ON kcu.constraint_name = rc.constraint_name
		 WHERE kcu.table_name = 'project_favorites' AND kcu.column_name = 'project_id'`,
	).Scan(&deleteRule); err != nil {
		t.Fatalf("querying project_id FK delete rule: %v", err)
	}
	if deleteRule != "CASCADE" {
		t.Errorf("project_favorites.project_id delete_rule = %q, want CASCADE", deleteRule)
	}
}
