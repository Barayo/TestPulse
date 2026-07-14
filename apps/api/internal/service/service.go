// Package service implements the application use cases over the store.
// REST handlers (and later the MCP server) are thin adapters over this
// package. Validation happens here, before any storage access.
package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// ValidationError marks input the caller can fix (HTTP 400).
type ValidationError struct{ msg string }

func (e *ValidationError) Error() string { return e.msg }

func invalid(format string, args ...any) error {
	return &ValidationError{msg: fmt.Sprintf(format, args...)}
}

// UnauthorizedError marks a failed or missing authentication (HTTP 401).
type UnauthorizedError struct{ msg string }

func (e *UnauthorizedError) Error() string { return e.msg }

func unauthorized(msg string) error { return &UnauthorizedError{msg: msg} }

// ForbiddenError marks an authenticated actor lacking permission for the
// requested action (HTTP 403).
type ForbiddenError struct{ msg string }

func (e *ForbiddenError) Error() string { return e.msg }

func forbidden(msg string) error { return &ForbiddenError{msg: msg} }

type Service struct {
	store *store.Store
}

func New(s *store.Store) *Service { return &Service{store: s} }

// --- Projects ---

// ProjectInput carries the fields needed to create a project. Description
// and OwnerID are optional (design D4/proposal); OwnerID, when set, must
// resolve to a real user.
type ProjectInput struct {
	Name        string
	Description string
	OwnerID     *string
}

func (s *Service) CreateProject(ctx context.Context, in ProjectInput) (domain.Project, error) {
	if err := domain.ValidateProjectName(in.Name); err != nil {
		return domain.Project{}, invalid("%s", err)
	}
	if err := s.validateOwnerID(ctx, in.OwnerID); err != nil {
		return domain.Project{}, err
	}
	p, err := s.store.Projects.Create(ctx, in.Name, in.Description, in.OwnerID)
	if err != nil {
		return domain.Project{}, err
	}
	s.audit(ctx, "create", "project", p.ID)
	return p, nil
}

func (s *Service) GetProject(ctx context.Context, id string) (domain.Project, error) {
	return s.store.Projects.Get(ctx, id)
}

func (s *Service) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return s.store.Projects.List(ctx)
}

// ProjectSummaries returns the current actor's view of every non-archived
// project, including which ones they've favorited (design D3).
func (s *Service) ProjectSummaries(ctx context.Context) ([]domain.ProjectSummary, error) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return nil, unauthorized("authentication required")
	}
	return s.store.Projects.Summaries(ctx, actor.ID)
}

// ProjectUpdate carries optional changes; nil fields are left untouched.
type ProjectUpdate struct {
	Name        *string
	Description *string
	OwnerID     *string
	Archived    *bool
}

func (s *Service) UpdateProject(ctx context.Context, id string, upd ProjectUpdate) (domain.Project, error) {
	if upd.Name == nil && upd.Description == nil && upd.OwnerID == nil && upd.Archived == nil {
		return domain.Project{}, invalid("nothing to update: provide name, description, ownerId, and/or archived")
	}
	if upd.Name != nil {
		if err := domain.ValidateProjectName(*upd.Name); err != nil {
			return domain.Project{}, invalid("%s", err)
		}
		if err := s.store.Projects.Rename(ctx, id, *upd.Name); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "rename", "project", id)
	}
	if upd.Description != nil {
		if err := s.store.Projects.SetDescription(ctx, id, *upd.Description); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "update_description", "project", id)
	}
	if upd.OwnerID != nil {
		if err := s.validateOwnerID(ctx, upd.OwnerID); err != nil {
			return domain.Project{}, err
		}
		if err := s.store.Projects.SetOwner(ctx, id, upd.OwnerID); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "update_owner", "project", id)
	}
	if upd.Archived != nil && *upd.Archived {
		if err := s.store.Projects.Archive(ctx, id); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "archive", "project", id)
	}
	return s.store.Projects.Get(ctx, id)
}

func (s *Service) validateOwnerID(ctx context.Context, ownerID *string) error {
	if ownerID == nil {
		return nil
	}
	if _, err := s.store.Users.Get(ctx, *ownerID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return invalid("ownerId does not reference an existing user")
		}
		return err
	}
	return nil
}

