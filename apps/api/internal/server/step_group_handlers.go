package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// mountStepGroups registers the group-scoped step-group routes
// (get/update/delete) — the project-scoped list/create routes are
// mounted inline under /projects/{projectKey} in mountAPI, matching
// custom-fields' precedent (add-reusable-steps).
func mountStepGroups(r chi.Router, h *api) {
	r.Route("/step-groups/{groupID}", func(r chi.Router) {
		r.With(h.requirePermission(domain.PermRead, projectIDFromStepGroup)).Get("/", h.getStepGroup)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromStepGroup)).Put("/", h.updateStepGroup)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromStepGroup)).Delete("/", h.deleteStepGroup)
	})
}

type stepGroupInput struct {
	Name  string        `json:"name"`
	Steps []domain.Step `json:"steps"`
}

func (h *api) listStepGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.svc.ListStepGroups(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, groups, err)
}

func (h *api) createStepGroup(w http.ResponseWriter, r *http.Request) {
	in, err := decode[stepGroupInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	group, err := h.svc.CreateStepGroup(r.Context(), resolvedID(r, "projectKey"), in.Name, in.Steps)
	h.respond(w, http.StatusCreated, group, err)
}

func (h *api) getStepGroup(w http.ResponseWriter, r *http.Request) {
	group, err := h.svc.GetStepGroup(r.Context(), chi.URLParam(r, "groupID"))
	h.respond(w, http.StatusOK, group, err)
}

func (h *api) updateStepGroup(w http.ResponseWriter, r *http.Request) {
	in, err := decode[stepGroupInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	group, err := h.svc.UpdateStepGroup(r.Context(), chi.URLParam(r, "groupID"), in.Name, in.Steps)
	h.respond(w, http.StatusOK, group, err)
}

func (h *api) deleteStepGroup(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteStepGroup(r.Context(), chi.URLParam(r, "groupID"))
	h.respond(w, http.StatusNoContent, nil, err)
}
