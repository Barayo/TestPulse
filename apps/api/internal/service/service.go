// Package service implements the application use cases over the store.
// REST handlers (and later the MCP server) are thin adapters over this
// package. Validation happens here, before any storage access.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentimage"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/mailer"
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

// ConflictError marks a request that's individually well-formed but
// conflicts with the resource's current state (HTTP 409) — e.g. mutating a
// closed run (add-run-lifecycle-status).
type ConflictError struct{ msg string }

func (e *ConflictError) Error() string { return e.msg }

func conflict(msg string) error { return &ConflictError{msg: msg} }

type Service struct {
	store *store.Store

	// Password-reset email (add-forgot-password), wired via WithMailer.
	// Zero-value here means passwordResetEnabled is false — every call
	// site that doesn't need this feature gets the correct, safe default
	// (ForgotPassword silently no-ops) with no changes required.
	mailer               mailer.Sender
	publicURL            string
	passwordResetEnabled bool

	// encryptionKey (TESTPULSE_ENCRYPTION_KEY) encrypts the OIDC client
	// secret at rest (add-sso-oidc design.md D7) — wired via
	// WithEncryptionKey. Empty means unset; saving a client secret without
	// it configured is rejected (see UpdateInstanceSettings). Unlike
	// oidc_only/the admin-claim mapping (both DB-backed and read live, since
	// a Tenant Admin can change them without a restart), this genuinely is
	// deploy-time config — rotating it would orphan any already-encrypted
	// secret, so it's resolved once at construction like PublicURL.
	encryptionKey string
}

func New(s *store.Store) *Service { return &Service{store: s} }

// WithMailer enables password-reset email delivery (add-forgot-password).
// publicURL builds the absolute reset link; enabled mirrors
// config.Config.PasswordResetEnabled(), resolved once at construction.
func (s *Service) WithMailer(sender mailer.Sender, publicURL string, enabled bool) *Service {
	s.mailer = sender
	s.publicURL = publicURL
	s.passwordResetEnabled = enabled
	return s
}

// WithEncryptionKey configures the key used to encrypt the OIDC client
// secret at rest (add-sso-oidc design.md D7).
func (s *Service) WithEncryptionKey(key string) *Service {
	s.encryptionKey = key
	return s
}

// PasswordResetEnabled reports whether this Service can send password-reset
// email — surfaced on GET /api/v1/meta so the login page knows whether to
// render the "Forgot password?" link (design.md). SMTP configuration is a
// boot-time snapshot (s.passwordResetEnabled); SSO-only (add-sso-oidc) is
// DB-backed and read live, since a Tenant Admin can change it without a
// restart — either one being true disables self-service recovery.
func (s *Service) PasswordResetEnabled(ctx context.Context) (bool, error) {
	if !s.passwordResetEnabled {
		return false, nil
	}
	settings, err := s.store.InstanceSettings.Get(ctx)
	if err != nil {
		return false, err
	}
	return !settings.OIDCOnly, nil
}

// --- Projects ---

// ProjectInput carries the fields needed to create a project. Description
// is optional. There is no owner concept — access is entirely determined by
// project membership (add-project-rbac), assigned by a Tenant Admin after
// creation via /projects/{id}/members.
type ProjectInput struct {
	Name        string
	Description string
}

func (s *Service) CreateProject(ctx context.Context, in ProjectInput) (domain.Project, error) {
	if err := domain.ValidateProjectName(in.Name); err != nil {
		return domain.Project{}, invalid("%s", err)
	}
	p, err := s.store.Projects.Create(ctx, in.Name, in.Description)
	if err != nil {
		return domain.Project{}, err
	}
	s.audit(ctx, "create", "project", p.ID)
	return p, nil
}

func (s *Service) GetProject(ctx context.Context, id string) (domain.Project, error) {
	return s.store.Projects.Get(ctx, id)
}

// HasAnyProject reports whether the instance has at least one project,
// bypassing RBAC entirely — there is no authenticated actor at server
// startup, where this is used to gate the one-time Sample Project seed
// (add-sample-project), mirroring BootstrapAdmin's own emptiness check.
func (s *Service) HasAnyProject(ctx context.Context) (bool, error) {
	projects, err := s.store.Projects.List(ctx)
	if err != nil {
		return false, err
	}
	return len(projects) > 0, nil
}

