// Package service implements the application use cases over the store.
// REST handlers (and later the MCP server) are thin adapters over this
// package. Validation happens here, before any storage access.
package service

import (
	"context"
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

type Service struct {
	store *store.Store
}

func New(s *store.Store) *Service { return &Service{store: s} }

// --- Projects ---

func (s *Service) CreateProject(ctx context.Context, name string) (domain.Project, error) {
	if err := domain.ValidateProjectName(name); err != nil {
		return domain.Project{}, invalid("%s", err)
	}
	return s.store.Projects.Create(ctx, name)
}

func (s *Service) GetProject(ctx context.Context, id string) (domain.Project, error) {
	return s.store.Projects.Get(ctx, id)
}

func (s *Service) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return s.store.Projects.List(ctx)
}

// ProjectUpdate carries optional changes; nil fields are left untouched.
type ProjectUpdate struct {
	Name     *string
	Archived *bool
}

func (s *Service) UpdateProject(ctx context.Context, id string, upd ProjectUpdate) (domain.Project, error) {
	if upd.Name == nil && upd.Archived == nil {
		return domain.Project{}, invalid("nothing to update: provide name and/or archived")
	}
	if upd.Name != nil {
		if err := domain.ValidateProjectName(*upd.Name); err != nil {
			return domain.Project{}, invalid("%s", err)
		}
		if err := s.store.Projects.Rename(ctx, id, *upd.Name); err != nil {
			return domain.Project{}, err
		}
	}
	if upd.Archived != nil && *upd.Archived {
		if err := s.store.Projects.Archive(ctx, id); err != nil {
			return domain.Project{}, err
		}
	}
	return s.store.Projects.Get(ctx, id)
}

// --- Cases ---

// CreateCase creates a case; an empty folderID defaults to the project's
// root folder (design D8).
func (s *Service) CreateCase(ctx context.Context, projectID, folderID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	return s.store.Cases.Create(ctx, projectID, folderID, content)
}

func (s *Service) MoveCase(ctx context.Context, caseID, folderID string) error {
	if folderID == "" {
		return invalid("folderId is required")
	}
	return s.store.Cases.Move(ctx, caseID, folderID)
}

func (s *Service) EditCase(ctx context.Context, caseID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	return s.store.Cases.NewVersion(ctx, caseID, content)
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
	return s.store.Cases.SoftDelete(ctx, caseID)
}

// --- Folders ---

func (s *Service) CreateFolder(ctx context.Context, projectID string, in domain.NewFolder) (domain.Folder, error) {
	if err := in.Validate(); err != nil {
		return domain.Folder{}, invalid("%s", err)
	}
	return s.store.Folders.Create(ctx, projectID, in.ParentFolderID, in.Name)
}

func (s *Service) ListFolders(ctx context.Context, projectID string) ([]domain.Folder, error) {
	return s.store.Folders.List(ctx, projectID)
}

func (s *Service) DeleteFolder(ctx context.Context, folderID string) error {
	return s.store.Folders.Delete(ctx, folderID)
}

// --- Suites ---

func (s *Service) CreateSuite(ctx context.Context, projectID, name string) (domain.Suite, error) {
	if name == "" {
		return domain.Suite{}, invalid("name is required")
	}
	return s.store.Suites.Create(ctx, projectID, name)
}

func (s *Service) ListSuites(ctx context.Context, projectID string) ([]domain.Suite, error) {
	return s.store.Suites.List(ctx, projectID)
}

func (s *Service) AddCaseToSuite(ctx context.Context, suiteID, caseID string) error {
	return s.store.Suites.AddCase(ctx, suiteID, caseID)
}

func (s *Service) RemoveCaseFromSuite(ctx context.Context, suiteID, caseID string) error {
	return s.store.Suites.RemoveCase(ctx, suiteID, caseID)
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
	return s.store.Runs.Create(ctx, projectID, in.Name, unique)
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
	return s.store.Runs.AddItem(ctx, runID, caseID)
}

func (s *Service) RunItems(ctx context.Context, runID, assignee string) ([]domain.RunItem, error) {
	return s.store.Runs.Items(ctx, runID, assignee)
}

func (s *Service) RecordResult(ctx context.Context, itemID string, res domain.NewResult) (domain.Result, error) {
	if err := res.Validate(); err != nil {
		return domain.Result{}, invalid("%s", err)
	}
	return s.store.Runs.AppendResult(ctx, itemID, res)
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
	return nil
}

func (s *Service) RunSummary(ctx context.Context, runID string) (domain.RunSummary, error) {
	return s.store.Runs.Summary(ctx, runID)
}
