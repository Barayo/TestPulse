package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func (h *api) createImportJob(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Source      string            `json:"source"`
		Mode        string            `json:"mode"`
		Credentials map[string]string `json:"credentials"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	mode, err := domain.ParseImportMode(body.Mode)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	job, err := h.svc.CreateImportJob(r.Context(), resolvedID(r, "projectKey"), body.Source, mode, body.Credentials)
	h.respond(w, http.StatusCreated, job, err)
}

func (h *api) getImportJob(w http.ResponseWriter, r *http.Request) {
	job, err := h.svc.GetImportJob(r.Context(), chi.URLParam(r, "jobId"))
	h.respond(w, http.StatusOK, job, err)
}

// listImportJobs is what makes an abandoned/failed import discoverable at
// all (fix-import-wizard-orphaned-projects) — before this, a job with no
// UI-visible id was permanently invisible once its creating tab closed.
func (h *api) listImportJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.svc.ListImportJobsForProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, jobs, err)
}

// claimPendingImportJob is importer-facing: claims the oldest pending job
// for the caller's own scoped project and the requested source, returning
// its decrypted credentials. Only a per-project-scoped agent token may
// call this — Service.ClaimPendingImportJob rejects anyone else, since
// there's no project id in this route for requirePermission's usual
// per-resource resolver to check (design.md D3/D4).
func (h *api) claimPendingImportJob(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	job, credentials, ok, err := h.svc.ClaimPendingImportJob(r.Context(), source)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	if !ok {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": job, "credentials": credentials})
}

// patchImportJob is importer-facing: reports progress and/or terminal
// completion. A status field marks completion (report or error); absent
// status, progressCurrent/progressTotal update the running count.
func (h *api) patchImportJob(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		ProgressCurrent *int                 `json:"progressCurrent"`
		ProgressTotal   *int                 `json:"progressTotal"`
		Status          *string              `json:"status"`
		Report          *domain.ImportReport `json:"report"`
		Error           *string              `json:"error"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	jobID := chi.URLParam(r, "jobId")
	if body.Status != nil {
		status, perr := domain.ParseImportJobStatus(*body.Status)
		if perr != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": perr.Error()})
			return
		}
		err := h.svc.CompleteImportJob(r.Context(), jobID, status, body.Report, body.Error)
		h.respond(w, http.StatusNoContent, nil, err)
		return
	}
	current, total := 0, 0
	if body.ProgressCurrent != nil {
		current = *body.ProgressCurrent
	}
	if body.ProgressTotal != nil {
		total = *body.ProgressTotal
	}
	err = h.svc.ReportImportJobProgress(r.Context(), jobID, current, total)
	h.respond(w, http.StatusNoContent, nil, err)
}
