package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// testServiceWithOIDC arranges admin-claim-values directly via the store
// (bypassing UpdateInstanceSettings's encryption-key requirement — these
// tests only care about OIDCLogin's account-matching/claim-mapping logic,
// which sso_oidc_settings_test.go covers separately).
func testServiceWithOIDC(t *testing.T, adminClaimValues []string) *service.Service {
	t.Helper()
	st := store.New(testutil.Pool(t, "identity_service"))
	if adminClaimValues != nil {
		if _, err := st.InstanceSettings.Update(context.Background(), domain.InstanceSettingsUpdate{
			OIDCAdminClaimValues: &adminClaimValues,
		}); err != nil {
			t.Fatalf("arranging admin claim values: %v", err)
		}
	}
	return service.New(st)
}

func TestOIDCLoginProvisionsNewAccountForUnknownEmail(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()

	_, user, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-1", Email: "new-sso@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if user.Email != "new-sso@example.com" {
		t.Errorf("Email = %q, want new-sso@example.com", user.Email)
	}
}

func TestOIDCLoginMatchesReturningUserBySubject(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()

	_, first, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-2", Email: "changed-since@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("first OIDCLogin: %v", err)
	}

	// Email changed at the IdP since the first login; subject is stable.
	_, second, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-2", Email: "new-address@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("second OIDCLogin: %v", err)
	}
	if second.ID != first.ID {
		t.Errorf("second.ID = %q, want %q (same account, matched by subject)", second.ID, first.ID)
	}
}

func TestOIDCLoginLinksExistingAccountByVerifiedEmail(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()
	existing := mustCreateUser(t, s, "local@example.com", "correcthorsebatterystaple1", false)

	_, user, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-3", Email: "local@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if user.ID != existing.ID {
		t.Errorf("user.ID = %q, want %q (linked to existing account)", user.ID, existing.ID)
	}
}

func TestOIDCLoginRejectsUnverifiedEmailColludingWithExistingAccount(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()
	mustCreateUser(t, s, "local2@example.com", "correcthorsebatterystaple1", false)

	_, _, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-4", Email: "local2@example.com", EmailVerified: false,
	})
	if err == nil {
		t.Fatal("expected an error rejecting the login, got nil")
	}
}

func TestOIDCLoginRejectsUnverifiedEmailWithNoCollision(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()

	_, _, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-4b", Email: "brand-new-unverified@example.com", EmailVerified: false,
	})
	if err == nil {
		t.Fatal("expected an error rejecting the login, got nil")
	}
}

func TestOIDCLoginRefusesToRebindAlreadyLinkedAccount(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()
	mustCreateUser(t, s, "rebind-target@example.com", "correcthorsebatterystaple1", false)

	_, first, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-legit", Email: "rebind-target@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("first OIDCLogin: %v", err)
	}

	if _, _, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-attacker", Email: "rebind-target@example.com", EmailVerified: true,
	}); err == nil {
		t.Fatal("expected an error rejecting the rebind attempt, got nil")
	}

	// The account must remain reachable via its original, legitimate
	// subject — a rejected rebind attempt must not have disturbed it.
	_, second, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-legit", Email: "rebind-target@example.com", EmailVerified: true,
	})
	if err != nil {
		t.Fatalf("OIDCLogin with original subject after rejected rebind: %v", err)
	}
	if second.ID != first.ID {
		t.Errorf("second.ID = %q, want %q (original account unchanged)", second.ID, first.ID)
	}
}

func TestOIDCLoginGrantsTenantAdminOnMatchingClaim(t *testing.T) {
	s := testServiceWithOIDC(t, []string{"admins", "platform-team"})
	ctx := context.Background()

	_, user, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-5", Email: "admin-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers", "admins"},
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if !user.IsTenantAdmin {
		t.Error("IsTenantAdmin = false, want true (claim matched)")
	}
}

func TestOIDCLoginDoesNotGrantTenantAdminOnNonMatchingClaim(t *testing.T) {
	s := testServiceWithOIDC(t, []string{"admins"})
	ctx := context.Background()

	_, user, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-6", Email: "non-admin-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers"},
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if user.IsTenantAdmin {
		t.Error("IsTenantAdmin = true, want false (claim did not match)")
	}
}

func TestOIDCLoginDemotesWhenClaimNoLongerMatches(t *testing.T) {
	s := testServiceWithOIDC(t, []string{"admins"})
	ctx := context.Background()

	_, first, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-7", Email: "was-admin@example.com", EmailVerified: true,
		GroupClaimValues: []string{"admins"},
	})
	if err != nil {
		t.Fatalf("first OIDCLogin: %v", err)
	}
	if !first.IsTenantAdmin {
		t.Fatal("first.IsTenantAdmin = false, want true")
	}

	_, second, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-7", Email: "was-admin@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers"},
	})
	if err != nil {
		t.Fatalf("second OIDCLogin: %v", err)
	}
	if second.IsTenantAdmin {
		t.Error("second.IsTenantAdmin = true, want false (claim no longer matches)")
	}
}

