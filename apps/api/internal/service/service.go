// Package service implements the application use cases over the store.
// REST handlers (and later the MCP server) are thin adapters over this
// package. Validation happens here, before any storage access.
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
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

	// logger is used for operational (not audit) logging: webhook delivery
	// failures, background worker tick failures, audit-append failures.
	// Defaults to a discard sink so tests and any Service constructed
	// without WithLogger never panic on a nil logger (add-service-request-
	// logging).
	logger *slog.Logger
}

func New(s *store.Store) *Service {
	return &Service{store: s, logger: slog.New(slog.DiscardHandler)}
}

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

// WithLogger configures operational logging for webhook delivery,
// background worker, and audit failures (add-service-request-logging).
func (s *Service) WithLogger(l *slog.Logger) *Service {
	s.logger = l
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
	// A scoped agent token is confined to its own project, never the
	// token creator's broader membership (#163) -- checked first, the
	// same as requirePermission and Service.Authorize already do for
	// project-scoped resources (middleware.go, project_rbac.go).
	if actor.ScopedProjectID != nil {
		p, err := s.GetProject(ctx, *actor.ScopedProjectID)
		if err != nil {
			return nil, err
		}
		return []domain.Project{p}, nil
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
	// Same scoped-token narrowing as ListProjects (#163): a scoped
	// token's membership set must never fall back to the token
	// creator's own, or it leaks every project the creator belongs to.
	var allowedIDs []string
	if actor.ScopedProjectID != nil {
		allowedIDs = []string{*actor.ScopedProjectID}
	} else {
		member, err := s.store.Projects.ListForMember(ctx, actor.EffectiveUserID)
		if err != nil {
			return nil, err
		}
		allowedIDs = make([]string, len(member))
		for i, p := range member {
			allowedIDs[i] = p.ID
		}
	}
	allowed := make(map[string]bool, len(allowedIDs))
	for _, id := range allowedIDs {
		allowed[id] = true
	}
	filtered := make([]domain.ProjectSummary, 0, len(summaries))
	for _, sum := range summaries {
		if allowed[sum.ProjectID] {
			filtered = append(filtered, sum)
		}
	}
	return filtered, nil
}

// GetDetails fetches the full record for entityType/key (the MCP
// get_details tool, add-mcp-server) — entityType is one of "case", "suite",
// "run", "project", "release", "testPlan", matching Search's EntityType
// values so a search result can be fetched in full with one follow-up call.
// A key that exists under a different entity type is indistinguishable from
// a nonexistent key (store.ErrNotFound) — each *ByKey lookup is inherently
// scoped to its own table, so this never leaks cross-type existence.
func (s *Service) GetDetails(ctx context.Context, entityType, key string) (any, error) {
	switch entityType {
	case "case":
		id, err := s.CaseIDByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		return s.GetCase(ctx, id)
	case "suite":
		id, err := s.SuiteIDByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		return s.GetSuite(ctx, id)
	case "run":
		id, err := s.RunIDByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		return s.GetRun(ctx, id)
	case "project":
		id, err := s.ProjectIDByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		return s.GetProject(ctx, id)
	case "release":
		id, err := s.ReleaseIDByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		return s.GetRelease(ctx, id)
	case "testPlan":
		id, err := s.TestPlanIDByKey(ctx, key)
		if err != nil {
			return nil, err
		}
		return s.GetTestPlan(ctx, id)
	default:
		return nil, invalid("unknown entity_type %q", entityType)
	}
}

// Search performs cross-entity full-text search over cases, suites, runs,
// projects, releases, and test plans (the MCP `search` tool, add-mcp-server).
// projectIDs must already be resolved to the caller's accessible projects —
// this method does no permission resolution of its own, matching every
// other project-scoped service method's division of labor with its caller.
func (s *Service) Search(ctx context.Context, query string, projectIDs []string) ([]domain.SearchResult, error) {
	if strings.TrimSpace(query) == "" {
		return nil, invalid("query is required")
	}
	if len(projectIDs) == 0 {
		return []domain.SearchResult{}, nil
	}
	return s.store.Search.Search(ctx, query, projectIDs)
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
	// LandingView sets this project's own landing-view override
	// (add-configurable-project-landing design.md D5) — same manageProject
	// floor as PublicAccess, not Tenant-Admin-only like AutoArchiveExempt.
	// ClearLandingView, when true, reverts it to inheriting the
	// instance-wide default (design.md's addendum: a dedicated action
	// rather than a null sentinel, mirroring DisableOIDC).
	LandingView      *string
	ClearLandingView *bool
}

func (s *Service) UpdateProject(ctx context.Context, id string, upd ProjectUpdate) (domain.Project, error) {
	if upd.Name == nil && upd.Description == nil && upd.Archived == nil && upd.PublicAccess == nil && upd.AutoArchiveExempt == nil &&
		upd.AssigneeRestrictedRecording == nil && upd.LandingView == nil && upd.ClearLandingView == nil {
		return domain.Project{}, invalid("nothing to update: provide name, description, archived, publicAccess, autoArchiveExempt, assigneeRestrictedRecording, landingView, and/or clearLandingView")
	}
	// enforce-archived-project-readonly Decision 6: the only permitted
	// write on an archived project is unarchiving it, alone — bundling any
	// other field change into the same request has no clean answer for
	// which change would apply first, so it's rejected outright rather
	// than defining an ordering.
	current, err := s.store.Projects.Get(ctx, id)
	if err != nil {
		return domain.Project{}, err
	}
	if current.Archived {
		unarchiving := upd.Archived != nil && !*upd.Archived
		onlyUnarchiving := unarchiving && upd.Name == nil && upd.Description == nil &&
			upd.PublicAccess == nil && upd.AutoArchiveExempt == nil &&
			upd.AssigneeRestrictedRecording == nil && upd.LandingView == nil && upd.ClearLandingView == nil
		if !onlyUnarchiving {
			return domain.Project{}, conflict("project is archived; unarchive it before making other changes")
		}
	}
	if upd.LandingView != nil && !validLandingViews[*upd.LandingView] {
		return domain.Project{}, invalid("landingView must be one of dashboard, library, suites, runs, reports")
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
	if upd.ClearLandingView != nil && *upd.ClearLandingView {
		if err := s.store.Projects.SetLandingView(ctx, id, nil); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "clear_landing_view", "project", id)
	} else if upd.LandingView != nil {
		if err := s.store.Projects.SetLandingView(ctx, id, upd.LandingView); err != nil {
			return domain.Project{}, err
		}
		s.audit(ctx, "update_landing_view", "project", id)
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
// resolveStepGroupRefs expands every GroupRef-carrying step entry into its
// referenced step group's full step sequence — every resulting step is
// stamped with the same GroupRef (GroupID/GroupKey plus a
// SnapshotUpdatedAt), so a contiguous run of resolved steps sharing one
// GroupRef is how a client identifies "one group block" after save
// (add-reusable-steps design.md: snapshot at save time, never a live
// reference). The server looks up each referenced group itself and
// discards any client-supplied Action/Expected on a GroupRef entry — a
// client's claim about a group's content is never trusted, closing the
// spoofing gap a naive client-snapshot design would open. A GroupRef to a
// group outside projectID, or to no group at all, is rejected.
//
// previousSteps is the case's own previous version's already-resolved
// step content — nil for CreateCase (no previous version exists). It
// exists to fix a real bug found during frontend design (Pepe, reviewing
// this exact function): without it, editing a case for any reason
// silently re-resolved every GroupRef entry to its group's *current*
// content, even one the author never chose to refresh — directly
// contradicting spec.md's "staleness is surfaced, never applied
// silently." Now: an incoming entry's SnapshotUpdatedAt is compared
// against the group's actual current UpdatedAt. A match (the client just
// refreshed, or created the reference fresh) resolves to current content.
// A mismatch means the client is knowingly resending an old, unrefreshed
// snapshot — the server looks up that exact (group, snapshot) pair in
// previousSteps and carries its content forward unchanged instead of
// silently adopting the group's new content. That carried-forward content
// was itself server-resolved and persisted by this same service on a
// prior save, never client-supplied, so reusing it verbatim carries no
// spoofing risk. If no match is found there (e.g. a brand-new reference
// just inserted in this edit), it falls back to resolving fresh — the
// same safe default CreateCase always uses.
//
// A contiguous run of input steps sharing one GroupRef.GroupKey is
// resolved exactly ONCE, not once per entry in the run. Found via a real
// e2e test, not code review: the frontend (matching what the server
// itself produces) represents an already-resolved reference as N flat
// steps that all carry the same GroupRef — resolving each independently
// would re-expand the group N times, producing N*len(group.Steps) steps
// instead of len(group.Steps) on every save that merely round-trips an
// untouched block (e.g. editing an unrelated field elsewhere in the
// case).
func (s *Service) resolveStepGroupRefs(ctx context.Context, projectID string, steps, previousSteps []domain.Step) ([]domain.Step, error) {
	resolved := make([]domain.Step, 0, len(steps))
	for i := 0; i < len(steps); {
		step := steps[i]
		if step.GroupRef == nil {
			resolved = append(resolved, step)
			i++
			continue
		}
		j := i + 1
		for j < len(steps) && steps[j].GroupRef != nil && steps[j].GroupRef.GroupKey == step.GroupRef.GroupKey {
			j++
		}
		i = j

		group, err := s.store.StepGroups.GetByKey(ctx, step.GroupRef.GroupKey)
		if err != nil && !errors.Is(err, store.ErrNotFound) {
			return nil, err
		}
		// One generic message for both "no such group" and "group exists
		// but belongs to another project" (matches
		// validateCustomFieldValuesAgainst's precedent) — a distinguishable
		// error would let an actor probe whether a specific step-group key
		// exists in a project they can't otherwise see into.
		if err != nil || group.ProjectID != projectID {
			return nil, invalid("step group %q not found", step.GroupRef.GroupKey)
		}

		if !step.GroupRef.SnapshotUpdatedAt.Equal(group.UpdatedAt) {
			if carried, ok := carryForwardGroupRef(previousSteps, group.ID, step.GroupRef.SnapshotUpdatedAt); ok {
				resolved = append(resolved, carried...)
				continue
			}
		}

		for _, groupStep := range group.Steps {
			resolved = append(resolved, domain.Step{
				Action:   groupStep.Action,
				Expected: groupStep.Expected,
				GroupRef: &domain.StepGroupRef{GroupID: group.ID, GroupKey: group.Key, SnapshotUpdatedAt: group.UpdatedAt},
			})
		}
	}
	return resolved, nil
}

// hasGroupRef reports whether any step carries a GroupRef — EditCase only
// pays for fetching the case's previous version's content (needed by
// carryForwardGroupRef) when there's actually a group reference to
// resolve.
func hasGroupRef(steps []domain.Step) bool {
	for _, s := range steps {
		if s.GroupRef != nil {
			return true
		}
	}
	return false
}

// carryForwardGroupRef finds the contiguous run of steps in previousSteps
// stamped with GroupRef{GroupID: groupID, SnapshotUpdatedAt:
// snapshotUpdatedAt} and returns a copy of it, if present.
func carryForwardGroupRef(previousSteps []domain.Step, groupID string, snapshotUpdatedAt time.Time) ([]domain.Step, bool) {
	matches := func(s domain.Step) bool {
		return s.GroupRef != nil && s.GroupRef.GroupID == groupID && s.GroupRef.SnapshotUpdatedAt.Equal(snapshotUpdatedAt)
	}
	for i := 0; i < len(previousSteps); i++ {
		if !matches(previousSteps[i]) {
			continue
		}
		j := i
		for j < len(previousSteps) && matches(previousSteps[j]) {
			j++
		}
		run := make([]domain.Step, j-i)
		copy(run, previousSteps[i:j])
		return run, true
	}
	return nil, false
}

// checkFolderBelongsToProject confines folderID to projectID before any
// create/insert that would otherwise trust a caller-supplied folder ID
// verbatim (Luis's post-implementation review of add-folder-slug-urls,
// 2026-09-10) -- the same cross-project graft risk #175 already fixed for
// MoveCase/MoveFolder, but CreateCase/CreateFolder/BulkAddCases never had
// the equivalent check. An empty folderID is left alone: it resolves to the
// caller's own project's root folder downstream (store.resolveFolderID),
// which is always correct.
func (s *Service) checkFolderBelongsToProject(ctx context.Context, projectID, folderID string) error {
	if folderID == "" {
		return nil
	}
	destProjectID, err := s.store.Folders.ProjectID(ctx, folderID)
	if err != nil {
		return err
	}
	if destProjectID != projectID {
		return invalid("folder belongs to a different project")
	}
	return nil
}

func (s *Service) CreateCase(ctx context.Context, projectID, folderID string, content domain.CaseContent) (domain.TestCase, error) {
	if err := content.Validate(); err != nil {
		return domain.TestCase{}, invalid("%s", err)
	}
	if err := s.checkFolderBelongsToProject(ctx, projectID, folderID); err != nil {
		return domain.TestCase{}, err
	}
	if err := s.validateCustomFieldValues(ctx, projectID, content.CustomFields); err != nil {
		return domain.TestCase{}, err
	}
	resolvedSteps, err := s.resolveStepGroupRefs(ctx, projectID, content.Steps, nil)
	if err != nil {
		return domain.TestCase{}, err
	}
	content.Steps = resolvedSteps
	actorKind, actorRefID := resolveActor(ctx)
	c, err := s.store.Cases.Create(ctx, projectID, folderID, content, actorKind, actorRefID)
	if err != nil {
		return domain.TestCase{}, err
	}
	s.audit(ctx, "create", "case", c.ID)
	return c, nil
}

// BulkAddCases creates every content in contents as one atomic batch — the
// MCP bulk_add_cases tool's flagship use case (add-mcp-server design.md:
// "atomic, all-or-nothing"). An empty folderID defaults to the project's
// root folder, same as CreateCase. If any case fails validation, none are
// created; the error names the failing case's position so an agent can fix
// and retry without re-diagnosing the whole batch.
func (s *Service) BulkAddCases(ctx context.Context, projectID, folderID string, contents []domain.CaseContent) ([]domain.TestCase, error) {
	if len(contents) == 0 {
		return nil, invalid("cases is required")
	}
	if err := s.checkFolderBelongsToProject(ctx, projectID, folderID); err != nil {
		return nil, err
	}
	// Custom fields fetched once for the whole batch rather than once per
	// case (#180's lower-impact companion N+1) -- every case validates
	// against the same project's field list.
	fields, err := s.store.CustomFields.List(ctx, projectID)
	if err != nil {
		return nil, err
	}
	resolvedContents := make([]domain.CaseContent, len(contents))
	for i, content := range contents {
		if err := content.Validate(); err != nil {
			return nil, invalid("case %d: %s", i, err)
		}
		if err := validateCustomFieldValuesAgainst(fields, content.CustomFields); err != nil {
			return nil, err
		}
		// Security review finding: this batch path must resolve GroupRef
		// steps the same as CreateCase/EditCase — skipping it let an
		// unvalidated, potentially cross-project or nonexistent group
		// reference reach the store, breaking this tool's own
		// all-or-nothing contract.
		resolvedSteps, err := s.resolveStepGroupRefs(ctx, projectID, content.Steps, nil)
		if err != nil {
			return nil, err
		}
		content.Steps = resolvedSteps
		resolvedContents[i] = content
	}
	actorKind, actorRefID := resolveActor(ctx)
	cases, err := s.store.Cases.CreateBatch(ctx, projectID, folderID, resolvedContents, actorKind, actorRefID)
	if err != nil {
		return nil, err
	}
	for _, c := range cases {
		s.audit(ctx, "create", "case", c.ID)
	}
	return cases, nil
}

func (s *Service) MoveCase(ctx context.Context, caseID, folderID string) error {
	if folderID == "" {
		return invalid("folderId is required")
	}
	before, err := s.store.Cases.Get(ctx, caseID)
	if err != nil {
		return err
	}
	// The destination folder must belong to the same project as the case
	// (#175) -- otherwise a folder in another project can graft the case
	// into a subtree that project's own routine folder-delete will later
	// cascade into, destroying it with no permission check on this
	// project ever having run.
	destProjectID, err := s.store.Folders.ProjectID(ctx, folderID)
	if err != nil {
		return err
	}
	if destProjectID != before.ProjectID {
		return invalid("target folder belongs to a different project")
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
	projectID, err := s.store.Cases.ProjectID(ctx, caseID)
	if err != nil {
		return domain.TestCase{}, err
	}
	if len(content.CustomFields) > 0 {
		if err := s.validateCustomFieldValues(ctx, projectID, content.CustomFields); err != nil {
			return domain.TestCase{}, err
		}
	}
	var previousSteps []domain.Step
	if hasGroupRef(content.Steps) {
		previous, err := s.store.Cases.Get(ctx, caseID)
		if err != nil {
			return domain.TestCase{}, err
		}
		previousSteps = previous.Content.Steps
	}
	resolvedSteps, err := s.resolveStepGroupRefs(ctx, projectID, content.Steps, previousSteps)
	if err != nil {
		return domain.TestCase{}, err
	}
	content.Steps = resolvedSteps
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

// ListCasesPage is ListCases, cursor-paginated (add-cursor-pagination) —
// backs GET /projects/{projectKey}/cases. ListCases itself is untouched.
func (s *Service) ListCasesPage(ctx context.Context, projectID, cursor string, limit int) ([]domain.TestCase, string, error) {
	return s.store.Cases.ListPage(ctx, projectID, cursor, limit)
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

// CreateFolder rejects a name whose derived slug collides with a live
// sibling under the same parent, or is still reserved as another folder's
// move-redirect target (add-folder-slug-urls) — both checked before the
// insert so the error can name the actual colliding folder, matching
// Pepe's UI design; the store's own unique index is the final authority
// for a race either check somehow missed.
func (s *Service) CreateFolder(ctx context.Context, projectID string, in domain.NewFolder) (domain.Folder, error) {
	if err := in.Validate(); err != nil {
		return domain.Folder{}, invalid("%s", err)
	}
	if err := s.checkFolderBelongsToProject(ctx, projectID, in.ParentFolderID); err != nil {
		return domain.Folder{}, err
	}
	slug := domain.Slugify(in.Name)
	// "" excludeFolderID: a brand-new folder has no previous identity of
	// its own yet, so there's nothing for SlugReserved to need to exclude.
	if err := s.checkFolderSlugAvailable(ctx, projectID, in.ParentFolderID, slug, ""); err != nil {
		return domain.Folder{}, err
	}
	f, err := s.store.Folders.Create(ctx, projectID, in.ParentFolderID, in.Name, slug)
	if err != nil {
		return domain.Folder{}, err
	}
	s.audit(ctx, "create", "folder", f.ID)
	return f, nil
}

// checkFolderSlugAvailable is CreateFolder/MoveFolder's shared
// pre-write check: reject a slug already held by a live sibling under
// parentFolderID (naming it in the error, per Pepe's UI design), or still
// reserved as another folder's redirect target after a move.
// excludeFolderID is the folder actually being created ("") or moved (its
// own ID) — MoveFolder must exclude the folder from SlugReserved's search,
// or moving a folder back to a parent it previously occupied would be
// blocked by its own leftover previous-identity stamp from the earlier
// move (a real bug found via manual testing, not anticipated by design).
func (s *Service) checkFolderSlugAvailable(ctx context.Context, projectID, parentFolderID, slug, excludeFolderID string) error {
	if conflict, found, err := s.store.Folders.LiveSlugConflict(ctx, projectID, parentFolderID, slug); err != nil {
		return err
	} else if found {
		return invalid("a section named %q already exists here", conflict.Name)
	}
	if reserved, err := s.store.Folders.SlugReserved(ctx, projectID, parentFolderID, slug, excludeFolderID); err != nil {
		return err
	} else if reserved {
		return invalid("that name was used here recently and is still reserved for a moment — try a different name")
	}
	return nil
}

func (s *Service) ListFolders(ctx context.Context, projectID string) ([]domain.Folder, error) {
	return s.store.Folders.List(ctx, projectID)
}

// ListFoldersPage is ListFolders, cursor-paginated (add-cursor-pagination)
// — backs GET /projects/{projectKey}/folders. ListFolders itself is
// untouched.
func (s *Service) ListFoldersPage(ctx context.Context, projectID, cursor string, limit int) ([]domain.Folder, string, error) {
	return s.store.Folders.ListPage(ctx, projectID, cursor, limit)
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
	// The target parent must belong to the same project as the folder
	// being moved (#175) -- same cross-project graft risk as MoveCase.
	destProjectID, err := s.store.Folders.ProjectID(ctx, targetParentID)
	if err != nil {
		return domain.Folder{}, err
	}
	if destProjectID != before.ProjectID {
		return domain.Folder{}, invalid("target parent folder belongs to a different project")
	}
	if err := s.checkFolderSlugAvailable(ctx, before.ProjectID, targetParentID, before.Slug, folderID); err != nil {
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

// ListSuitesPage is ListSuites, cursor-paginated (add-cursor-pagination) —
// backs GET /projects/{projectKey}/suites. ListSuites itself is untouched.
func (s *Service) ListSuitesPage(ctx context.Context, projectID, cursor string, limit int) ([]domain.Suite, string, error) {
	return s.store.Suites.ListPage(ctx, projectID, cursor, limit)
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
	suiteProjectID, err := s.store.Suites.ProjectID(ctx, suiteID)
	if err != nil {
		return err
	}
	caseProjectID, err := s.store.Cases.ProjectID(ctx, caseID)
	if err != nil {
		return err
	}
	if caseProjectID != suiteProjectID {
		return invalid("case belongs to a different project")
	}
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

// --- Releases & Test Plans ---
//
// Release/Test Plan CRUD carries no actor/permission parameter, matching
// CreateSuite/CreateRun's shape: like every other project-scoped resource,
// authorization (manageProject) is enforced by requirePermission at the
// routing layer, not here (see CloseRun's comment for the established
// precedent this follows).

func (s *Service) CreateRelease(ctx context.Context, projectID, name, description string, status domain.ReleaseStatus) (domain.Release, error) {
	if err := (domain.Release{Name: name, Status: status}).Validate(); err != nil {
		return domain.Release{}, invalid("%s", err)
	}
	release, err := s.store.Releases.Create(ctx, projectID, name, description, status)
	if err != nil {
		return domain.Release{}, err
	}
	s.audit(ctx, "create", "release", release.ID)
	return release, nil
}

func (s *Service) ListReleases(ctx context.Context, projectID string, status domain.ReleaseStatus) ([]domain.Release, error) {
	return s.store.Releases.List(ctx, projectID, status)
}

func (s *Service) GetRelease(ctx context.Context, releaseID string) (domain.Release, error) {
	return s.store.Releases.Get(ctx, releaseID)
}

func (s *Service) UpdateRelease(ctx context.Context, releaseID, name, description string, status domain.ReleaseStatus) (domain.Release, error) {
	rel := domain.Release{ID: releaseID, Name: name, Description: description, Status: status}
	if err := rel.Validate(); err != nil {
		return domain.Release{}, invalid("%s", err)
	}
	updated, err := s.store.Releases.Update(ctx, rel)
	if err != nil {
		return domain.Release{}, err
	}
	s.audit(ctx, "update", "release", releaseID)
	return updated, nil
}

func (s *Service) DeleteRelease(ctx context.Context, releaseID string) error {
	if err := s.store.Releases.Delete(ctx, releaseID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "release", releaseID)
	return nil
}

// ReleaseRollup returns a Release's aggregated pass rate/run count across
// every Run belonging to any of its Test Plans (introduce-release-test-plan
// design.md D5) — a single store-level aggregate query, never a
// client-side per-Test-Plan fetch loop.
func (s *Service) ReleaseRollup(ctx context.Context, releaseID string) (domain.Rollup, error) {
	return s.store.Releases.Rollup(ctx, releaseID)
}

func (s *Service) CreateTestPlan(ctx context.Context, projectID, releaseID, name, description string) (domain.TestPlan, error) {
	if err := (domain.TestPlan{Name: name, ReleaseID: releaseID}).Validate(); err != nil {
		return domain.TestPlan{}, invalid("%s", err)
	}
	plan, err := s.store.TestPlans.Create(ctx, projectID, releaseID, name, description)
	if err != nil {
		return domain.TestPlan{}, err
	}
	s.audit(ctx, "create", "test_plan", plan.ID)
	return plan, nil
}

func (s *Service) ListTestPlans(ctx context.Context, releaseID string) ([]domain.TestPlan, error) {
	return s.store.TestPlans.ListByRelease(ctx, releaseID)
}

// ListTestPlansByProject returns every test plan across all of a project's
// releases — populates the run-creation Test Plan picker in one request,
// not an N+1 releases-then-plans client-side fetch loop.
func (s *Service) ListTestPlansByProject(ctx context.Context, projectID string) ([]domain.TestPlan, error) {
	return s.store.TestPlans.ListByProject(ctx, projectID)
}

func (s *Service) GetTestPlan(ctx context.Context, testPlanID string) (domain.TestPlan, error) {
	return s.store.TestPlans.Get(ctx, testPlanID)
}

func (s *Service) UpdateTestPlan(ctx context.Context, testPlanID, name, description string) (domain.TestPlan, error) {
	plan := domain.TestPlan{ID: testPlanID, Name: name, Description: description}
	if err := plan.Validate(); err != nil {
		return domain.TestPlan{}, invalid("%s", err)
	}
	updated, err := s.store.TestPlans.Update(ctx, plan)
	if err != nil {
		return domain.TestPlan{}, err
	}
	s.audit(ctx, "update", "test_plan", testPlanID)
	return updated, nil
}

func (s *Service) DeleteTestPlan(ctx context.Context, testPlanID string) error {
	if err := s.store.TestPlans.Delete(ctx, testPlanID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "test_plan", testPlanID)
	return nil
}

// TestPlanRollup returns a Test Plan's aggregated pass rate/run count
// across its Runs (design.md D5) — a single store-level aggregate query.
func (s *Service) TestPlanRollup(ctx context.Context, testPlanID string) (domain.Rollup, error) {
	return s.store.TestPlans.Rollup(ctx, testPlanID)
}

// --- Requirements (add-requirements-traceability) ---
//
// Requirement CRUD carries no actor/permission parameter, matching
// Release/TestPlan CRUD's shape above — manageProject is enforced by
// requirePermission at the routing layer.

func (s *Service) CreateRequirement(ctx context.Context, projectID, name, description, externalRef string) (domain.Requirement, error) {
	if err := (domain.Requirement{Name: name}).Validate(); err != nil {
		return domain.Requirement{}, invalid("%s", err)
	}
	req, err := s.store.Requirements.Create(ctx, projectID, name, description, externalRef)
	if err != nil {
		return domain.Requirement{}, err
	}
	s.audit(ctx, "create", "requirement", req.ID)
	return req, nil
}

func (s *Service) ListRequirements(ctx context.Context, projectID string) ([]domain.Requirement, error) {
	return s.store.Requirements.List(ctx, projectID)
}

func (s *Service) GetRequirement(ctx context.Context, requirementID string) (domain.Requirement, error) {
	return s.store.Requirements.Get(ctx, requirementID)
}

func (s *Service) UpdateRequirement(ctx context.Context, requirementID, name, description, externalRef string) (domain.Requirement, error) {
	req := domain.Requirement{ID: requirementID, Name: name, Description: description, ExternalRef: externalRef}
	if err := req.Validate(); err != nil {
		return domain.Requirement{}, invalid("%s", err)
	}
	updated, err := s.store.Requirements.Update(ctx, req)
	if err != nil {
		return domain.Requirement{}, err
	}
	s.audit(ctx, "update", "requirement", requirementID)
	return updated, nil
}

func (s *Service) DeleteRequirement(ctx context.Context, requirementID string) error {
	if err := s.store.Requirements.Delete(ctx, requirementID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "requirement", requirementID)
	return nil
}

// LinkRequirementCase validates the case belongs to the same project as
// the requirement (mirrors AddCaseToSuite's inline cross-project guard)
// before linking. Idempotent — linking an already-linked pair succeeds.
func (s *Service) LinkRequirementCase(ctx context.Context, requirementID, caseID string) error {
	reqProjectID, err := s.store.Requirements.ProjectID(ctx, requirementID)
	if err != nil {
		return err
	}
	caseProjectID, err := s.store.Cases.ProjectID(ctx, caseID)
	if err != nil {
		return err
	}
	if caseProjectID != reqProjectID {
		return invalid("case belongs to a different project")
	}
	if err := s.store.Requirements.LinkCase(ctx, requirementID, caseID); err != nil {
		return err
	}
	s.audit(ctx, "link_case", "requirement", requirementID)
	return nil
}

func (s *Service) UnlinkRequirementCase(ctx context.Context, requirementID, caseID string) error {
	if err := s.store.Requirements.UnlinkCase(ctx, requirementID, caseID); err != nil {
		return err
	}
	s.audit(ctx, "unlink_case", "requirement", requirementID)
	return nil
}

// ReleaseRequirementsCoverage returns a Release's coverage matrix — a
// single store-level aggregate query (design.md D3), never a client-side
// per-case fetch loop.
func (s *Service) ReleaseRequirementsCoverage(ctx context.Context, releaseID string) ([]domain.RequirementCoverage, error) {
	return s.store.Requirements.CoverageForRelease(ctx, releaseID)
}

// --- Runs ---

// RunInput creates a run from a suite's cases and/or an explicit list,
// optionally scoped to a Test Plan (introduce-release-test-plan).
type RunInput struct {
	Name       string
	SuiteID    string
	TestPlanID string
	CaseIDs    []string
}

// expandCaseIntoSpecs turns one case id into one-or-more store.RunItemSpec
// (add-parameterized-cases design.md D5): a case with no parameter rows
// contributes a single bare spec, reproducing today's exact behavior; a
// case with N rows contributes N specs, each row's Name used as both the
// item's TestName (display) and TestDataRowName (substitution lookup).
func (s *Service) expandCaseIntoSpecs(ctx context.Context, caseID string) ([]store.RunItemSpec, error) {
	c, err := s.store.Cases.Get(ctx, caseID)
	if err != nil {
		return nil, err
	}
	if c.Content.Parameters == nil || len(c.Content.Parameters.Rows) == 0 {
		return []store.RunItemSpec{{CaseID: caseID}}, nil
	}
	specs := make([]store.RunItemSpec, len(c.Content.Parameters.Rows))
	for i, row := range c.Content.Parameters.Rows {
		name := row["Name"]
		specs[i] = store.RunItemSpec{CaseID: caseID, TestName: name, TestDataRowName: name}
	}
	return specs, nil
}

func (s *Service) CreateRun(ctx context.Context, projectID string, in RunInput) (domain.Run, error) {
	if in.Name == "" {
		return domain.Run{}, invalid("name is required")
	}
	caseIDs := in.CaseIDs
	if in.SuiteID != "" {
		suiteProjectID, err := s.store.Suites.ProjectID(ctx, in.SuiteID)
		if err != nil {
			return domain.Run{}, err
		}
		if suiteProjectID != projectID {
			return domain.Run{}, invalid("suite belongs to a different project")
		}
		suite, err := s.store.Suites.Get(ctx, in.SuiteID)
		if err != nil {
			return domain.Run{}, err
		}
		caseIDs = append(caseIDs, suite.CaseIDs...)
	}
	if in.TestPlanID != "" {
		plan, err := s.store.TestPlans.Get(ctx, in.TestPlanID)
		if err != nil {
			return domain.Run{}, err
		}
		if plan.ProjectID != projectID {
			return domain.Run{}, invalid("test plan belongs to a different project")
		}
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
	// Every case ID -- whether supplied directly or pulled in via the
	// suite -- must belong to this project. Checked here rather than
	// trusted from the suite, since suite membership itself doesn't
	// enforce single-project cases (AddCaseToSuite has no such check).
	// Resolved in one batched query rather than one round trip per id
	// (#180) -- CaseKeys/CaseIDs had no length cap, so an ordinary
	// runCreate-holding actor could otherwise trigger thousands of
	// sequential DB round trips in a single request.
	caseProjectIDs, err := s.store.Cases.ProjectIDs(ctx, unique)
	if err != nil {
		return domain.Run{}, err
	}
	for _, id := range unique {
		caseProjectID, ok := caseProjectIDs[id]
		if !ok {
			return domain.Run{}, store.ErrNotFound
		}
		if caseProjectID != projectID {
			return domain.Run{}, invalid("case belongs to a different project")
		}
	}
	// Each unique case id expands to one-or-more specs (add-parameterized-cases
	// D5) — a non-parameterized case contributes exactly one bare spec, so
	// this is a no-op multiplier for the overwhelming majority of runs.
	var specs []store.RunItemSpec
	for _, id := range unique {
		caseSpecs, err := s.expandCaseIntoSpecs(ctx, id)
		if err != nil {
			return domain.Run{}, err
		}
		specs = append(specs, caseSpecs...)
	}
	run, err := s.store.Runs.CreateWithSpecs(ctx, projectID, in.Name, in.SuiteID, in.TestPlanID, specs)
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

// ListRunsPage is ListRuns, cursor-paginated (add-cursor-pagination) —
// backs GET /projects/{projectKey}/runs. ListRuns itself is untouched and
// keeps serving any caller that needs the complete, unbounded set.
func (s *Service) ListRunsPage(ctx context.Context, projectID, cursor string, limit int) ([]domain.Run, string, error) {
	return s.store.Runs.ListPage(ctx, projectID, cursor, limit)
}

// ListRunsByTestPlan returns the runs scoped to a single Test Plan
// (introduce-release-test-plan spec: "Runs may be listed filtered to a
// single Test Plan").
func (s *Service) ListRunsByTestPlan(ctx context.Context, testPlanID string) ([]domain.Run, error) {
	return s.store.Runs.ListByTestPlan(ctx, testPlanID)
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
	// Fires regardless of the run's final pass rate (design.md D-open-
	// questions: resolved as "always fire" — a 100%-pass close is still
	// useful go/no-go signal).
	if run, err := s.store.Runs.Get(ctx, runID); err == nil {
		go s.dispatchWebhooks(context.WithoutCancel(ctx), run.ProjectID, webhookEvent{
			Event:     "run.closed",
			EntityKey: run.Key,
			Title:     run.Name,
			Timestamp: time.Now(),
		})
	}
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

// ArchiveRun hides a run from the project's active run list
// (auto-archive-runs design.md D2) — reversible, no status precondition,
// no webhook dispatch (not one of add-run-notifications' events).
func (s *Service) ArchiveRun(ctx context.Context, runID string) error {
	if err := s.store.Runs.Archive(ctx, runID); err != nil {
		return err
	}
	s.audit(ctx, "archive", "run", runID)
	return nil
}

// UnarchiveRun returns an archived run to the active run list.
func (s *Service) UnarchiveRun(ctx context.Context, runID string) error {
	if err := s.store.Runs.Unarchive(ctx, runID); err != nil {
		return err
	}
	s.audit(ctx, "unarchive", "run", runID)
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

// AddRunItem adds a case to an open run — returning one item id per
// spec its case expanded into (add-parameterized-cases D5): a
// non-parameterized case returns a single-element slice, exactly one
// item as before this capability existed; a parameterized case returns
// one id per data row.
func (s *Service) AddRunItem(ctx context.Context, runID, caseID string) ([]string, error) {
	if caseID == "" {
		return nil, invalid("caseId is required")
	}
	runProjectID, err := s.store.Runs.ProjectID(ctx, runID)
	if err != nil {
		return nil, err
	}
	caseProjectID, err := s.store.Cases.ProjectID(ctx, caseID)
	if err != nil {
		return nil, err
	}
	if caseProjectID != runProjectID {
		return nil, invalid("case belongs to a different project")
	}
	specs, err := s.expandCaseIntoSpecs(ctx, caseID)
	if err != nil {
		return nil, err
	}
	ids, err := s.store.Runs.AddItemSpecs(ctx, runID, specs)
	if err != nil {
		return nil, runClosedAsConflict(err)
	}
	s.audit(ctx, "add_item", "run", runID)
	return ids, nil
}

func (s *Service) RunItems(ctx context.Context, runID, assignee string) ([]domain.RunItem, error) {
	return s.store.Runs.Items(ctx, runID, assignee)
}

// RunItemsPage is RunItems, cursor-paginated (add-cursor-pagination) —
// backs GET /runs/{runKey}/items. RunItems itself is untouched and keeps
// serving run comparison, which needs both runs' complete item sets.
func (s *Service) RunItemsPage(ctx context.Context, runID, assignee, cursor string, limit int) ([]domain.RunItem, string, error) {
	return s.store.Runs.ItemsPage(ctx, runID, assignee, cursor, limit)
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

	// Two paths (add-step-level-results, design.md): a caller-supplied
	// StepResults is used verbatim as this result's snapshot and then
	// synced into the item's live carry-forward state (below, after the
	// result is created); an omitted one means the interactive UI already
	// persisted steps incrementally, so the item's *current* live state is
	// what gets snapshotted — and is left untouched afterward (carry
	// forward, not reset).
	suppliedStepResults := len(res.StepResults) > 0
	if suppliedStepResults {
		if err := s.checkStepIndicesInBounds(ctx, itemID, res.StepResults); err != nil {
			return domain.Result{}, err
		}
	} else {
		live, err := s.store.Runs.StepStates(ctx, itemID)
		if err != nil {
			return domain.Result{}, err
		}
		res.StepResults = live
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
	if suppliedStepResults {
		// Keep the item's live, carry-forward state consistent with what
		// was just reported, so a later retest builds on it rather than
		// stale prior marks (design.md).
		for _, sr := range res.StepResults {
			if _, err := s.store.Runs.SetStepState(ctx, itemID, sr.StepIndex, sr.Verdict); err != nil {
				return domain.Result{}, err
			}
		}
	}
	s.audit(ctx, "record_result", "run_item", itemID)
	if result.Verdict == domain.VerdictFailed || result.Verdict == domain.VerdictBlocked {
		if projectID, caseKey, title, err := s.store.Runs.ItemSummary(ctx, itemID); err == nil {
			go s.dispatchWebhooks(context.WithoutCancel(ctx), projectID, webhookEvent{
				Event:     "result." + string(result.Verdict),
				EntityKey: caseKey,
				Title:     title,
				Timestamp: time.Now(),
			})
		}
	}
	return result, nil
}

// checkStepIndicesInBounds rejects any stepResults entry whose StepIndex
// falls outside itemID's pinned step count (add-step-level-results) — a
// client/security-relevant boundary re-validated server-side, never
// trusted from the request alone.
func (s *Service) checkStepIndicesInBounds(ctx context.Context, itemID string, stepResults []domain.StepResult) error {
	count, err := s.store.Runs.ItemStepCount(ctx, itemID)
	if err != nil {
		return err
	}
	for _, sr := range stepResults {
		if sr.StepIndex >= count {
			return invalid("step index %d is out of bounds (item has %d steps)", sr.StepIndex, count)
		}
	}
	return nil
}

// SetStepResult marks one step's verdict, independent of the item's
// overall verdict (add-step-level-results) — persisted immediately, not
// batched with RecordResult. Subject to the same assignee-restriction gate
// as recording a result, since this is the same execution surface.
func (s *Service) SetStepResult(ctx context.Context, itemID string, stepIndex int, verdict domain.Verdict) (domain.StepResult, error) {
	sr := domain.StepResult{StepIndex: stepIndex, Verdict: verdict}
	if err := sr.Validate(); err != nil {
		return domain.StepResult{}, invalid("%s", err)
	}
	if err := s.checkAssigneeRestriction(ctx, itemID); err != nil {
		return domain.StepResult{}, err
	}
	if err := s.checkStepIndicesInBounds(ctx, itemID, []domain.StepResult{sr}); err != nil {
		return domain.StepResult{}, err
	}
	return s.store.Runs.SetStepState(ctx, itemID, stepIndex, verdict)
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
