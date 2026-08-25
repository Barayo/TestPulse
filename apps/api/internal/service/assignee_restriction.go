package service

import (
	"context"
	"errors"
	"slices"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// checkAssigneeRestriction enforces a project's AssigneeRestrictedRecording
// setting (restrict-run-item-status-to-assignee design.md D1/D4): once
// enabled, only itemID's assignee (a matching user, or any member of the
// assigned team), a manageProject holder, or a Tenant Admin may record a
// result or change the item's status. An unassigned item, or a project with
// the setting off, is always permissive — this only ever narrows access
// relative to the caller's existing runRecordResult permission, never
// widens it.
func (s *Service) checkAssigneeRestriction(ctx context.Context, itemID string) error {
	projectID, err := s.store.Runs.ItemProjectID(ctx, itemID)
	if err != nil {
		return err
	}
	project, err := s.store.Projects.Get(ctx, projectID)
	if err != nil {
		return err
	}
	if !project.AssigneeRestrictedRecording {
		return nil
	}
	assignee, err := s.store.Runs.ItemAssignee(ctx, itemID)
	if err != nil {
		return err
	}
	if assignee == nil {
		return nil
	}

	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return forbidden("only the assigned user or team can act on this item")
	}
	if actor.IsTenantAdmin {
		return nil
	}

	switch assignee.Kind {
	case domain.AssigneeKindUser:
		if actor.EffectiveUserID == assignee.ID {
			return nil
		}
	case domain.AssigneeKindTeam:
		teamIDs, err := s.store.Teams.TeamIDsForUser(ctx, actor.EffectiveUserID)
		if err != nil {
			return err
		}
		if slices.Contains(teamIDs, assignee.ID) {
			return nil
		}
	}

	perms, err := s.EffectivePermissions(ctx, actor, projectID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return err
	}
	if perms.ManageProject {
		return nil
	}
	return forbidden("only the assigned user or team can act on this item")
}
