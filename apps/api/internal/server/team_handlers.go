package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// mountTeams registers the team CRUD/membership routes, all Tenant-Admin
// only (teams spec's "Team management"/"Team membership" requirements).
func mountTeams(r chi.Router, h *api) {
	r.Route("/teams", func(r chi.Router) {
		r.Use(requireTenantAdmin)
		r.Get("/", h.listTeams)
		r.Post("/", h.createTeam)
		r.Route("/{teamID}", func(r chi.Router) {
			r.Patch("/", h.renameTeam)
			r.Delete("/", h.deleteTeam)
			r.Get("/deletion-preview", h.teamDeletionPreview)
			r.Post("/members/{userID}", h.addTeamMember)
			r.Delete("/members/{userID}", h.removeTeamMember)
		})
	})
}

func (h *api) listTeams(w http.ResponseWriter, r *http.Request) {
	teams, err := h.svc.ListTeams(r.Context())
	h.respond(w, http.StatusOK, teams, err)
}

type teamInput struct {
	Name string `json:"name"`
}

func (h *api) createTeam(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[teamInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	team, err := h.svc.CreateTeam(r.Context(), actor, in.Name)
	h.respond(w, http.StatusCreated, team, err)
}

func (h *api) renameTeam(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[teamInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	team, err := h.svc.RenameTeam(r.Context(), actor, chi.URLParam(r, "teamID"), in.Name)
	h.respond(w, http.StatusOK, team, err)
}

func (h *api) deleteTeam(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	err := h.svc.DeleteTeam(r.Context(), actor, chi.URLParam(r, "teamID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) teamDeletionPreview(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	preview, err := h.svc.TeamDeletionPreview(r.Context(), actor, chi.URLParam(r, "teamID"))
	h.respond(w, http.StatusOK, preview, err)
}

func (h *api) addTeamMember(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	team, err := h.svc.AddTeamMember(r.Context(), actor, chi.URLParam(r, "teamID"), chi.URLParam(r, "userID"))
	h.respond(w, http.StatusOK, team, err)
}

func (h *api) removeTeamMember(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	team, err := h.svc.RemoveTeamMember(r.Context(), actor, chi.URLParam(r, "teamID"), chi.URLParam(r, "userID"))
	h.respond(w, http.StatusOK, team, err)
}
