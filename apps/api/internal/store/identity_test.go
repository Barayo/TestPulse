package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func mustUser(t *testing.T, s *store.Store, email string, isTenantAdmin bool) domain.User {
	t.Helper()
	u, err := s.Users.Create(context.Background(), email, "bcrypt-hash", isTenantAdmin)
	if err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}
	return u
}

// --- Users (task 2.1) ---

func TestUserCreateAndGetByEmailWithHash(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	created := mustUser(t, s, "admin@example.com", true)
	if !created.IsTenantAdmin {
		t.Errorf("IsTenantAdmin = %v, want true", created.IsTenantAdmin)
	}

	got, hash, err := s.Users.GetByEmailWithHash(ctx, "admin@example.com")
	if err != nil {
		t.Fatalf("GetByEmailWithHash: %v", err)
	}
	if got.ID != created.ID || hash != "bcrypt-hash" {
		t.Errorf("got = %+v, hash = %q", got, hash)
	}
}

func TestUserGetByID(t *testing.T) {
	s := testStore(t)
	created := mustUser(t, s, "byid@example.com", false)

	got, err := s.Users.Get(context.Background(), created.ID)
	if err != nil || got.Email != "byid@example.com" {
		t.Fatalf("Get = %+v, %v", got, err)
	}
	if _, err := s.Users.Get(context.Background(), "00000000-0000-0000-0000-000000000000"); err != store.ErrNotFound {
		t.Errorf("Get unknown id = %v, want ErrNotFound", err)
	}
}

func TestUserGetByEmailNotFound(t *testing.T) {
	s := testStore(t)
	if _, _, err := s.Users.GetByEmailWithHash(context.Background(), "nobody@example.com"); err != store.ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestUserListAndSetTenantAdminAndDeactivate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "member@example.com", false)

	list, err := s.Users.List(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("List = %d, %v; want 1", len(list), err)
	}

	if err := s.Users.SetTenantAdmin(ctx, u.ID, true); err != nil {
		t.Fatalf("SetTenantAdmin: %v", err)
	}
	if err := s.Users.Deactivate(ctx, u.ID); err != nil {
		t.Fatalf("Deactivate: %v", err)
	}

	list, _ = s.Users.List(ctx)
	if !list[0].IsTenantAdmin {
		t.Errorf("IsTenantAdmin after update = %v, want true", list[0].IsTenantAdmin)
	}
	if list[0].DeactivatedAt == nil {
		t.Error("DeactivatedAt = nil, want set after Deactivate")
	}
}

func TestUserUpdateProfile(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "profile@example.com", false)

	if u.DisplayName != nil || u.AvatarKey != nil || u.Timezone != nil {
		t.Fatalf("new user profile fields = %+v, want all nil", u)
	}

	displayName := "Ada"
	avatarKey := "ada-lovelace"
	timezone := "Europe/Madrid"
	updated, err := s.Users.UpdateProfile(ctx, u.ID, domain.UserProfileUpdate{
		DisplayName: &displayName,
		AvatarKey:   &avatarKey,
		Timezone:    &timezone,
	})
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if updated.DisplayName == nil || *updated.DisplayName != displayName {
		t.Errorf("DisplayName = %v, want %q", updated.DisplayName, displayName)
	}
	if updated.AvatarKey == nil || *updated.AvatarKey != avatarKey {
		t.Errorf("AvatarKey = %v, want %q", updated.AvatarKey, avatarKey)
	}
	if updated.Timezone == nil || *updated.Timezone != timezone {
		t.Errorf("Timezone = %v, want %q", updated.Timezone, timezone)
	}

	got, err := s.Users.Get(ctx, u.ID)
	if err != nil {
		t.Fatalf("Get after update: %v", err)
	}
	if got.DisplayName == nil || *got.DisplayName != displayName {
		t.Errorf("Get().DisplayName = %v, want %q (round-trip)", got.DisplayName, displayName)
	}
}

func TestUserUpdateProfileUnknownIDNotFound(t *testing.T) {
	s := testStore(t)
	name := "Nobody"
	_, err := s.Users.UpdateProfile(context.Background(), "00000000-0000-0000-0000-000000000000", domain.UserProfileUpdate{
		DisplayName: &name,
	})
	if err != store.ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestUserReactivate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "reactivate@example.com", false)

	if err := s.Users.Deactivate(ctx, u.ID); err != nil {
		t.Fatalf("Deactivate: %v", err)
	}
	if err := s.Users.Reactivate(ctx, u.ID); err != nil {
		t.Fatalf("Reactivate: %v", err)
	}

	got, err := s.Users.Get(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.DeactivatedAt != nil {
		t.Errorf("DeactivatedAt after Reactivate = %v, want nil", got.DeactivatedAt)
	}
}

func TestUserCreateDuplicateEmailRejected(t *testing.T) {
	s := testStore(t)
	mustUser(t, s, "dup@example.com", false)
	if _, err := s.Users.Create(context.Background(), "dup@example.com", "hash", false); err == nil {
		t.Error("duplicate email accepted, want error")
	}
}

// --- Sessions (task 2.2) ---
//
// The store layer never hashes anything itself (backlog #116) — it treats
// whatever string it's given as an opaque key and stores/looks up exactly
// that. These literals ("sess-1", etc.) stand in for what would really be
// a SHA-256 hash computed by the service layer (hashToken); the store's
// own round-trip behavior is identical either way, which is what these
// tests actually verify.

func TestSessionCreateGetExtendDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "a@example.com", false)

	expires := time.Now().Add(30 * 24 * time.Hour)
	sess, err := s.Sessions.Create(ctx, "sess-1", u.ID, expires)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if sess.UserID != u.ID {
		t.Errorf("UserID = %q, want %q", sess.UserID, u.ID)
	}

	got, err := s.Sessions.Get(ctx, "sess-1")
	if err != nil || got.UserID != u.ID {
		t.Fatalf("Get = %+v, %v", got, err)
	}

	newExpiry := time.Now().Add(60 * 24 * time.Hour)
	if err := s.Sessions.Extend(ctx, "sess-1", newExpiry); err != nil {
		t.Fatalf("Extend: %v", err)
	}
	got, _ = s.Sessions.Get(ctx, "sess-1")
	if got.ExpiresAt.Before(expires.Add(20 * 24 * time.Hour)) {
		t.Errorf("ExpiresAt not extended: %v", got.ExpiresAt)
	}

	if err := s.Sessions.Delete(ctx, "sess-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Sessions.Get(ctx, "sess-1"); err != store.ErrNotFound {
		t.Errorf("Get after delete = %v, want ErrNotFound", err)
	}
}

func TestSessionExpiredIsNotFound(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "b@example.com", false)

	if _, err := s.Sessions.Create(ctx, "expired-sess", u.ID, time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := s.Sessions.Get(ctx, "expired-sess"); err != store.ErrNotFound {
		t.Errorf("Get expired session = %v, want ErrNotFound", err)
	}
}

func TestSessionDeleteExpiredCleansUpOnlyExpired(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "c@example.com", false)

	if _, err := s.Sessions.Create(ctx, "still-valid", u.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Sessions.Create(ctx, "long-expired", u.ID, time.Now().Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}

	countBefore, err := s.Sessions.CountAll(ctx)
	if err != nil || countBefore != 2 {
		t.Fatalf("CountAll before = %d, %v; want 2", countBefore, err)
	}

	if err := s.Sessions.DeleteExpired(ctx); err != nil {
		t.Fatalf("DeleteExpired: %v", err)
	}

	if _, err := s.Sessions.Get(ctx, "still-valid"); err != nil {
		t.Errorf("valid session removed by cleanup: %v", err)
	}
	countAfter, err := s.Sessions.CountAll(ctx)
	if err != nil || countAfter != 1 {
		t.Errorf("CountAll after DeleteExpired = %d, %v; want 1 (only the valid session's row)", countAfter, err)
	}
}

// --- API tokens (task 2.3) ---

func TestApiTokenCreateGetByHashAndRevoke(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "creator@example.com", false)

	tok, err := s.ApiTokens.Create(ctx, u.ID, "ci-agent", "hash-abc", "tp_ab")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if tok.CreatedBy != u.ID || tok.Prefix != "tp_ab" {
		t.Errorf("token = %+v", tok)
	}

	got, err := s.ApiTokens.GetByHash(ctx, "hash-abc")
	if err != nil || got.ID != tok.ID {
		t.Fatalf("GetByHash = %+v, %v", got, err)
	}

	if err := s.ApiTokens.Revoke(ctx, tok.ID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if _, err := s.ApiTokens.GetByHash(ctx, "hash-abc"); err != store.ErrNotFound {
		t.Errorf("GetByHash after revoke = %v, want ErrNotFound", err)
	}
}

func TestApiTokenListByCreator(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u1 := mustUser(t, s, "u1@example.com", false)
	u2 := mustUser(t, s, "u2@example.com", false)

	if _, err := s.ApiTokens.Create(ctx, u1.ID, "t1", "h1", "tp_1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApiTokens.Create(ctx, u2.ID, "t2", "h2", "tp_2"); err != nil {
		t.Fatal(err)
	}

	list, err := s.ApiTokens.ListByCreator(ctx, u1.ID)
	if err != nil || len(list) != 1 || list[0].Name != "t1" {
		t.Errorf("ListByCreator = %+v, %v; want [t1]", list, err)
	}
}

// --- Audit log (task 2.4) ---

func TestAuditAppendAndListByEntity(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "actor@example.com", false)

	entry := domain.AuditEntry{
		ActorKind:  domain.ActorKindUser,
		ActorID:    u.ID,
		ActorName:  u.Email,
		Action:     "create",
		EntityType: "project",
		EntityID:   "p1",
	}
	if err := s.Audit.Append(ctx, entry); err != nil {
		t.Fatalf("Append: %v", err)
	}
	entry.Action = "update"
	if err := s.Audit.Append(ctx, entry); err != nil {
		t.Fatalf("Append: %v", err)
	}

	list, err := s.Audit.ListByEntity(ctx, "project", "p1")
	if err != nil || len(list) != 2 {
		t.Fatalf("ListByEntity = %d, %v; want 2", len(list), err)
	}
	if list[0].Action != "create" || list[1].Action != "update" {
		t.Errorf("order wrong: %+v", list)
	}
}

func TestAuditEntrySurvivesActorDeletionAtStoreLevel(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "deleteme@example.com", false)

	if err := s.Audit.Append(ctx, domain.AuditEntry{
		ActorKind: domain.ActorKindUser, ActorID: u.ID, ActorName: u.Email,
		Action: "create", EntityType: "project", EntityID: "p2",
	}); err != nil {
		t.Fatal(err)
	}

	// audit_log has no FK to users — appending after the user no longer
	// exists must still work and preserve the denormalized name.
	list, err := s.Audit.ListByEntity(ctx, "project", "p2")
	if err != nil || len(list) != 1 || list[0].ActorName != "deleteme@example.com" {
		t.Errorf("list = %+v, %v", list, err)
	}
}
