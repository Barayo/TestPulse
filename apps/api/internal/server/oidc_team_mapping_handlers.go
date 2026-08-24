package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// mountOIDCTeamMappings registers the claim→Team mapping CRUD routes
// (add-sso-oidc design.md D10), Tenant-Admin only — the same authorization
// shape as every other instance-wide setting.
func mountOIDCTeamMappings(r chi.Router, h *api) {
	r.Route("/sso/team-mappings", func(r chi.Router) {
		r.Use(requireTenantAdmin)
		r.Get("/", h.listOIDCTeamMappings)
		r.Post("/", h.createOIDCTeamMapping)
		r.Delete("/{mappingID}", h.deleteOIDCTeamMapping)
	})
}

func (h *api) listOIDCTeamMappings(w http.ResponseWriter, r *http.Request) {
	mappings, err := h.svc.ListOIDCTeamMappings(r.Context())
	h.respond(w, http.StatusOK, mappings, err)
}

type oidcTeamMappingInput struct {
	ClaimValue string `json:"claimValue"`
	TeamID     string `json:"teamId"`
}

func (h *api) createOIDCTeamMapping(w http.ResponseWriter, r *http.Request) {
	in, err := decode[oidcTeamMappingInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	mapping, err := h.svc.CreateOIDCTeamMapping(r.Context(), in.ClaimValue, in.TeamID)
	h.respond(w, http.StatusCreated, mapping, err)
}

func (h *api) deleteOIDCTeamMapping(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteOIDCTeamMapping(r.Context(), chi.URLParam(r, "mappingID"))
	h.respond(w, http.StatusNoContent, nil, err)
}