// StarProject and UnstarProject are only available to human users (design
// D2/project-favorites) — an agent actor's ID is its API token's id, not a
// row in users, so favoriting as an agent has no meaningful target.
func (s *Service) StarProject(ctx context.Context, projectID string) error {
	actor, err := s.userActor(ctx)
	if err != nil {
		return err
	}
	if _, err := s.store.Projects.Get(ctx, projectID); err != nil {
		return err
	}
	if err := s.store.Projects.Star(ctx, actor.ID, projectID); err != nil {
		return err
	}
	s.audit(ctx, "star", "project", projectID)
	return nil
}

func (s *Service) UnstarProject(ctx context.Context, projectID string) error {
	actor, err := s.userActor(ctx)
	if err != nil {
		return err
	}
	if err := s.store.Projects.Unstar(ctx, actor.ID, projectID); err != nil {
		return err
	}
	s.audit(ctx, "unstar", "project", projectID)
	return nil
}

func (s *Service) userActor(ctx context.Context) (domain.Actor, error) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return domain.Actor{}, unauthorized("authentication required")
	}
	if actor.Kind != domain.ActorKindUser {
		return domain.Actor{}, invalid("favorites are only available to user accounts, not agents")
	}
	return actor, nil
}

// --- Cases ---

// CreateCase creates a case; an empty folderID defaults to the project's
// root folder (design D8).
func (s *Service) CreateCase(ctx context.Context, projectID, folderID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	c, err := s.store.Cases.Create(ctx, projectID, folderID, content)
	if err != nil {
		return domain.TestCase{}, err
	}
	s.audit(ctx, "create", "case", c.ID)
	return c, nil
}

func (s *Service) MoveCase(ctx context.Context, caseID, folderID string) error {
	if folderID == "" {
		return invalid("folderId is required")
	}
	if err := s.store.Cases.Move(ctx, caseID, folderID); err != nil {
		return err
	}
	s.audit(ctx, "move", "case", caseID)
	return nil
}

func (s *Service) EditCase(ctx context.Context, caseID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	c, err := s.store.Cases.NewVersion(ctx, caseID, content)
	if err != nil {
		return domain.TestCase{}, err
	}
	s.audit(ctx, "edit", "case", caseID)
	return c, nil
}

func (s *Service) GetCase(ctx context.Context, caseID string) (domain.TestCase, error) {
	return s.store.Cases.Get(ctx, caseID)
}

func (s *Service) ListCases(ctx context.Context, projectID string) ([]domain.TestCase, error) {
	return s.store.Cases.List(ctx, projectID)
}

func (s *Service) CaseVersions(ctx context.Context, caseID string) ([]domain.CaseVersion, error) {
	return s.store.Cases.Versions(ctx, caseID)
}

func (s *Service) DeleteCase(ctx context.Context, caseID string) error {
	if err := s.store.Cases.SoftDelete(ctx, caseID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "case", caseID)
	return nil
}

// --- Folders ---

func (s *Service) CreateFolder(ctx context.Context, projectID string, in domain.NewFolder) (domain.Folder, error) {
	if err := in.Validate(); err != nil {
		return domain.Folder{}, invalid("%s", err)
	}
	f, err := s.store.Folders.Create(ctx, projectID, in.ParentFolderID, in.Name)
	if err != nil {
		return domain.Folder{}, err
	}
	s.audit(ctx, "create", "folder", f.ID)
	return f, nil
}

func (s *Service) ListFolders(ctx context.Context, projectID string) ([]domain.Folder, error) {
	return s.store.Folders.List(ctx, projectID)
}

func (s *Service) DeleteFolder(ctx context.Context, folderID string) error {
	if err := s.store.Folders.Delete(ctx, folderID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "folder", folderID)
	return nil
}

// --- Suites ---

func (s *Service) CreateSuite(ctx context.Context, projectID, name string) (domain.Suite, error) {
	if name == "" {
		return domain.Suite{}, invalid("name is required")
	}
	suite, err := s.store.Suites.Create(ctx, projectID, name)
	if err != nil {
		return domain.Suite{}, err
	}
	s.audit(ctx, "create", "suite", suite.ID)
	return suite, nil
}

