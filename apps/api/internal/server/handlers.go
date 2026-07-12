package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// mountAPI registers the domain routes under /api/v1.
func mountAPI(r chi.Router, logger *slog.Logger, svc *service.Service) {
	h := &api{logger: logger, svc: svc}

	r.Route("/projects", func(r chi.Router) {
		r.Get("/", h.listProjects)
		r.Post("/", h.createProject)
		r.Get("/{projectID}", h.getProject)
		r.Patch("/{projectID}", h.updateProject)
		r.Get("/{projectID}/cases", h.listCases)
		r.Post("/{projectID}/cases", h.createCase)
		r.Get("/{projectID}/folders", h.listFolders)
		r.Post("/{projectID}/folders", h.createFolder)
		r.Get("/{projectID}/suites", h.listSuites)
		r.Post("/{projectID}/suites", h.createSuite)
		r.Get("/{projectID}/runs", h.listRuns)
		r.Post("/{projectID}/runs", h.createRun)
	})
	r.Route("/cases/{caseID}", func(r chi.Router) {
		r.Get("/", h.getCase)
		r.Put("/", h.editCase)
		r.Delete("/", h.deleteCase)
		r.Get("/versions", h.listCaseVersions)
		r.Put("/folder", h.moveCase)
	})
	r.Delete("/folders/{folderID}", h.deleteFolder)
	r.Route("/suites/{suiteID}/cases/{caseID}", func(r chi.Router) {
		r.Put("/", h.addCaseToSuite)
		r.Delete("/", h.removeCaseFromSuite)
	})
	r.Route("/runs/{runID}", func(r chi.Router) {
		r.Get("/", h.getRun)
		r.Get("/items", h.listRunItems)
		r.Post("/items", h.addRunItem)
		r.Get("/summary", h.runSummary)
	})
	r.Route("/items/{itemID}", func(r chi.Router) {
		r.Get("/results", h.listResults)
		r.Post("/results", h.recordResult)
		r.Put("/status", h.updateItem)
	})
}

type api struct {
	logger *slog.Logger
	svc    *service.Service
}

// respond writes v as JSON, mapping domain errors to status codes.
func (h *api) respond(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		var verr *service.ValidationError
		switch {
		case errors.As(err, &verr):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		case errors.Is(err, store.ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		case errors.Is(err, store.ErrRootFolder):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		default:
			h.logger.Error("request failed", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		}
		return
	}
	if v == nil {
		w.WriteHeader(status)
		return
	}
	writeJSON(w, status, v)
}

func decode[T any](r *http.Request) (T, error) {
	var v T
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		return v, &service.ValidationError{}
	}
	return v, nil
}

func badBody(h *api, w http.ResponseWriter) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
}

// --- Projects ---

func (h *api) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.svc.ListProjects(r.Context())
	h.respond(w, http.StatusOK, projects, err)
}

func (h *api) createProject(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name string `json:"name"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	p, err := h.svc.CreateProject(r.Context(), body.Name)
	h.respond(w, http.StatusCreated, p, err)
}

func (h *api) getProject(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.GetProject(r.Context(), chi.URLParam(r, "projectID"))
	h.respond(w, http.StatusOK, p, err)
}

func (h *api) updateProject(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name     *string `json:"name"`
		Archived *bool   `json:"archived"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	p, err := h.svc.UpdateProject(r.Context(), chi.URLParam(r, "projectID"),
		service.ProjectUpdate{Name: body.Name, Archived: body.Archived})
	h.respond(w, http.StatusOK, p, err)
}

// --- Cases ---

func (h *api) listCases(w http.ResponseWriter, r *http.Request) {
	cases, err := h.svc.ListCases(r.Context(), chi.URLParam(r, "projectID"))
	h.respond(w, http.StatusOK, cases, err)
}