func TestOIDCLoginWithoutAdminClaimConfiguredLeavesAdminStatusUnaffected(t *testing.T) {
	s := testServiceWithOIDC(t, nil)
	ctx := context.Background()

	_, user, err := s.OIDCLogin(ctx, service.OIDCClaims{
		Subject: "subject-8", Email: "no-claim-configured@example.com", EmailVerified: true,
		GroupClaimValues: []string{"admins"},
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if user.IsTenantAdmin {
		t.Error("IsTenantAdmin = true, want false (no admin claim configured, so no mapping applies)")
	}
}

func isTeamMember(t *testing.T, st *store.Store, teamID, userID string) bool {
	t.Helper()
	team, err := st.Teams.Get(context.Background(), teamID)
	if err != nil {
		t.Fatalf("Teams.Get: %v", err)
	}
	for _, id := range team.MemberIDs {
		if id == userID {
			return true
		}
	}
	return false
}

func TestOIDCLoginAddsMatchingClaimValueToMappedTeam(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	s := service.New(st)
	team, err := st.Teams.Create(context.Background(), "Platform")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	if _, err := st.OIDCTeamMappings.Create(context.Background(), "engineers", team.ID); err != nil {
		t.Fatalf("OIDCTeamMappings.Create: %v", err)
	}

	_, user, err := s.OIDCLogin(context.Background(), service.OIDCClaims{
		Subject: "subject-9", Email: "team-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers"},
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if !isTeamMember(t, st, team.ID, user.ID) {
		t.Error("user was not added to the mapped Team")
	}
}

func TestOIDCLoginAlreadyMemberIsNoOp(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	s := service.New(st)
	team, err := st.Teams.Create(context.Background(), "Platform")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	if _, err := st.OIDCTeamMappings.Create(context.Background(), "engineers", team.ID); err != nil {
		t.Fatalf("OIDCTeamMappings.Create: %v", err)
	}

	claims := service.OIDCClaims{
		Subject: "subject-10", Email: "team-repeat-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers"},
	}
	if _, _, err := s.OIDCLogin(context.Background(), claims); err != nil {
		t.Fatalf("first OIDCLogin: %v", err)
	}
	if _, _, err := s.OIDCLogin(context.Background(), claims); err != nil {
		t.Fatalf("second OIDCLogin: %v", err)
	}
}

func TestOIDCLoginNonMatchingClaimDoesNotAddTeamMembership(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	s := service.New(st)
	team, err := st.Teams.Create(context.Background(), "Platform")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	if _, err := st.OIDCTeamMappings.Create(context.Background(), "engineers", team.ID); err != nil {
		t.Fatalf("OIDCTeamMappings.Create: %v", err)
	}

	_, user, err := s.OIDCLogin(context.Background(), service.OIDCClaims{
		Subject: "subject-11", Email: "no-match-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"sales"},
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if isTeamMember(t, st, team.ID, user.ID) {
		t.Error("user should not be a member of a Team whose mapping did not match")
	}
}

func TestOIDCLoginLosingClaimDoesNotRemoveTeamMembership(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	s := service.New(st)
	team, err := st.Teams.Create(context.Background(), "Platform")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	if _, err := st.OIDCTeamMappings.Create(context.Background(), "engineers", team.ID); err != nil {
		t.Fatalf("OIDCTeamMappings.Create: %v", err)
	}

	_, user, err := s.OIDCLogin(context.Background(), service.OIDCClaims{
		Subject: "subject-12", Email: "losing-claim-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers"},
	})
	if err != nil {
		t.Fatalf("first OIDCLogin: %v", err)
	}
	if !isTeamMember(t, st, team.ID, user.ID) {
		t.Fatal("expected user to be added to the mapped Team on first login")
	}

	if _, _, err := s.OIDCLogin(context.Background(), service.OIDCClaims{
		Subject: "subject-12", Email: "losing-claim-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"sales"},
	}); err != nil {
		t.Fatalf("second OIDCLogin: %v", err)
	}
	if !isTeamMember(t, st, team.ID, user.ID) {
		t.Error("losing the claim value must not remove existing Team membership (additive-only, design.md D10)")
	}
}

func TestOIDCLoginMultipleMatchingClaimsAddMultipleTeams(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	s := service.New(st)
	teamA, err := st.Teams.Create(context.Background(), "Platform")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	teamB, err := st.Teams.Create(context.Background(), "QA")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	if _, err := st.OIDCTeamMappings.Create(context.Background(), "engineers", teamA.ID); err != nil {
		t.Fatalf("OIDCTeamMappings.Create: %v", err)
	}
	if _, err := st.OIDCTeamMappings.Create(context.Background(), "qa-team", teamB.ID); err != nil {
		t.Fatalf("OIDCTeamMappings.Create: %v", err)
	}

	_, user, err := s.OIDCLogin(context.Background(), service.OIDCClaims{
		Subject: "subject-13", Email: "multi-team-sso@example.com", EmailVerified: true,
		GroupClaimValues: []string{"engineers", "qa-team"},
	})
	if err != nil {
		t.Fatalf("OIDCLogin: %v", err)
	}
	if !isTeamMember(t, st, teamA.ID, user.ID) || !isTeamMember(t, st, teamB.ID, user.ID) {
		t.Error("expected user to be added to both mapped Teams")
	}
}
