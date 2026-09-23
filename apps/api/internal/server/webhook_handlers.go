package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// mountWebhooks registers the destination-scoped delete route — the
// project-scoped list/create routes are mounted inline under
// /projects/{projectKey} in mountAPI, matching custom-fields' precedent
// (add-run-notifications).
func mountWebhooks(r chi.Router, h *api) {
	r.With(h.requirePermission(domain.PermManageProject, projectIDFromWebhook)).Delete("/webhooks/{webhookID}", h.removeWebhookDestination)
}

func (h *api) listWebhookDestinations(w http.ResponseWriter, r *http.Request) {
	destinations, err := h.svc.ListWebhookDestinations(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, destinations, err)
}

type webhookDestinationInput struct {
	URL string `json:"url"`
}

func (h *api) addWebhookDestination(w http.ResponseWriter, r *http.Request) {
	in, err := decode[webhookDestinationInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	dest, err := h.svc.AddWebhookDestination(r.Context(), resolvedID(r, "projectKey"), in.URL)
	h.respond(w, http.StatusCreated, dest, err)
}

func (h *api) removeWebhookDestination(w http.ResponseWriter, r *http.Request) {
	err := h.svc.RemoveWebhookDestination(r.Context(), chi.URLParam(r, "webhookID"))
	h.respond(w, http.StatusNoContent, nil, err)
}
