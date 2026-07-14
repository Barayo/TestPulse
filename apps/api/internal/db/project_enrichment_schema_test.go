package db

import (
	"context"
	"testing"
)

// Schema integration tests for the project-enrichment migration
// (enrich-project-list): projects.description/owner_id and the
// project_favorites table. Placed in 00003_identity.sql, not
// 00002_core_domain.sql, because owner_id references users — which 00002
// runs before by filename order.

func TestProjectsGainDescriptionAndOwnerColumns(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var userID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, role) VALUES ('owner@b.com', 'h', 'member') RETURNING id`,
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}

	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (name, description, owner_id) VALUES ('QA', 'a project', $1) RETURNING id`,
		userID,
	).Scan(&projectID); err != nil {
		t.Fatalf("insert project with description/owner: %v", err)
	}

	var description string
	var ownerID *string
	if err := pool.QueryRow(ctx,
		`SELECT description, owner_id FROM projects WHERE id = $1`, projectID,
	).Scan(&description, &ownerID); err != nil {
		t.Fatalf("select: %v", err)
	}
	if description != "a project" {
		t.Errorf("description = %q, want %q", description, "a project")
	}
	if ownerID == nil || *ownerID != userID {
		t.Errorf("owner_id = %v, want %q", ownerID, userID)
	}

	// description defaults to '' when omitted.
	var defaultID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (name) VALUES ('No metadata') RETURNING id`,
	).Scan(&defaultID); err != nil {
		t.Fatalf("insert project without description/owner: %v", err)
	}
	var defaultDescription string
	var defaultOwner *string
	if err := pool.QueryRow(ctx,
		`SELECT description, owner_id FROM projects WHERE id = $1`, defaultID,
	).Scan(&defaultDescription, &defaultOwner); err != nil {
		t.Fatal(err)
	}
	if defaultDescription != "" {
		t.Errorf("default description = %q, want empty", defaultDescription)
	}
	if defaultOwner != nil {
		t.Errorf("default owner_id = %v, want nil", defaultOwner)
	}

	// Deactivating (not deleting) the owner must not affect the FK.
	if _, err := pool.Exec(ctx, `UPDATE users SET deactivated_at = now() WHERE id = $1`, userID); err != nil {
		t.Fatalf("deactivate owner: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT owner_id FROM projects WHERE id = $1`, projectID,
	).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if ownerID == nil || *ownerID != userID {
		t.Errorf("owner_id after deactivation = %v, want %q still set", ownerID, userID)
	}

	// Deleting the owner sets owner_id to NULL rather than failing (D4).
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		t.Fatalf("delete owner: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT owner_id FROM projects WHERE id = $1`, projectID,
	).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if ownerID != nil {
		t.Errorf("owner_id after owner deletion = %v, want nil", ownerID)
	}
}

func TestProjectFavoritesTableAndCascade(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var userID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, role) VALUES ('fav@b.com', 'h', 'member') RETURNING id`,
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	var projectID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO projects (name) VALUES ('QA') RETURNING id`,
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
	// project always owns a root folder via the projects_create_root_folder
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
