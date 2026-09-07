package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// mountRoles registers the role CRUD routes, all Tenant-Admin only
// (add-project-rbac design.md D10 — fully custom, instance-wide roles).
func mountRoles(r chi.Router, h *api) {
	r.Route("/roles", func(r chi.Router) {
		r.Use(requireTenantAdmin)
		r.Get("/", h.listRoles)
		r.Post("/", h.createRole)
		r.Post("/reset", h.resetRoles)
		r.Patch("/{roleID}", h.updateRole)
		r.Delete("/{roleID}", h.deleteRole)
		r.Get("/{roleID}/deletion-preview", h.roleDeletionPreview)
	})
}

// roleInput's ten can* fields are design.md D11's concrete, per-resource
// permission flags (replacing an earlier set of five broader ones).
type roleInput struct {
	Name                   string `json:"name"`
	Rank                   int    `json:"rank"`
	CanRead                bool   `json:"canRead"`
	CanCaseCreate          bool   `json:"canCaseCreate"`
	CanCaseEdit            bool   `json:"canCaseEdit"`
	CanCaseDelete          bool   `json:"canCaseDelete"`
	CanSectionCreate       bool   `json:"canSectionCreate"`
	CanSectionEdit         bool   `json:"canSectionEdit"`
	CanSectionDelete       bool   `json:"canSectionDelete"`
	CanSuiteCreate         bool   `json:"canSuiteCreate"`
	CanSuiteEditMembership bool   `json:"canSuiteEditMembership"`
	CanRunCreate           bool   `json:"canRunCreate"`
	CanRunRecordResult     bool   `json:"canRunRecordResult"`
	CanManageProject       bool   `json:"canManageProject"`
	CanRunDelete           bool   `json:"canRunDelete"`
	CanProjectDelete       bool   `json:"canProjectDelete"`
}

func roleFromInput(in roleInput) domain.Role {
	return domain.Role{
		Name: in.Name, Rank: in.Rank, CanRead: in.CanRead,
		CanCaseCreate: in.CanCaseCreate, CanCaseEdit: in.CanCaseEdit, CanCaseDelete: in.CanCaseDelete,
		CanSectionCreate: in.CanSectionCreate, CanSectionEdit: in.CanSectionEdit, CanSectionDelete: in.CanSectionDelete,
		CanSuiteCreate: in.CanSuiteCreate, CanSuiteEditMembership: in.CanSuiteEditMembership,
		CanRunCreate: in.CanRunCreate, CanRunRecordResult: in.CanRunRecordResult,
		CanManageProject: in.CanManageProject,
		CanRunDelete:     in.CanRunDelete, CanProjectDelete: in.CanProjectDelete,
	}
}

func (h *api) listRoles(w http.ResponseWriter, r *http.Request) {
	cursor, limit := parsePageParams(r)
	roles, nextCursor, err := h.svc.ListRolesPage(r.Context(), cursor, limit)
	h.respond(w, http.StatusOK, newPagePayload(roles, nextCursor), err)
}

func (h *api) createRole(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[roleInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	role, err := h.svc.CreateRole(r.Context(), actor, roleFromInput(in))
	h.respond(w, http.StatusCreated, role, err)
}

func (h *api) updateRole(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[roleInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	role := roleFromInput(in)
	role.ID = chi.URLParam(r, "roleID")
	role, err = h.svc.UpdateRole(r.Context(), actor, role)
	h.respond(w, http.StatusOK, role, err)
}

func (h *api) deleteRole(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	err := h.svc.DeleteRole(r.Context(), actor, chi.URLParam(r, "roleID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) roleDeletionPreview(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	preview, err := h.svc.RoleDeletionPreview(r.Context(), actor, chi.URLParam(r, "roleID"))
	h.respond(w, http.StatusOK, preview, err)
}

// resetRoles restores Tester/Contributor/Project Admin to their factory
// flags in place — it does not delete or affect any other role (design.md
// D12).
func (h *api) resetRoles(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	roles, err := h.svc.ResetRolesToDefaults(r.Context(), actor)
	h.respond(w, http.StatusOK, roles, err)
}