// MarkSample flags a project as the automatically-seeded showroom project
// (add-sample-project).
func (s *Service) MarkSample(ctx context.Context, projectID string) error {
	return s.store.Projects.MarkSample(ctx, projectID)
}

// ListProjects returns every project for a Tenant Admin, or only the
// projects the caller has an effective role on otherwise (add-project-rbac
// design.md D6) — non-Tenant-Admins never saw an unfiltered list again
// after this change.
func (s *Service) ListProjects(ctx context.Context) ([]domain.Project, error) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return nil, unauthorized("authentication required")
	}
	if actor.IsTenantAdmin {
		return s.store.Projects.List(ctx)
	}
	return s.store.Projects.ListForMember(ctx, actor.EffectiveUserID)
}

// ProjectSummaries returns the current actor's view of every non-archived
// project, including which ones they've favorited (design D3), filtered to
// membership for non-Tenant-Admins (add-project-rbac design.md D6).
func (s *Service) ProjectSummaries(ctx context.Context) ([]domain.ProjectSummary, error) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return nil, unauthorized("authentication required")
	}
	summaries, err := s.store.Projects.Summaries(ctx, actor.ID)
	if err != nil {
		return nil, err
	}
	if actor.IsTenantAdmin {
		return summaries, nil
	}
	member, err := s.store.Projects.ListForMember(ctx, actor.EffectiveUserID)
	if err != nil {
		return nil, err
	}
	allowed := make(map[string]bool, len(member))
	for _, p := range member {
		allowed[p.ID] = true
	}
	filtered := make([]domain.ProjectSummary, 0, len(summaries))
	for _, sum := range summaries {
		if allowed[sum.ProjectID] {
			filtered = append(filtered, sum)
		}
	}
	return filtered, nil
}

// ProjectUpdate carries optional changes; nil fields are left untouched.
type ProjectUpdate struct {
	Name         *string
	Description  *string
	Archived     *bool
	PublicAccess *bool
	// AutoArchiveExempt exempts the project from the instance-wide
	// auto-archive-inactive-projects policy (design.md D9 of
	// add-data-retention) — settable only by a Tenant Admin, checked in
	// UpdateProject itself, since this field needs a stricter gate than
	// the route's own manageProject permission floor.
	AutoArchiveExempt *bool
	// AssigneeRestrictedRecording (restrict-run-item-status-to-assignee)
	// gates recording results/status changes to an item's assignee. Same
	// manageProject floor as PublicAccess — no stricter gate needed.
	AssigneeRestrictedRecording *bool
}

func (s *Service) UpdateProject(ctx context.Context, id string, upd ProjectUpdate) (domain.Project, error) {
	if upd.Name == nil && upd.Description == nil && upd.Archived == nil && upd.PublicAccess == nil && upd.AutoArchiveExempt == nil && upd.AssigneeRestrictedRecording == nil {
		return domain.Project{}, invalid("nothing to update: provide name, description, archived, publicAccess, autoArchiveExempt, and/or assigneeRestrictedRecording")
	}
	if upd.AutoArchiveExempt != nil {
		actor, ok := domain.ActorFromContext(ctx)
		if !ok || !actor.IsTenantAdmin {
			return domain.Project{}, forbidden("only a Tenant Admin can set a project's auto-archive exemption")
		}
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
	if upd.Archived != nil {
		if *upd.Archived {
			if err := s.store.Projects.Archive(ctx, id); err != nil {
				return domain.Project{}, err
			}
			s.audit(ctx, "archive", "project", id)
		} else {
			// add-data-retention design.md D7: archiving must be
			// genuinely reversible — the archive-then-delete flow it
			// gates assumes so, and before this the flag was a
			// silent no-op when unset.
			if err := s.store.Projects.Unarchive(ctx, id); err != nil {
				return domain.Project{}, err
			}
			s.audit(ctx, "unarchive", "project", id)
		}
	}
	if upd.PublicAccess != nil {
		if err := s.store.Projects.SetPublicAccess(ctx, id, *upd.PublicAccess); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "update_public_access", "project", id)
	}
	if upd.AutoArchiveExempt != nil {
		if err := s.store.Projects.SetAutoArchiveExempt(ctx, id, *upd.AutoArchiveExempt); err != nil {
			return domain.Project{}, err
		}
		if *upd.AutoArchiveExempt {
			s.audit(ctx, "exempt_from_auto_archive", "project", id)
		} else {
			s.audit(ctx, "unexempt_from_auto_archive", "project", id)
		}
	}
	if upd.AssigneeRestrictedRecording != nil {
		if err := s.store.Projects.SetAssigneeRestrictedRecording(ctx, id, *upd.AssigneeRestrictedRecording); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "update_assignee_restricted_recording", "project", id)
	}
	return s.store.Projects.Get(ctx, id)
}