func (s *Service) ListSuites(ctx context.Context, projectID string) ([]domain.Suite, error) {
	return s.store.Suites.List(ctx, projectID)
}

func (s *Service) AddCaseToSuite(ctx context.Context, suiteID, caseID string) error {
	if err := s.store.Suites.AddCase(ctx, suiteID, caseID); err != nil {
		return err
	}
	s.audit(ctx, "add_case", "suite", suiteID)
	return nil
}

func (s *Service) RemoveCaseFromSuite(ctx context.Context, suiteID, caseID string) error {
	if err := s.store.Suites.RemoveCase(ctx, suiteID, caseID); err != nil {
		return err
	}
	s.audit(ctx, "remove_case", "suite", suiteID)
	return nil
}

// --- Runs ---

// RunInput creates a run from a suite's cases and/or an explicit list.
type RunInput struct {
	Name    string
	SuiteID string
	CaseIDs []string
}

func (s *Service) CreateRun(ctx context.Context, projectID string, in RunInput) (domain.Run, error) {
	if in.Name == "" {
		return domain.Run{}, invalid("name is required")
	}
	caseIDs := in.CaseIDs
	if in.SuiteID != "" {
		suite, err := s.store.Suites.Get(ctx, in.SuiteID)
		if err != nil {
			return domain.Run{}, err
		}
		caseIDs = append(caseIDs, suite.CaseIDs...)
	}
	// Dedupe while preserving order.
	seen := map[string]bool{}
	unique := make([]string, 0, len(caseIDs))
	for _, id := range caseIDs {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	run, err := s.store.Runs.Create(ctx, projectID, in.Name, unique)
	if err != nil {
		return domain.Run{}, err
	}
	s.audit(ctx, "create", "run", run.ID)
	return run, nil
}

func (s *Service) GetRun(ctx context.Context, runID string) (domain.Run, error) {
	return s.store.Runs.Get(ctx, runID)
}

func (s *Service) ListRuns(ctx context.Context, projectID string) ([]domain.Run, error) {
	return s.store.Runs.List(ctx, projectID)
}

func (s *Service) AddRunItem(ctx context.Context, runID, caseID string) (string, error) {
	if caseID == "" {
		return "", invalid("caseId is required")
	}
	itemID, err := s.store.Runs.AddItem(ctx, runID, caseID)
	if err != nil {
		return "", err
	}
	s.audit(ctx, "add_item", "run", runID)
	return itemID, nil
}

func (s *Service) RunItems(ctx context.Context, runID, assignee string) ([]domain.RunItem, error) {
	return s.store.Runs.Items(ctx, runID, assignee)
}

func (s *Service) RecordResult(ctx context.Context, itemID string, res domain.NewResult) (domain.Result, error) {
	if err := res.Validate(); err != nil {
		return domain.Result{}, invalid("%s", err)
	}
	result, err := s.store.Runs.AppendResult(ctx, itemID, res)
	if err != nil {
		return domain.Result{}, err
	}
	s.audit(ctx, "record_result", "run_item", itemID)
	return result, nil
}

func (s *Service) Results(ctx context.Context, itemID string) ([]domain.Result, error) {
	return s.store.Runs.Results(ctx, itemID)
}

// ItemUpdate carries optional status and/or assignee changes.
type ItemUpdate struct {
	Status   *string
	Assignee *string
}

func (s *Service) UpdateItem(ctx context.Context, itemID string, upd ItemUpdate) error {
	if upd.Status == nil && upd.Assignee == nil {
		return invalid("nothing to update: provide status and/or assignee")
	}
	if upd.Status != nil {
		status, err := domain.ParseStatus(*upd.Status)
		if err != nil {
			return invalid("%s", err)
		}
		if err := s.store.Runs.SetItemStatus(ctx, itemID, status); err != nil {
			return err
		}
	}
	if upd.Assignee != nil {
		if err := s.store.Runs.AssignItem(ctx, itemID, *upd.Assignee); err != nil {
			return err
		}
	}
	s.audit(ctx, "update", "run_item", itemID)
	return nil
}

func (s *Service) RunSummary(ctx context.Context, runID string) (domain.RunSummary, error) {
	return s.store.Runs.Summary(ctx, runID)
}