func (h *api) createCase(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		domain.CaseContent
		FolderID string `json:"folderId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	c, err := h.svc.CreateCase(r.Context(), chi.URLParam(r, "projectID"), body.FolderID, body.CaseContent)
	h.respond(w, http.StatusCreated, c, err)
}

func (h *api) getCase(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.GetCase(r.Context(), chi.URLParam(r, "caseID"))
	h.respond(w, http.StatusOK, c, err)
}

func (h *api) editCase(w http.ResponseWriter, r *http.Request) {
	content, err := decode[domain.CaseContent](r)
	if err != nil {
		badBody(h, w)
		return
	}
	c, err := h.svc.EditCase(r.Context(), chi.URLParam(r, "caseID"), content)
	h.respond(w, http.StatusOK, c, err)
}

func (h *api) deleteCase(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteCase(r.Context(), chi.URLParam(r, "caseID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) listCaseVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := h.svc.CaseVersions(r.Context(), chi.URLParam(r, "caseID"))
	h.respond(w, http.StatusOK, versions, err)
}

// --- Folders ---

func (h *api) listFolders(w http.ResponseWriter, r *http.Request) {
	folders, err := h.svc.ListFolders(r.Context(), chi.URLParam(r, "projectID"))
	h.respond(w, http.StatusOK, folders, err)
}

func (h *api) createFolder(w http.ResponseWriter, r *http.Request) {
	body, err := decode[domain.NewFolder](r)
	if err != nil {
		badBody(h, w)
		return
	}
	f, err := h.svc.CreateFolder(r.Context(), chi.URLParam(r, "projectID"), body)
	h.respond(w, http.StatusCreated, f, err)
}

func (h *api) moveCase(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		FolderID string `json:"folderId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.MoveCase(r.Context(), chi.URLParam(r, "caseID"), body.FolderID)
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) deleteFolder(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteFolder(r.Context(), chi.URLParam(r, "folderID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Suites ---

func (h *api) listSuites(w http.ResponseWriter, r *http.Request) {
	suites, err := h.svc.ListSuites(r.Context(), chi.URLParam(r, "projectID"))
	h.respond(w, http.StatusOK, suites, err)
}

func (h *api) createSuite(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name string `json:"name"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	s, err := h.svc.CreateSuite(r.Context(), chi.URLParam(r, "projectID"), body.Name)
	h.respond(w, http.StatusCreated, s, err)
}

func (h *api) addCaseToSuite(w http.ResponseWriter, r *http.Request) {
	err := h.svc.AddCaseToSuite(r.Context(), chi.URLParam(r, "suiteID"), chi.URLParam(r, "caseID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) removeCaseFromSuite(w http.ResponseWriter, r *http.Request) {
	err := h.svc.RemoveCaseFromSuite(r.Context(), chi.URLParam(r, "suiteID"), chi.URLParam(r, "caseID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Runs ---

func (h *api) listRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.svc.ListRuns(r.Context(), chi.URLParam(r, "projectID"))
	h.respond(w, http.StatusOK, runs, err)
}

func (h *api) createRun(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name    string   `json:"name"`
		SuiteID string   `json:"suiteId"`
		CaseIDs []string `json:"caseIds"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	run, err := h.svc.CreateRun(r.Context(), chi.URLParam(r, "projectID"),
		service.RunInput{Name: body.Name, SuiteID: body.SuiteID, CaseIDs: body.CaseIDs})
	h.respond(w, http.StatusCreated, run, err)
}

func (h *api) getRun(w http.ResponseWriter, r *http.Request) {
	run, err := h.svc.GetRun(r.Context(), chi.URLParam(r, "runID"))
	h.respond(w, http.StatusOK, run, err)
}

func (h *api) listRunItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.RunItems(r.Context(), chi.URLParam(r, "runID"), r.URL.Query().Get("assignee"))
	h.respond(w, http.StatusOK, items, err)
}

func (h *api) addRunItem(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		CaseID string `json:"caseId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	id, err := h.svc.AddRunItem(r.Context(), chi.URLParam(r, "runID"), body.CaseID)
	h.respond(w, http.StatusCreated, map[string]string{"id": id}, err)
}

func (h *api) runSummary(w http.ResponseWriter, r *http.Request) {
	sum, err := h.svc.RunSummary(r.Context(), chi.URLParam(r, "runID"))
	h.respond(w, http.StatusOK, sum, err)
}

// --- Items ---

func (h *api) listResults(w http.ResponseWriter, r *http.Request) {
	results, err := h.svc.Results(r.Context(), chi.URLParam(r, "itemID"))
	h.respond(w, http.StatusOK, results, err)
}

func (h *api) recordResult(w http.ResponseWriter, r *http.Request) {
	res, err := decode[domain.NewResult](r)
	if err != nil {
		badBody(h, w)
		return
	}
	out, err := h.svc.RecordResult(r.Context(), chi.URLParam(r, "itemID"), res)
	h.respond(w, http.StatusCreated, out, err)
}

func (h *api) updateItem(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Status   *string `json:"status"`
		Assignee *string `json:"assignee"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.UpdateItem(r.Context(), chi.URLParam(r, "itemID"),
		service.ItemUpdate{Status: body.Status, Assignee: body.Assignee})
	h.respond(w, http.StatusNoContent, nil, err)
}