// DeleteProject queues an already-archived project for permanent
// background deletion (add-data-retention design.md D4/D6). The archived
// precondition is enforced here, server-side — never trusting the UI
// alone for anything destructive, this codebase's consistent pattern.
func (s *Service) DeleteProject(ctx context.Context, projectID string) error {
	p, err := s.store.Projects.Get(ctx, projectID)
	if err != nil {
		return err
	}
	if !p.Archived {
		return invalid("project must be archived before it can be deleted")
	}
	if err := s.store.Projects.MarkForDeletion(ctx, projectID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "project", projectID)
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

// AssignProjectTag and RemoveProjectTag manage a project's tags
// (add-project-tags) — shared project state, not per-user like favorites,
// so unlike StarProject/UnstarProject these are open to any actor (human
// or agent) the router's read-permission middleware already let through.
func (s *Service) AssignProjectTag(ctx context.Context, projectID, tagName string) error {
	if err := s.store.Tags.Assign(ctx, projectID, tagName); err != nil {
		return err
	}
	s.audit(ctx, "tag", "project", projectID)
	return nil
}

func (s *Service) RemoveProjectTag(ctx context.Context, projectID, tagName string) error {
	if err := s.store.Tags.Remove(ctx, projectID, tagName); err != nil {
		return err
	}
	s.audit(ctx, "untag", "project", projectID)
	return nil
}

// ListTagNames returns the full shared tag vocabulary, for the project
// list's filter control and the tag picker's autocomplete options.
func (s *Service) ListTagNames(ctx context.Context) ([]string, error) {
	return s.store.Tags.ListNames(ctx)
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

// resolveActor reads the authenticated caller's kind/ref off the request
// context, falling back to "unknown" when none is resolved (reachable only
// if a call site ran ahead of auth middleware).
func resolveActor(ctx context.Context) (domain.ResultActorKind, string) {
	if actor, ok := domain.ActorFromContext(ctx); ok {
		return domain.ResultActorKind(actor.Kind), actor.ID
	}
	return domain.ResultActorUnknown, ""
}

// --- Cases ---

// CreateCase creates a case; an empty folderID defaults to the project's
// root folder (design D8).
func (s *Service) CreateCase(ctx context.Context, projectID, folderID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	if err := s.validateCustomFieldValues(ctx, projectID, content.CustomFields); err != nil {
		return domain.TestCase{}, err
	}
	actorKind, actorRefID := resolveActor(ctx)
	c, err := s.store.Cases.Create(ctx, projectID, folderID, content, actorKind, actorRefID)
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
	before, err := s.store.Cases.Get(ctx, caseID)
	if err != nil {
		return err
	}
	if err := s.store.Cases.Move(ctx, caseID, folderID); err != nil {
		return err
	}
	s.audit(ctx, "move", "case", caseID, map[string]any{"from": before.FolderID, "to": folderID})
	return nil
}

func (s *Service) EditCase(ctx context.Context, caseID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	if len(content.CustomFields) > 0 {
		projectID, err := s.store.Cases.ProjectID(ctx, caseID)
		if err != nil {
			return domain.TestCase{}, err
		}
		if err := s.validateCustomFieldValues(ctx, projectID, content.CustomFields); err != nil {
			return domain.TestCase{}, err
		}
	}
	actorKind, actorRefID := resolveActor(ctx)
	c, err := s.store.Cases.NewVersion(ctx, caseID, content, actorKind, actorRefID)
	if err != nil {
		return domain.TestCase{}, err
	}
	s.audit(ctx, "edit", "case", caseID)
	return c, nil
}

// RestoreVersion reverts a case to an old version's content by creating a
// **new** version copied from it — it never rewinds `current_version` in
// place, so a version number is never reused for different content (see
// add-version-restore design.md: any run pinning that number via the
// (case_id, version) FK must keep pointing at the same content forever).
func (s *Service) RestoreVersion(ctx context.Context, caseID string, version int) (domain.TestCase, error) {
	versions, err := s.store.Cases.Versions(ctx, caseID)
	if err != nil {
		return domain.TestCase{}, err
	}
	var target *domain.CaseVersion
	for i := range versions {
		if versions[i].Version == version {
			target = &versions[i]
			break
		}
	}
	if target == nil {
		return domain.TestCase{}, store.ErrNotFound
	}
	actorKind, actorRefID := resolveActor(ctx)
	c, err := s.store.Cases.NewVersion(ctx, caseID, target.Content, actorKind, actorRefID)
	if err != nil {
		return domain.TestCase{}, err
	}
	s.audit(ctx, "restore", "case", caseID, map[string]any{"restoredFrom": version, "newVersion": c.CurrentVersion})
	return c, nil
}

// jiraSyncWithoutLinkAsConflict translates the store's "no link set"
// sentinel into the service's 409 ConflictError (add-jira-connector),
// mirroring runClosedAsConflict.
func jiraSyncWithoutLinkAsConflict(err error) error {
	if errors.Is(err, store.ErrJiraLinkNotSet) {
		return conflict("jira issue key is not set")
	}
	return err
}

// SetCaseJiraLink sets or clears (jiraIssueKey == nil) a case's Jira issue
// key, independent of its versioned content — never creates a new version.
func (s *Service) SetCaseJiraLink(ctx context.Context, caseID string, jiraIssueKey *string) (domain.TestCase, error) {
	c, err := s.store.Cases.SetJiraLink(ctx, caseID, jiraIssueKey)
	if err != nil {
		return domain.TestCase{}, err
	}
	s.audit(ctx, "jira_link", "case", caseID)
	return c, nil
}

// SetCaseJiraSync writes the Jira connector's cached issue summary/status
// for a case (add-jira-connector) — the connector's own write path, not
// reachable through the content-edit endpoint.
func (s *Service) SetCaseJiraSync(ctx context.Context, caseID, summary, status string) (domain.TestCase, error) {
	c, err := s.store.Cases.SetJiraSync(ctx, caseID, summary, status, time.Now())
	if err != nil {
		return domain.TestCase{}, jiraSyncWithoutLinkAsConflict(err)
	}
	return c, nil
}

func (s *Service) GetCase(ctx context.Context, caseID string) (domain.TestCase, error) {
	return s.store.Cases.Get(ctx, caseID)
}

func (s *Service) ListCases(ctx context.Context, projectID string) ([]domain.TestCase, error) {
	return s.store.Cases.List(ctx, projectID)
}

// ListJiraLinkedCases returns a project's cases with a non-null
// jiraIssueKey (add-jira-connector) — the "jiraLinked=true" filter on the
// case-list endpoint, resolved as a DB-level query, not a client-side scan.
func (s *Service) ListJiraLinkedCases(ctx context.Context, projectID string) ([]domain.TestCase, error) {
	return s.store.Cases.ListJiraLinked(ctx, projectID)
}

func (s *Service) CaseVersions(ctx context.Context, caseID string) ([]domain.CaseVersion, error) {
	return s.store.Cases.Versions(ctx, caseID)
}

func (s *Service) CaseExecutions(ctx context.Context, caseID string) ([]domain.CaseExecution, error) {
	return s.store.Runs.ExecutionsByCase(ctx, caseID)
}

// MaxRecentCaseExecutionsLimit bounds the `limit` param on
// RecentCaseExecutions so it can never become an unbounded-fetch escape
// hatch (add-case-result-history).
const MaxRecentCaseExecutionsLimit = 50

// RecentCaseExecutions is a thin passthrough to the store's bounded,
// recency-ordered query — no aggregation logic here, per design.md.
func (s *Service) RecentCaseExecutions(ctx context.Context, caseID string, limit int) ([]domain.CaseExecution, error) {
	if limit <= 0 || limit > MaxRecentCaseExecutionsLimit {
		return nil, invalid("limit must be between 1 and %d", MaxRecentCaseExecutionsLimit)
	}
	return s.store.Runs.ExecutionsByCaseRecent(ctx, caseID, limit)
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

// MoveFolder reparents folderID under targetParentID (add-library-folder-
// selection), auditing "move"/"folder" with {from, to} exactly like
// MoveCase does. A cycle (targetParentID inside folderID's own subtree, or
// folderID itself) or moving the root folder surfaces as a client error
// (store.ErrFolderCycle/ErrRootFolder), not a 500.
func (s *Service) MoveFolder(ctx context.Context, folderID, targetParentID string) (domain.Folder, error) {
	if targetParentID == "" {
		return domain.Folder{}, invalid("parentFolderId is required")
	}
	before, err := s.store.Folders.Get(ctx, folderID)
	if err != nil {
		return domain.Folder{}, err
	}
	f, err := s.store.Folders.Move(ctx, folderID, targetParentID)
	if err != nil {
		return domain.Folder{}, err
	}
	s.audit(ctx, "move", "folder", folderID, map[string]any{"from": before.ParentFolderID, "to": targetParentID})
	return f, nil
}

func (s *Service) DeleteFolder(ctx context.Context, folderID string) error {
	if err := s.store.Folders.Delete(ctx, folderID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "folder", folderID)
	return nil
}

// FolderDeletePreview previews how many cases and descendant folders a
// delete of folderID would remove, for the confirmation dialog to show
// before the user confirms (add-delete-mode).
type FolderDeletePreview struct {
	CaseCount   int `json:"caseCount"`
	FolderCount int `json:"folderCount"`
}

func (s *Service) FolderDeletePreview(ctx context.Context, folderID string) (FolderDeletePreview, error) {
	caseCount, folderCount, err := s.store.Folders.SubtreeCounts(ctx, folderID)
	if err != nil {
		return FolderDeletePreview{}, err
	}
	return FolderDeletePreview{CaseCount: caseCount, FolderCount: folderCount}, nil
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

func (s *Service) GetSuite(ctx context.Context, suiteID string) (domain.Suite, error) {
	return s.store.Suites.Get(ctx, suiteID)
}

func (s *Service) RenameSuite(ctx context.Context, suiteID, name string) (domain.Suite, error) {
	if name == "" {
		return domain.Suite{}, invalid("name is required")
	}
	suite, err := s.store.Suites.Rename(ctx, suiteID, name)
	if err != nil {
		return domain.Suite{}, err
	}
	s.audit(ctx, "rename", "suite", suiteID)
	return suite, nil
}

func (s *Service) DeleteSuite(ctx context.Context, suiteID string) error {
	if err := s.store.Suites.Delete(ctx, suiteID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "suite", suiteID)
	return nil
}

// SuiteTrend returns a suite's pass-rate trend across its closed runs
// (add-suite-pass-rate-trend), optionally including its current open run
// as a trailing point (add-suite-run-breakdown-trend).
func (s *Service) SuiteTrend(ctx context.Context, suiteID string, includeOpen bool) (domain.SuiteTrend, error) {
	return s.store.Suites.Trend(ctx, suiteID, includeOpen)
}

// FlakyCases returns every currently-flaky case in a project
// (add-flaky-test-detection).
func (s *Service) FlakyCases(ctx context.Context, projectID string) ([]domain.FlakyCase, error) {
	return s.store.Cases.FlakyCases(ctx, projectID)
}

// ProjectStatusSummary returns the project-wide run item status breakdown
// across every run, open and closed (add-project-reports-page).
func (s *Service) ProjectStatusSummary(ctx context.Context, projectID string) (domain.ProjectStatusSummary, error) {
	return s.store.Runs.ProjectStatusSummary(ctx, projectID)
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
	var run domain.Run
	var err error
	if in.SuiteID != "" {
		run, err = s.store.Runs.CreateWithSuite(ctx, projectID, in.Name, in.SuiteID, unique)
	} else {
		run, err = s.store.Runs.Create(ctx, projectID, in.Name, unique)
	}
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

// CloseRun seals a run: subsequent run-item mutations are rejected until
// it's reopened. Authorization (runRecordResult permission) is enforced by
// requirePermission at the routing layer, not here (add-run-lifecycle-status
// design.md D2).
func (s *Service) CloseRun(ctx context.Context, runID string) error {
	if err := s.store.Runs.Close(ctx, runID); err != nil {
		return err
	}
	s.audit(ctx, "close", "run", runID)
	return nil
}

// DeleteRun permanently removes a run and everything scoped to it
// (add-data-retention design.md D1) — a thin passthrough, the FK cascade
// does the real work.
func (s *Service) DeleteRun(ctx context.Context, runID string) error {
	if err := s.store.Runs.Delete(ctx, runID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "run", runID)
	return nil
}

// ReopenRun returns a closed run to open. Authorization (manageProject
// permission) is enforced by requirePermission at the routing layer.
func (s *Service) ReopenRun(ctx context.Context, runID string) error {
	if err := s.store.Runs.Reopen(ctx, runID); err != nil {
		return err
	}
	s.audit(ctx, "reopen", "run", runID)
	return nil
}

// runClosedAsConflict translates the store's closed-run sentinel into the
// service's 409 ConflictError, leaving every other error (including
// ErrNotFound) unchanged.
func runClosedAsConflict(err error) error {
	if errors.Is(err, store.ErrRunClosed) {
		return conflict("run is closed")
	}
	return err
}

func (s *Service) AddRunItem(ctx context.Context, runID, caseID string) (string, error) {
	if caseID == "" {
		return "", invalid("caseId is required")
	}
	itemID, err := s.store.Runs.AddItem(ctx, runID, caseID, "")
	if err != nil {
		return "", runClosedAsConflict(err)
	}
	s.audit(ctx, "add_item", "run", runID)
	return itemID, nil
}

func (s *Service) RunItems(ctx context.Context, runID, assignee string) ([]domain.RunItem, error) {
	return s.store.Runs.Items(ctx, runID, assignee)
}

// RunItemsJiraLinked returns a run's items with a non-null jiraIssueKey
// (add-jira-connector) — the "jiraLinked=true" filter on the run-items
// endpoint.
func (s *Service) RunItemsJiraLinked(ctx context.Context, runID string) ([]domain.RunItem, error) {
	return s.store.Runs.ItemsJiraLinked(ctx, runID)
}

// RecordResult resolves the result's actor from the authenticated caller
// when the client omits one, and always records the real actor's kind/ref
// alongside whatever display name ends up on the result — even when the
// client supplies an explicit override (link-result-actor-to-identity D2).
// A request with no resolved Actor in context (reachable only if this were
// ever called ahead of auth middleware) falls back to "unknown" rather than
// panicking.
func (s *Service) RecordResult(ctx context.Context, itemID string, res domain.NewResult) (domain.Result, error) {
	if err := res.Validate(); err != nil {
		return domain.Result{}, invalid("%s", err)
	}
	if err := s.checkAssigneeRestriction(ctx, itemID); err != nil {
		return domain.Result{}, err
	}
	for i, a := range res.Attachments {
		contentType, err := attachmentimage.ValidateUpload(a.Data)
		if err != nil {
			return domain.Result{}, invalid("%s", err)
		}
		// The client-declared content type is untrusted — store what was
		// actually sniffed from the bytes, never what the caller claimed.
		res.Attachments[i].ContentType = contentType
	}

	actorKind := domain.ResultActorUnknown
	actorRefID := ""
	if actor, ok := domain.ActorFromContext(ctx); ok {
		actorKind = domain.ResultActorKind(actor.Kind)
		actorRefID = actor.ID
		if res.Actor == "" {
			res.Actor = actor.DisplayName
		}
	} else if res.Actor == "" {
		return domain.Result{}, invalid("actor is required")
	}

	result, err := s.store.Runs.AppendResult(ctx, itemID, res, actorKind, actorRefID)
	if err != nil {
		return domain.Result{}, attachmentErrorAsInvalid(err)
	}
	s.audit(ctx, "record_result", "run_item", itemID)
	return result, nil
}

func (s *Service) Results(ctx context.Context, itemID string) ([]domain.Result, error) {
	return s.store.Runs.Results(ctx, itemID)
}

// ItemUpdate carries optional status and/or assignee changes. AssigneeUserID
// and AssigneeTeamID are mutually exclusive (link-run-item-assignee-to-identity).
type ItemUpdate struct {
	Status         *string
	AssigneeUserID *string
	AssigneeTeamID *string
}

func (s *Service) UpdateItem(ctx context.Context, itemID string, upd ItemUpdate) error {
	if upd.Status == nil && upd.AssigneeUserID == nil && upd.AssigneeTeamID == nil {
		return invalid("nothing to update: provide status and/or assignee")
	}
	if upd.Status != nil {
		status, err := domain.ParseStatus(*upd.Status)
		if err != nil {
			return invalid("%s", err)
		}
		if err := s.checkAssigneeRestriction(ctx, itemID); err != nil {
			return err
		}
		if err := s.store.Runs.SetItemStatus(ctx, itemID, status); err != nil {
			return runClosedAsConflict(err)
		}
	}
	if upd.AssigneeUserID != nil || upd.AssigneeTeamID != nil {
		projectID, err := s.ProjectIDForItem(ctx, itemID)
		if err != nil {
			return err
		}
		membership, err := s.ProjectMembership(ctx, projectID)
		if err != nil {
			return err
		}
		if upd.AssigneeUserID != nil {
			if !isProjectMemberUser(membership, *upd.AssigneeUserID) {
				return store.ErrNotFound
			}
			if err := s.store.Runs.AssignItemToUser(ctx, itemID, *upd.AssigneeUserID); err != nil {
				return runClosedAsConflict(err)
			}
		} else {
			if !isProjectMemberTeam(membership, *upd.AssigneeTeamID) {
				return store.ErrNotFound
			}
			if err := s.store.Runs.AssignItemToTeam(ctx, itemID, *upd.AssigneeTeamID); err != nil {
				return runClosedAsConflict(err)
			}
		}
	}
	s.audit(ctx, "update", "run_item", itemID)
	return nil
}

// SetRunItemJiraLink sets or clears a run item's Jira issue key
// (add-jira-connector). Rejected as a 409 once the parent run is closed,
// consistent with every other mutating run-item operation.
func (s *Service) SetRunItemJiraLink(ctx context.Context, itemID string, jiraIssueKey *string) (domain.RunItem, error) {
	it, err := s.store.Runs.SetItemJiraLink(ctx, itemID, jiraIssueKey)
	if err != nil {
		return domain.RunItem{}, runClosedAsConflict(err)
	}
	s.audit(ctx, "jira_link", "run_item", itemID)
	return it, nil
}

// SetRunItemJiraSync writes the Jira connector's cached issue summary/status
// for a run item (add-jira-connector).
func (s *Service) SetRunItemJiraSync(ctx context.Context, itemID, summary, status string) (domain.RunItem, error) {
	it, err := s.store.Runs.SetItemJiraSync(ctx, itemID, summary, status, time.Now())
	if err != nil {
		return domain.RunItem{}, jiraSyncWithoutLinkAsConflict(err)
	}
	return it, nil
}

func isProjectMemberUser(m domain.ProjectMembership, userID string) bool {
	for _, u := range m.Users {
		if u.UserID == userID {
			return true
		}
	}
	return false
}

func isProjectMemberTeam(m domain.ProjectMembership, teamID string) bool {
	for _, t := range m.Teams {
		if t.TeamID == teamID {
			return true
		}
	}
	return false
}

func (s *Service) RunSummary(ctx context.Context, runID string) (domain.RunSummary, error) {
	return s.store.Runs.Summary(ctx, runID)
}

func summaryPoint(run domain.Run, items []domain.RunItem) domain.SuiteTrendPoint {
	point := domain.SuiteTrendPoint{
		RunKey: run.Key, RunName: run.Name, CreatedAt: run.CreatedAt,
		Counts: map[domain.Status]int{},
	}
	for _, it := range items {
		point.Counts[it.CurrentStatus]++
		point.Total++
	}
	return point
}

// comparisonSummary is summaryPoint plus a run's total duration
// (add-run-comparison-timing design.md D1) — comparison-only, so it stays
// separate from SuiteTrendPoint, which the unrelated Stability trend also
// uses and has no need for a duration figure.
func (s *Service) comparisonSummary(ctx context.Context, run domain.Run, items []domain.RunItem) (domain.RunComparisonSummary, error) {
	point := summaryPoint(run, items)
	durationMs, err := s.store.Runs.TotalDuration(ctx, run.ID)
	if err != nil {
		return domain.RunComparisonSummary{}, err
	}
	return domain.RunComparisonSummary{
		RunKey: point.RunKey, RunName: point.RunName, CreatedAt: point.CreatedAt,
		Total: point.Total, Counts: point.Counts, TotalDurationMs: durationMs,
	}, nil
}

func isBadVerdictStatus(st domain.Status) bool {
	return st == domain.StatusFailed || st == domain.StatusBlocked
}

// CompareRuns returns the categorized item-level diff between two closed
// runs from the same project, joined by case key (add-run-comparison-view).
// Older/newer is resolved by each run's CreatedAt, independent of which run
// ID is supplied first.
func (s *Service) CompareRuns(ctx context.Context, runID, otherRunID string) (domain.RunComparison, error) {
	runA, err := s.store.Runs.Get(ctx, runID)
	if err != nil {
		return domain.RunComparison{}, err
	}
	runB, err := s.store.Runs.Get(ctx, otherRunID)
	if err != nil {
		return domain.RunComparison{}, err
	}
	if runA.ProjectID != runB.ProjectID {
		return domain.RunComparison{}, invalid("both runs must belong to the same project")
	}
	if runA.Status != domain.RunStatusClosed || runB.Status != domain.RunStatusClosed {
		return domain.RunComparison{}, invalid("both runs must be closed")
	}

	older, newer := runA, runB
	if newer.CreatedAt.Before(older.CreatedAt) {
		older, newer = newer, older
	}

	olderItems, err := s.store.Runs.Items(ctx, older.ID, "")
	if err != nil {
		return domain.RunComparison{}, err
	}
	newerItems, err := s.store.Runs.Items(ctx, newer.ID, "")
	if err != nil {
		return domain.RunComparison{}, err
	}

	olderByCase := make(map[string]domain.RunItem, len(olderItems))
	for _, it := range olderItems {
		olderByCase[it.CaseKey] = it
	}
	newerByCase := make(map[string]domain.RunItem, len(newerItems))
	for _, it := range newerItems {
		newerByCase[it.CaseKey] = it
	}

	olderSummary, err := s.comparisonSummary(ctx, older, olderItems)
	if err != nil {
		return domain.RunComparison{}, err
	}
	newerSummary, err := s.comparisonSummary(ctx, newer, newerItems)
	if err != nil {
		return domain.RunComparison{}, err
	}

	cmp := domain.RunComparison{
		OlderRun: olderSummary,
		NewerRun: newerSummary,
		// Initialized non-nil so an empty category marshals as `[]`, matching
		// the openapi schema's non-nullable array — a nil slice would
		// otherwise encode as JSON `null` and break a client that assumes
		// an array (e.g. calling `.length` on the response field).
		Regressed: []domain.RunComparisonItem{},
		Improved:  []domain.RunComparisonItem{},
		Unchanged: []domain.RunComparisonItem{},
		Added:     []domain.RunComparisonItem{},
		Removed:   []domain.RunComparisonItem{},
	}

	for caseKey, oldItem := range olderByCase {
		newItem, stillPresent := newerByCase[caseKey]
		if !stillPresent {
			os := oldItem.CurrentStatus
			cmp.Removed = append(cmp.Removed, domain.RunComparisonItem{
				CaseKey: caseKey, CaseTitle: oldItem.Content.Title, StatusOlder: &os,
			})
			continue
		}
		os, ns := oldItem.CurrentStatus, newItem.CurrentStatus
		item := domain.RunComparisonItem{CaseKey: caseKey, CaseTitle: newItem.Content.Title, StatusOlder: &os, StatusNewer: &ns}
		switch {
		case os == domain.StatusPass && isBadVerdictStatus(ns):
			cmp.Regressed = append(cmp.Regressed, item)
		case isBadVerdictStatus(os) && ns == domain.StatusPass:
			cmp.Improved = append(cmp.Improved, item)
		default:
			cmp.Unchanged = append(cmp.Unchanged, item)
		}
	}
	for caseKey, newItem := range newerByCase {
		if _, existedBefore := olderByCase[caseKey]; existedBefore {
			continue
		}
		ns := newItem.CurrentStatus
		cmp.Added = append(cmp.Added, domain.RunComparisonItem{
			CaseKey: caseKey, CaseTitle: newItem.Content.Title, StatusNewer: &ns,
		})
	}

	return cmp, nil
}
