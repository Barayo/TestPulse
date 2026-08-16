package server

import (
	"net/http"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func (h *api) getInstanceSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.InstanceSettings(r.Context())
	h.respond(w, http.StatusOK, settings, err)
}

func (h *api) updateInstanceSettings(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		PublicProjectsEnabled   *bool `json:"publicProjectsEnabled"`
		RunRetentionDays        *int  `json:"runRetentionDays"`
		AutoArchiveInactiveDays *int  `json:"autoArchiveInactiveDays"`
	}](r)
	if err != nil || (body.PublicProjectsEnabled == nil && body.RunRetentionDays == nil && body.AutoArchiveInactiveDays == nil) {
		badBody(h, w)
		return
	}
	settings, err := h.svc.UpdateInstanceSettings(r.Context(), domain.InstanceSettingsUpdate{
		PublicProjectsEnabled:   body.PublicProjectsEnabled,
		RunRetentionDays:        body.RunRetentionDays,
		AutoArchiveInactiveDays: body.AutoArchiveInactiveDays,
	})
	h.respond(w, http.StatusOK, settings, err)
}
