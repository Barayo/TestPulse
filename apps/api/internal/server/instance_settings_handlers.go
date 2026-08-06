package server

import "net/http"

func (h *api) updateInstanceSettings(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		PublicProjectsEnabled *bool `json:"publicProjectsEnabled"`
	}](r)
	if err != nil || body.PublicProjectsEnabled == nil {
		badBody(h, w)
		return
	}
	if err := h.svc.SetPublicProjectsEnabled(r.Context(), *body.PublicProjectsEnabled); err != nil {
		h.respond(w, http.StatusOK, nil, err)
		return
	}
	settings, err := h.svc.InstanceSettings(r.Context())
	h.respond(w, http.StatusOK, settings, err)
}
