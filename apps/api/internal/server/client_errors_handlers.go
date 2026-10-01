package server

import (
	"net/http"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

type clientErrorReportInput struct {
	Kind           string `json:"kind"`
	Message        string `json:"message"`
	Stack          string `json:"stack"`
	ComponentStack string `json:"componentStack"`
	URL            string `json:"url"`
	Method         string `json:"method"`
	Path           string `json:"path"`
	Status         int    `json:"status"`
}

// recordClientError is pure visibility (add-frontend-error-reporting): the
// report is logged via Service.RecordClientError, never persisted or
// surfaced in any UI.
func (h *api) recordClientError(w http.ResponseWriter, r *http.Request) {
	in, err := decode[clientErrorReportInput](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.RecordClientError(r.Context(), domain.ClientErrorReport{
		Kind: in.Kind, Message: in.Message, Stack: in.Stack, ComponentStack: in.ComponentStack,
		URL: in.URL, Method: in.Method, Path: in.Path, Status: in.Status,
	})
	h.respond(w, http.StatusNoContent, nil, err)
}
