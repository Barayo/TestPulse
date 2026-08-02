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

// mountAPI registers the domain routes under /api/v1. The caller mounts it
// behind the authenticate middleware (server.go) — every domain route
// requires an authenticated actor (authentication spec). Beyond that,
// requireTenantAdmin/requirePermission gate each route per the enforcement
// matrix in design.md D6/D11: read routes need `read`, each write route
// needs the one concrete per-resource flag that names it (e.g. `caseCreate`,
// `suiteEditMembership`, `runRecordResult`), project settings need
// `manageProject`, and project creation plus membership/role assignment
// are Tenant-Admin-only.
func mountAPI(r chi.Router, h *api) {
	r.Route("/projects", func(r chi.Router) {
		r.Get("/", h.listProjects)
		r.Get("/summaries", h.projectSummaries)
		r.With(requireTenantAdmin).Post("/", h.createProject)
		r.Route("/{projectKey}", func(r chi.Router) {
			r.Use(h.resolveKey("projectKey", h.svc.ProjectIDByKey))
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/", h.getProject)
			r.With(h.requirePermission(domain.PermManageProject, projectIDParam)).Patch("/", h.updateProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Post("/favorite", h.starProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Delete("/favorite", h.unstarProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/cases", h.listCases)
			r.With(h.requirePermission(domain.PermCaseCreate, projectIDParam)).Post("/cases", h.createCase)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/folders", h.listFolders)
			r.With(h.requirePermission(domain.PermSectionCreate, projectIDParam)).Post("/folders", h.createFolder)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/flaky-cases", h.flakyCases)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/suites", h.listSuites)
			r.With(h.requirePermission(domain.PermSuiteCreate, projectIDParam)).Post("/suites", h.createSuite)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/runs", h.listRuns)
			r.With(h.requirePermission(domain.PermRunCreate, projectIDParam)).Post("/runs", h.createRun)
			r.With(h.requirePermission(domain.PermRunCreate, projectIDParam)).Post("/imports", h.importResults)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/members", h.getProjectMembership)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/permissions", h.myPermissions)
			r.With(requireTenantAdmin).Put("/members/{userID}", h.setProjectMember)
			r.With(requireTenantAdmin).Delete("/members/{userID}", h.removeProjectMember)
			r.With(requireTenantAdmin).Put("/teams/{teamID}", h.setProjectTeamRole)
			r.With(requireTenantAdmin).Delete("/teams/{teamID}", h.removeProjectTeamRole)
		})
	})
	r.Route("/cases/{caseKey}", func(r chi.Router) {
		r.Use(h.resolveKey("caseKey", h.svc.CaseIDByKey))
		r.With(h.requirePermission(domain.PermRead, projectIDFromCase)).Get("/", h.getCase)
		r.With(h.requirePermission(domain.PermCaseEdit, projectIDFromCase)).Put("/", h.editCase)
		r.With(h.requirePermission(domain.PermCaseDelete, projectIDFromCase)).Delete("/", h.deleteCase)
		r.With(h.requirePermission(domain.PermRead, projectIDFromCase)).Get("/versions", h.listCaseVersions)
		r.With(h.requirePermission(domain.PermRead, projectIDFromCase)).Get("/executions", h.listCaseExecutions)
		r.With(h.requirePermission(domain.PermCaseEdit, projectIDFromCase)).Put("/folder", h.moveCase)
	})
	r.With(h.requirePermission(domain.PermSectionDelete, projectIDFromFolder)).Delete("/folders/{folderID}", h.deleteFolder)
	r.With(h.requirePermission(domain.PermSectionDelete, projectIDFromFolder)).Get("/folders/{folderID}/delete-preview", h.folderDeletePreview)
	r.Route("/suites/{suiteKey}/cases/{caseKey}", func(r chi.Router) {
		r.Use(h.resolveKey("suiteKey", h.svc.SuiteIDByKey), h.resolveKey("caseKey", h.svc.CaseIDByKey))
		r.With(h.requirePermission(domain.PermSuiteEditMembership, projectIDFromSuite)).Put("/", h.addCaseToSuite)
		r.With(h.requirePermission(domain.PermSuiteEditMembership, projectIDFromSuite)).Delete("/", h.removeCaseFromSuite)
	})
	r.Route("/suites/{suiteKey}", func(r chi.Router) {
		r.Use(h.resolveKey("suiteKey", h.svc.SuiteIDByKey))
		r.With(h.requirePermission(domain.PermRead, projectIDFromSuite)).Get("/", h.getSuite)
		r.With(h.requirePermission(domain.PermSuiteEditMembership, projectIDFromSuite)).Put("/", h.renameSuite)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromSuite)).Delete("/", h.deleteSuite)
		r.With(h.requirePermission(domain.PermRead, projectIDFromSuite)).Get("/trend", h.suiteTrend)
	})
	r.Route("/runs/{runKey}", func(r chi.Router) {
		r.Use(h.resolveKey("runKey", h.svc.RunIDByKey))
		r.With(h.requirePermission(domain.PermRead, projectIDFromRun)).Get("/", h.getRun)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromRun)).Post("/close", h.closeRun)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromRun)).Post("/reopen", h.reopenRun)
		r.With(h.requirePermission(domain.PermRead, projectIDFromRun)).Get("/items", h.listRunItems)
		r.With(h.requirePermission(domain.PermRunCreate, projectIDFromRun)).Post("/items", h.addRunItem)
		r.With(h.requirePermission(domain.PermRead, projectIDFromRun)).Get("/summary", h.runSummary)
	})
	r.Route("/items/{itemID}", func(r chi.Router) {
		r.With(h.requirePermission(domain.PermRead, projectIDFromItem)).Get("/results", h.listResults)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Post("/results", h.recordResult)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Put("/status", h.updateItem)
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
		var uerr *service.UnauthorizedError
		var ferr *service.ForbiddenError
		var cerr *service.ConflictError
		switch {
		case errors.As(err, &verr):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		case errors.As(err, &uerr):
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		case errors.As(err, &ferr):
			writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		case errors.As(err, &cerr):
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
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

func (h *api) projectSummaries(w http.ResponseWriter, r *http.Request) {
	summaries, err := h.svc.ProjectSummaries(r.Context())
	h.respond(w, http.StatusOK, summaries, err)
}

func (h *api) createProject(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	p, err := h.svc.CreateProject(r.Context(), service.ProjectInput{
		Name: body.Name, Description: body.Description,
	})
	h.respond(w, http.StatusCreated, p, err)
}

func (h *api) getProject(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.GetProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, p, err)
}

func (h *api) updateProject(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Archived    *bool   `json:"archived"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	p, err := h.svc.UpdateProject(r.Context(), resolvedID(r, "projectKey"),
		service.ProjectUpdate{
			Name: body.Name, Description: body.Description, Archived: body.Archived,
		})
	h.respond(w, http.StatusOK, p, err)
}

func (h *api) starProject(w http.ResponseWriter, r *http.Request) {
	err := h.svc.StarProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) unstarProject(w http.ResponseWriter, r *http.Request) {
	err := h.svc.UnstarProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Project membership (add-project-rbac) ---

func (h *api) getProjectMembership(w http.ResponseWriter, r *http.Request) {
	m, err := h.svc.ProjectMembership(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, m, err)
}

func (h *api) myPermissions(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	perms, err := h.svc.MyPermissions(r.Context(), actor, resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, perms, err)
}

func (h *api) setProjectMember(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[struct {
		RoleID string `json:"roleId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.SetProjectMember(r.Context(), actor, resolvedID(r, "projectKey"), chi.URLParam(r, "userID"), in.RoleID)
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) removeProjectMember(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	err := h.svc.RemoveProjectMember(r.Context(), actor, resolvedID(r, "projectKey"), chi.URLParam(r, "userID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) setProjectTeamRole(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	in, err := decode[struct {
		RoleID string `json:"roleId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.SetProjectTeamRole(r.Context(), actor, resolvedID(r, "projectKey"), chi.URLParam(r, "teamID"), in.RoleID)
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) removeProjectTeamRole(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	err := h.svc.RemoveProjectTeamRole(r.Context(), actor, resolvedID(r, "projectKey"), chi.URLParam(r, "teamID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Cases ---

func (h *api) listCases(w http.ResponseWriter, r *http.Request) {
	cases, err := h.svc.ListCases(r.Context(), resolvedID(r, "projectKey"))
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
	c, err := h.svc.CreateCase(r.Context(), resolvedID(r, "projectKey"), body.FolderID, body.CaseContent)
	h.respond(w, http.StatusCreated, c, err)
}

func (h *api) getCase(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.GetCase(r.Context(), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusOK, c, err)
}

func (h *api) editCase(w http.ResponseWriter, r *http.Request) {
	content, err := decode[domain.CaseContent](r)
	if err != nil {
		badBody(h, w)
		return
	}
	c, err := h.svc.EditCase(r.Context(), resolvedID(r, "caseKey"), content)
	h.respond(w, http.StatusOK, c, err)
}

func (h *api) deleteCase(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteCase(r.Context(), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) listCaseVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := h.svc.CaseVersions(r.Context(), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusOK, versions, err)
}

func (h *api) listCaseExecutions(w http.ResponseWriter, r *http.Request) {
	execs, err := h.svc.CaseExecutions(r.Context(), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusOK, execs, err)
}

// --- Folders ---

func (h *api) listFolders(w http.ResponseWriter, r *http.Request) {
	folders, err := h.svc.ListFolders(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, folders, err)
}

func (h *api) createFolder(w http.ResponseWriter, r *http.Request) {
	body, err := decode[domain.NewFolder](r)
	if err != nil {
		badBody(h, w)
		return
	}
	f, err := h.svc.CreateFolder(r.Context(), resolvedID(r, "projectKey"), body)
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
	err = h.svc.MoveCase(r.Context(), resolvedID(r, "caseKey"), body.FolderID)
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) deleteFolder(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteFolder(r.Context(), chi.URLParam(r, "folderID"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) folderDeletePreview(w http.ResponseWriter, r *http.Request) {
	preview, err := h.svc.FolderDeletePreview(r.Context(), chi.URLParam(r, "folderID"))
	h.respond(w, http.StatusOK, preview, err)
}

// --- Suites ---

func (h *api) listSuites(w http.ResponseWriter, r *http.Request) {
	suites, err := h.svc.ListSuites(r.Context(), resolvedID(r, "projectKey"))
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
	s, err := h.svc.CreateSuite(r.Context(), resolvedID(r, "projectKey"), body.Name)
	h.respond(w, http.StatusCreated, s, err)
}

func (h *api) getSuite(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.GetSuite(r.Context(), resolvedID(r, "suiteKey"))
	h.respond(w, http.StatusOK, s, err)
}

func (h *api) renameSuite(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name string `json:"name"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	s, err := h.svc.RenameSuite(r.Context(), resolvedID(r, "suiteKey"), body.Name)
	h.respond(w, http.StatusOK, s, err)
}

func (h *api) deleteSuite(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteSuite(r.Context(), resolvedID(r, "suiteKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) addCaseToSuite(w http.ResponseWriter, r *http.Request) {
	err := h.svc.AddCaseToSuite(r.Context(), resolvedID(r, "suiteKey"), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) removeCaseFromSuite(w http.ResponseWriter, r *http.Request) {
	err := h.svc.RemoveCaseFromSuite(r.Context(), resolvedID(r, "suiteKey"), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Runs ---

func (h *api) listRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.svc.ListRuns(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, runs, err)
}

func (h *api) createRun(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name     string   `json:"name"`
		SuiteKey string   `json:"suiteKey"`
		CaseKeys []string `json:"caseKeys"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	var suiteID string
	if body.SuiteKey != "" {
		suiteID, err = h.svc.SuiteIDByKey(r.Context(), body.SuiteKey)
		if err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	caseIDs := make([]string, len(body.CaseKeys))
	for i, key := range body.CaseKeys {
		caseIDs[i], err = h.svc.CaseIDByKey(r.Context(), key)
		if err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	run, err := h.svc.CreateRun(r.Context(), resolvedID(r, "projectKey"),
		service.RunInput{Name: body.Name, SuiteID: suiteID, CaseIDs: caseIDs})
	h.respond(w, http.StatusCreated, run, err)
}

// unmatchedTestJSON is the wire shape of one unmatched entry in an
// import's 207 response body.
type unmatchedTestJSON struct {
	CaseKey string         `json:"caseKey"`
	Verdict domain.Verdict `json:"verdict"`
}

// importResultJSON is the wire shape of a 207 import response
// (openapi.yaml's ImportResult schema).
type importResultJSON struct {
	Run       domain.Run          `json:"run"`
	Message   string              `json:"message"`
	Matched   int                 `json:"matched"`
	Unmatched []unmatchedTestJSON `json:"unmatched"`
}

func (h *api) importResults(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Format string `json:"format"`
		Name   string `json:"name"`
		Report string `json:"report"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	result, err := h.svc.Import(r.Context(), resolvedID(r, "projectKey"), service.ImportInput{
		Format: body.Format, Name: body.Name, Report: body.Report,
	})
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	if len(result.Unmatched) == 0 {
		h.respond(w, http.StatusCreated, result.Run, nil)
		return
	}
	unmatched := make([]unmatchedTestJSON, len(result.Unmatched))
	for i, u := range result.Unmatched {
		unmatched[i] = unmatchedTestJSON{CaseKey: u.CaseKey, Verdict: u.Verdict}
	}
	h.respond(w, http.StatusMultiStatus, importResultJSON{
		Run:       result.Run,
		Message:   "Success but unmatched cases ignored",
		Matched:   result.Matched,
		Unmatched: unmatched,
	}, nil)
}

func (h *api) getRun(w http.ResponseWriter, r *http.Request) {
	run, err := h.svc.GetRun(r.Context(), resolvedID(r, "runKey"))
	h.respond(w, http.StatusOK, run, err)
}

func (h *api) closeRun(w http.ResponseWriter, r *http.Request) {
	err := h.svc.CloseRun(r.Context(), resolvedID(r, "runKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) reopenRun(w http.ResponseWriter, r *http.Request) {
	err := h.svc.ReopenRun(r.Context(), resolvedID(r, "runKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) listRunItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.RunItems(r.Context(), resolvedID(r, "runKey"), r.URL.Query().Get("assignee"))
	h.respond(w, http.StatusOK, items, err)
}

func (h *api) addRunItem(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		CaseKey string `json:"caseKey"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	caseID, err := h.svc.CaseIDByKey(r.Context(), body.CaseKey)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	id, err := h.svc.AddRunItem(r.Context(), resolvedID(r, "runKey"), caseID)
	h.respond(w, http.StatusCreated, map[string]string{"id": id}, err)
}

func (h *api) runSummary(w http.ResponseWriter, r *http.Request) {
	sum, err := h.svc.RunSummary(r.Context(), resolvedID(r, "runKey"))
	h.respond(w, http.StatusOK, sum, err)
}

func (h *api) suiteTrend(w http.ResponseWriter, r *http.Request) {
	trend, err := h.svc.SuiteTrend(r.Context(), resolvedID(r, "suiteKey"))
	h.respond(w, http.StatusOK, trend, err)
}

func (h *api) flakyCases(w http.ResponseWriter, r *http.Request) {
	flaky, err := h.svc.FlakyCases(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, flaky, err)
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
		Status         *string `json:"status"`
		AssigneeUserID *string `json:"assigneeUserId"`
		AssigneeTeamID *string `json:"assigneeTeamId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	err = h.svc.UpdateItem(r.Context(), chi.URLParam(r, "itemID"),
		service.ItemUpdate{Status: body.Status, AssigneeUserID: body.AssigneeUserID, AssigneeTeamID: body.AssigneeTeamID})
	h.respond(w, http.StatusNoContent, nil, err)
}
