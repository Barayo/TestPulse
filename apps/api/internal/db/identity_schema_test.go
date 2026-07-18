package db

import (
	"context"
	"testing"
)

// Schema integration tests for the identity migration (add-identity-basics).

var identityTables = []string{
	"users",
	"sessions",
	"api_tokens",
	"audit_log",
}

func TestIdentityTablesExist(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	for _, table := range identityTables {
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

func TestUserIsTenantAdminDefaultsFalse(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var isTenantAdmin bool
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ('a@b.com', 'h') RETURNING is_tenant_admin`,
	).Scan(&isTenantAdmin); err != nil {
		t.Fatalf("insert without is_tenant_admin rejected: %v", err)
	}
	if isTenantAdmin {
		t.Error("is_tenant_admin default = true, want false")
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO users (email, password_hash, is_tenant_admin) VALUES ('a@b.com', 'h', true)`); err == nil {
		t.Error("duplicate email accepted, want UNIQUE violation")
	}
}

func TestApiTokenHashUniqueAndAuditActorKindConstraint(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var userID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ('a@b.com', 'h') RETURNING id`,
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO api_tokens (created_by, name, token_hash, token_prefix) VALUES ($1, 't1', 'hash1', 'tp_ab')`,
		userID); err != nil {
		t.Errorf("valid token rejected: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO api_tokens (created_by, name, token_hash, token_prefix) VALUES ($1, 't2', 'hash1', 'tp_cd')`,
		userID); err == nil {
		t.Error("duplicate token_hash accepted, want UNIQUE violation")
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO audit_log (actor_kind, actor_id, actor_name, action, entity_type, entity_id)
		 VALUES ('user', $1, 'a@b.com', 'create', 'project', 'p1')`, userID); err != nil {
		t.Errorf("valid audit entry rejected: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO audit_log (actor_kind, actor_id, actor_name, action, entity_type, entity_id)
		 VALUES ('bogus', $1, 'a@b.com', 'create', 'project', 'p1')`, userID); err == nil {
		t.Error("invalid actor_kind accepted, want CHECK violation")
	}
}

func TestAuditEntrySurvivesUserDeletion(t *testing.T) {
	pool := testPool(t)
	resetSchema(t, pool)
	if err := Migrate(context.Background(), pool); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	ctx := context.Background()

	var userID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ('a@b.com', 'h') RETURNING id`,
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO audit_log (actor_kind, actor_id, actor_name, action, entity_type, entity_id)
		 VALUES ('user', $1, 'a@b.com', 'create', 'project', 'p1')`, userID); err != nil {
		t.Fatal(err)
	}

	// audit_log has no FK to users, so deleting the user must not cascade
	// or fail — the entry (and its denormalized actor_name) must survive.
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		t.Fatalf("deleting user: %v", err)
	}

	var actorName string
	if err := pool.QueryRow(ctx,
		`SELECT actor_name FROM audit_log WHERE actor_id = $1`, userID).Scan(&actorName); err != nil {
		t.Fatalf("audit entry did not survive user deletion: %v", err)
	}
	if actorName != "a@b.com" {
		t.Errorf("actor_name = %q, want %q", actorName, "a@b.com")
	}
}
