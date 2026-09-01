package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// Authorize and AccessibleProject(ID)s back the MCP tool layer's
// authorization (add-mcp-server design.md) — the equivalent of REST's
// requirePermission middleware for a protocol that handles every operation
// through one JSON-RPC endpoint instead of per-resource routes.

func TestAuthorizeTenantAdminBypasses(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin-authz@example.com", "correcthorse", true))
	ctx := domain.WithActor(context.Background(), admin)

	if err := s.Authorize(ctx, domain.PermManageProject, "nonexistent-project-id"); err != nil {
		t.Errorf("Authorize for tenant admin = %v, want nil (bypass)", err)
	}
}

func TestAuthorizeRequiresActorInContext(t *testing.T) {
	s := testService(t)
	if err := s.Authorize(context.Background(), domain.PermRead, "p1"); err == nil {
		t.Error("Authorize with no Actor in context = nil, want unauthorized error")
	}
}

func setUpScopedActor(t *testing.T, s *service.Service) (project, otherProject domain.Project, scopedActor domain.Actor) {
	t.Helper()
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-authz-scope@example.com", "correcthorse", true))
	owner := actorFor(mustCreateUser(t, s, "owner-authz-scope@example.com", "correcthorse", false))

	var err error
	project, err = s.CreateProject(ctx, service.ProjectInput{Name: "Scoped Authorize Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	otherProject, err = s.CreateProject(ctx, service.ProjectInput{Name: "Other Authorize Project"})
	if err != nil {
		t.Fatalf("CreateProject (other): %v", err)
	}

	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Authorize Scope Role", CanRead: true, CanCaseCreate: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, owner.EffectiveUserID, role.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}

	full, _, err := s.CreateToken(ctx, owner, "scoped-authz-agent", &project.ID, &role.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	scopedActor, err = s.AuthenticateToken(ctx, full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	return project, otherProject, scopedActor
}

func TestAuthorizeScopedTokenLimitedToItsProjectAndGrantedPerms(t *testing.T) {
	s := testService(t)
	project, otherProject, scopedActor := setUpScopedActor(t, s)
	authCtx := domain.WithActor(context.Background(), scopedActor)

	if err := s.Authorize(authCtx, domain.PermCaseCreate, project.ID); err != nil {
		t.Errorf("Authorize within scoped project for a granted perm = %v, want nil", err)
	}

	var ferr *service.ForbiddenError
	if err := s.Authorize(authCtx, domain.PermCaseCreate, otherProject.ID); !errors.As(err, &ferr) {
		t.Errorf("Authorize for a project outside the token's scope = %v, want ForbiddenError", err)
	}
	if err := s.Authorize(authCtx, domain.PermManageProject, project.ID); !errors.As(err, &ferr) {
		t.Errorf("Authorize for a perm the scoped role lacks = %v, want ForbiddenError", err)
	}
}

func TestAccessibleProjectsScopedTokenSeesOnlyItsProject(t *testing.T) {
	s := testService(t)
	project, otherProject, scopedActor := setUpScopedActor(t, s)
	authCtx := domain.WithActor(context.Background(), scopedActor)

	projects, err := s.AccessibleProjects(authCtx)
	if err != nil {
		t.Fatalf("AccessibleProjects: %v", err)
	}
	if len(projects) != 1 || projects[0].ID != project.ID {
		t.Fatalf("AccessibleProjects = %+v, want exactly [%s] (never the wider %s)", projects, project.ID, otherProject.ID)
	}

	ids, err := s.AccessibleProjectIDs(authCtx)
	if err != nil {
		t.Fatalf("AccessibleProjectIDs: %v", err)
	}
	if len(ids) != 1 || ids[0] != project.ID {
		t.Fatalf("AccessibleProjectIDs = %v, want [%s]", ids, project.ID)
	}
}

func TestAccessibleProjectsTenantAdminSeesEverything(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-authz-all@example.com", "correcthorse", true))
	authCtx := domain.WithActor(ctx, admin)

	if _, err := s.CreateProject(ctx, service.ProjectInput{Name: "Admin Visible Project A"}); err != nil {
		t.Fatalf("CreateProject A: %v", err)
	}
	if _, err := s.CreateProject(ctx, service.ProjectInput{Name: "Admin Visible Project B"}); err != nil {
		t.Fatalf("CreateProject B: %v", err)
	}

	projects, err := s.AccessibleProjects(authCtx)
	if err != nil {
		t.Fatalf("AccessibleProjects: %v", err)
	}
	if len(projects) < 2 {
		t.Fatalf("AccessibleProjects = %+v, want at least the 2 just created", projects)
	}
}
