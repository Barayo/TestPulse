package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

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
	r.Get("/tags", h.listTagNames)
	r.Route("/projects", func(r chi.Router) {
		r.Get("/", h.listProjects)
		r.Get("/summaries", h.projectSummaries)
		r.With(requireTenantAdmin).Post("/", h.createProject)
		r.Route("/{projectKey}", func(r chi.Router) {
			r.Use(h.resolveKey("projectKey", h.svc.ProjectIDByKey))
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/", h.getProject)
			r.With(h.requirePermission(domain.PermManageProject, projectIDParam)).Patch("/", h.updateProject)
			r.With(h.requirePermission(domain.PermProjectDelete, projectIDParam)).Delete("/", h.deleteProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Post("/favorite", h.starProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Delete("/favorite", h.unstarProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Put("/tags/{tagName}", h.assignProjectTag)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Delete("/tags/{tagName}", h.removeProjectTag)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/cases", h.listCases)
			r.With(h.requirePermission(domain.PermCaseCreate, projectIDParam)).Post("/cases", h.createCase)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/folders", h.listFolders)
			r.With(h.requirePermission(domain.PermSectionCreate, projectIDParam)).Post("/folders", h.createFolder)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/flaky-cases", h.flakyCases)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/suites", h.listSuites)
			r.With(h.requirePermission(domain.PermSuiteCreate, projectIDParam)).Post("/suites", h.createSuite)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/runs", h.listRuns)
			r.With(h.requirePermission(domain.PermRunCreate, projectIDParam)).Post("/runs", h.createRun)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/runs/status-summary", h.projectStatusSummary)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/releases", h.listReleases)
			r.With(h.requirePermission(domain.PermManageProject, projectIDParam)).Post("/releases", h.createRelease)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/plans", h.listTestPlansByProject)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/custom-fields", h.listCustomFields)
			r.With(h.requirePermission(domain.PermManageProject, projectIDParam)).Post("/custom-fields", h.createCustomField)
			r.With(h.requirePermission(domain.PermManageProject, projectIDParam)).Put("/custom-fields/order", h.reorderCustomFields)
			r.With(h.requirePermission(domain.PermRead, projectIDParam)).Get("/step-groups", h.listStepGroups)
			r.With(h.requirePermission(domain.PermManageProject, projectIDParam)).Post("/step-groups", h.createStepGroup)
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
		r.With(h.requirePermission(domain.PermCaseEdit, projectIDFromCase)).Post("/versions/{version}/restore", h.restoreCaseVersion)
		r.With(h.requirePermission(domain.PermRead, projectIDFromCase)).Get("/executions", h.listCaseExecutions)
		r.With(h.requirePermission(domain.PermCaseEdit, projectIDFromCase)).Put("/folder", h.moveCase)
		r.With(h.requirePermission(domain.PermCaseEdit, projectIDFromCase)).Put("/jira-link", h.setCaseJiraLink)
		r.With(h.requirePermission(domain.PermCaseEdit, projectIDFromCase)).Put("/jira-sync", h.setCaseJiraSync)
	})
	r.With(h.requirePermission(domain.PermSectionEdit, projectIDFromFolder)).Put("/folders/{folderID}", h.moveFolder)
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
		r.With(h.requirePermission(domain.PermRunDelete, projectIDFromRun)).Delete("/", h.deleteRun)
		r.With(h.requirePermission(domain.PermRead, projectIDFromRun)).Get("/items", h.listRunItems)
		r.With(h.requirePermission(domain.PermRunCreate, projectIDFromRun)).Post("/items", h.addRunItem)
		r.With(h.requirePermission(domain.PermRead, projectIDFromRun)).Get("/summary", h.runSummary)
		r.Route("/compare/{otherRunKey}", func(r chi.Router) {
			r.Use(h.resolveKey("otherRunKey", h.svc.RunIDByKey))
			r.With(h.requirePermission(domain.PermRead, projectIDFromRun)).Get("/", h.compareRuns)
		})
	})
	r.Route("/releases/{releaseKey}", func(r chi.Router) {
		r.Use(h.resolveKey("releaseKey", h.svc.ReleaseIDByKey))
		r.With(h.requirePermission(domain.PermRead, projectIDFromRelease)).Get("/", h.getRelease)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromRelease)).Put("/", h.updateRelease)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromRelease)).Delete("/", h.deleteRelease)
		r.With(h.requirePermission(domain.PermRead, projectIDFromRelease)).Get("/rollup", h.releaseRollup)
		r.With(h.requirePermission(domain.PermRead, projectIDFromRelease)).Get("/plans", h.listTestPlans)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromRelease)).Post("/plans", h.createTestPlan)
	})
	r.Route("/plans/{planKey}", func(r chi.Router) {
		r.Use(h.resolveKey("planKey", h.svc.TestPlanIDByKey))
		r.With(h.requirePermission(domain.PermRead, projectIDFromTestPlan)).Get("/", h.getTestPlan)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromTestPlan)).Put("/", h.updateTestPlan)
		r.With(h.requirePermission(domain.PermManageProject, projectIDFromTestPlan)).Delete("/", h.deleteTestPlan)
		r.With(h.requirePermission(domain.PermRead, projectIDFromTestPlan)).Get("/rollup", h.testPlanRollup)
		r.With(h.requirePermission(domain.PermRead, projectIDFromTestPlan)).Get("/runs", h.listRunsByTestPlan)
	})
	r.Route("/items/{itemID}", func(r chi.Router) {
		r.With(h.requirePermission(domain.PermRead, projectIDFromItem)).Get("/results", h.listResults)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Post("/results", h.recordResult)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Put("/status", h.updateItem)
		r.With(h.requirePermission(domain.PermRead, projectIDFromItem)).Get("/attachments", h.listStagedAttachments)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Post("/attachments", h.stageAttachment)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Put("/jira-link", h.setItemJiraLink)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromItem)).Put("/jira-sync", h.setItemJiraSync)
	})
	r.Route("/results/{resultID}", func(r chi.Router) {
		r.With(h.requirePermission(domain.PermRead, projectIDFromResult)).Get("/attachments", h.listResultAttachments)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromResult)).Post("/attachments", h.attachToResult)
	})
	r.Route("/attachments/{attachmentID}", func(r chi.Router) {
		r.With(h.requirePermission(domain.PermRead, projectIDFromAttachment)).Get("/", h.getAttachment)
		r.With(h.requirePermission(domain.PermRunRecordResult, projectIDFromAttachment)).Delete("/", h.deleteAttachment)
	})
}

type api struct {
	logger *slog.Logger
	svc    *service.Service
	// oidcManager holds the current OIDC authenticator, nil whenever
	// OIDC/SSO isn't configured (add-sso-oidc) — oidcLogin/oidcCallback
	// 404 in that case. Swappable at runtime (design.md D8), never a fixed
	// value set once at construction.
	oidcManager *OIDCManager
	// publicURL/encryptionKey are boot-time config (SSOConfig) needed to
	// (re)build an OIDCAuthenticator when SSO settings are saved.
	publicURL     string
	encryptionKey string
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
		case errors.Is(err, store.ErrRootFolder), errors.Is(err, store.ErrFolderCycle):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		case errors.Is(err, store.ErrInvalidCursor):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		case errors.Is(err, store.ErrHasChildren):
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
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
		Name                        *string `json:"name"`
		Description                 *string `json:"description"`
		Archived                    *bool   `json:"archived"`
		PublicAccess                *bool   `json:"publicAccess"`
		AutoArchiveExempt           *bool   `json:"autoArchiveExempt"`
		AssigneeRestrictedRecording *bool   `json:"assigneeRestrictedRecording"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	p, err := h.svc.UpdateProject(r.Context(), resolvedID(r, "projectKey"),
		service.ProjectUpdate{
			Name: body.Name, Description: body.Description, Archived: body.Archived,
			PublicAccess: body.PublicAccess, AutoArchiveExempt: body.AutoArchiveExempt,
			AssigneeRestrictedRecording: body.AssigneeRestrictedRecording,
		})
	h.respond(w, http.StatusOK, p, err)
}

// deleteProject queues an already-archived project for background
// deletion (add-data-retention design.md D6) — 202, not 204: the delete
// itself hasn't finished, only been accepted and hidden from listings.
func (h *api) deleteProject(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusAccepted, nil, err)
}

func (h *api) starProject(w http.ResponseWriter, r *http.Request) {
	err := h.svc.StarProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) unstarProject(w http.ResponseWriter, r *http.Request) {
	err := h.svc.UnstarProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

// --- Tags (add-project-tags) ---

func (h *api) assignProjectTag(w http.ResponseWriter, r *http.Request) {
	err := h.svc.AssignProjectTag(r.Context(), resolvedID(r, "projectKey"), chi.URLParam(r, "tagName"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) removeProjectTag(w http.ResponseWriter, r *http.Request) {
	err := h.svc.RemoveProjectTag(r.Context(), resolvedID(r, "projectKey"), chi.URLParam(r, "tagName"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) listTagNames(w http.ResponseWriter, r *http.Request) {
	names, err := h.svc.ListTagNames(r.Context())
	h.respond(w, http.StatusOK, names, err)
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
	// jiraLinked is never paginated (a project's jira-linked cases are
	// inherently a small subset) — nextCursor is always null on this
	// branch, but the envelope shape stays identical either way.
	if r.URL.Query().Get("jiraLinked") == "true" {
		cases, err := h.svc.ListJiraLinkedCases(r.Context(), resolvedID(r, "projectKey"))
		h.respond(w, http.StatusOK, newPagePayload(cases, ""), err)
		return
	}
	cursor, limit := parsePageParams(r)
	cases, nextCursor, err := h.svc.ListCasesPage(r.Context(), resolvedID(r, "projectKey"), cursor, limit)
	h.respond(w, http.StatusOK, newPagePayload(cases, nextCursor), err)
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

func (h *api) restoreCaseVersion(w http.ResponseWriter, r *http.Request) {
	version, err := strconv.Atoi(chi.URLParam(r, "version"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid version"})
		return
	}
	c, err := h.svc.RestoreVersion(r.Context(), resolvedID(r, "caseKey"), version)
	h.respond(w, http.StatusCreated, c, err)
}

// listCaseExecutions serves both the version-grouped default (no params)
// and the bounded, recency-ordered mode (order=recent&limit=N) over the
// same route (add-case-result-history design.md: one endpoint, additive
// query params, not a new endpoint). public_handlers.go routes here too.
func (h *api) listCaseExecutions(w http.ResponseWriter, r *http.Request) {
	order := r.URL.Query().Get("order")
	limitStr := r.URL.Query().Get("limit")
	if order != "recent" {
		if limitStr != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "limit requires order=recent"})
			return
		}
		execs, err := h.svc.CaseExecutions(r.Context(), resolvedID(r, "caseKey"))
		h.respond(w, http.StatusOK, execs, err)
		return
	}
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "limit is required and must be an integer when order=recent"})
		return
	}
	execs, err := h.svc.RecentCaseExecutions(r.Context(), resolvedID(r, "caseKey"), limit)
	h.respond(w, http.StatusOK, execs, err)
}

// --- Folders ---

func (h *api) listFolders(w http.ResponseWriter, r *http.Request) {
	cursor, limit := parsePageParams(r)
	folders, nextCursor, err := h.svc.ListFoldersPage(r.Context(), resolvedID(r, "projectKey"), cursor, limit)
	h.respond(w, http.StatusOK, newPagePayload(folders, nextCursor), err)
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

// setCaseJiraLink sets or clears a case's Jira issue key (add-jira-connector)
// — a dedicated endpoint, never the content-edit endpoint, since it's
// identity-level metadata independent of the case's versioned content.
func (h *api) setCaseJiraLink(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		JiraIssueKey *string `json:"jiraIssueKey"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	c, err := h.svc.SetCaseJiraLink(r.Context(), resolvedID(r, "caseKey"), body.JiraIssueKey)
	h.respond(w, http.StatusOK, c, err)
}

// setCaseJiraSync writes the Jira connector's cached issue summary/status
// for a case (add-jira-connector). Not reachable without an existing
// jiraIssueKey — the service returns a 409 otherwise.
func (h *api) setCaseJiraSync(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		JiraIssueSummary string `json:"jiraIssueSummary"`
		JiraIssueStatus  string `json:"jiraIssueStatus"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	c, err := h.svc.SetCaseJiraSync(r.Context(), resolvedID(r, "caseKey"), body.JiraIssueSummary, body.JiraIssueStatus)
	h.respond(w, http.StatusOK, c, err)
}

func (h *api) moveFolder(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		ParentFolderID string `json:"parentFolderId"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	f, err := h.svc.MoveFolder(r.Context(), chi.URLParam(r, "folderID"), body.ParentFolderID)
	h.respond(w, http.StatusOK, f, err)
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
	cursor, limit := parsePageParams(r)
	suites, nextCursor, err := h.svc.ListSuitesPage(r.Context(), resolvedID(r, "projectKey"), cursor, limit)
	h.respond(w, http.StatusOK, newPagePayload(suites, nextCursor), err)
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
	cursor, limit := parsePageParams(r)
	runs, nextCursor, err := h.svc.ListRunsPage(r.Context(), resolvedID(r, "projectKey"), cursor, limit)
	h.respond(w, http.StatusOK, newPagePayload(runs, nextCursor), err)
}

func (h *api) createRun(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        string   `json:"name"`
		SuiteKey    string   `json:"suiteKey"`
		TestPlanKey string   `json:"testPlanKey"`
		CaseKeys    []string `json:"caseKeys"`
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
	var testPlanID string
	if body.TestPlanKey != "" {
		testPlanID, err = h.svc.TestPlanIDByKey(r.Context(), body.TestPlanKey)
		if err != nil {
			h.respond(w, 0, nil, err)
			return
		}
	}
	caseIDs, err := h.svc.CaseIDsByKeys(r.Context(), body.CaseKeys)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	run, err := h.svc.CreateRun(r.Context(), resolvedID(r, "projectKey"),
		service.RunInput{Name: body.Name, SuiteID: suiteID, TestPlanID: testPlanID, CaseIDs: caseIDs})
	h.respond(w, http.StatusCreated, run, err)
}

// --- Releases & Test Plans ---

func (h *api) listReleases(w http.ResponseWriter, r *http.Request) {
	status := domain.ReleaseStatus(r.URL.Query().Get("status"))
	releases, err := h.svc.ListReleases(r.Context(), resolvedID(r, "projectKey"), status)
	h.respond(w, http.StatusOK, releases, err)
}

func (h *api) createRelease(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        string              `json:"name"`
		Description string              `json:"description"`
		Status      domain.ReleaseStatus `json:"status"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	rel, err := h.svc.CreateRelease(r.Context(), resolvedID(r, "projectKey"), body.Name, body.Description, body.Status)
	h.respond(w, http.StatusCreated, rel, err)
}

func (h *api) getRelease(w http.ResponseWriter, r *http.Request) {
	rel, err := h.svc.GetRelease(r.Context(), resolvedID(r, "releaseKey"))
	h.respond(w, http.StatusOK, rel, err)
}

func (h *api) updateRelease(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        string              `json:"name"`
		Description string              `json:"description"`
		Status      domain.ReleaseStatus `json:"status"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	rel, err := h.svc.UpdateRelease(r.Context(), resolvedID(r, "releaseKey"), body.Name, body.Description, body.Status)
	h.respond(w, http.StatusOK, rel, err)
}

func (h *api) deleteRelease(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteRelease(r.Context(), resolvedID(r, "releaseKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) releaseRollup(w http.ResponseWriter, r *http.Request) {
	rollup, err := h.svc.ReleaseRollup(r.Context(), resolvedID(r, "releaseKey"))
	h.respond(w, http.StatusOK, rollup, err)
}

func (h *api) listTestPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.svc.ListTestPlans(r.Context(), resolvedID(r, "releaseKey"))
	h.respond(w, http.StatusOK, plans, err)
}

func (h *api) listTestPlansByProject(w http.ResponseWriter, r *http.Request) {
	plans, err := h.svc.ListTestPlansByProject(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, plans, err)
}

func (h *api) createTestPlan(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	releaseID := resolvedID(r, "releaseKey")
	projectID, err := h.svc.ProjectIDForRelease(r.Context(), releaseID)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}
	plan, err := h.svc.CreateTestPlan(r.Context(), projectID, releaseID, body.Name, body.Description)
	h.respond(w, http.StatusCreated, plan, err)
}

func (h *api) getTestPlan(w http.ResponseWriter, r *http.Request) {
	plan, err := h.svc.GetTestPlan(r.Context(), resolvedID(r, "planKey"))
	h.respond(w, http.StatusOK, plan, err)
}

func (h *api) updateTestPlan(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	plan, err := h.svc.UpdateTestPlan(r.Context(), resolvedID(r, "planKey"), body.Name, body.Description)
	h.respond(w, http.StatusOK, plan, err)
}

func (h *api) deleteTestPlan(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteTestPlan(r.Context(), resolvedID(r, "planKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) testPlanRollup(w http.ResponseWriter, r *http.Request) {
	rollup, err := h.svc.TestPlanRollup(r.Context(), resolvedID(r, "planKey"))
	h.respond(w, http.StatusOK, rollup, err)
}

func (h *api) listRunsByTestPlan(w http.ResponseWriter, r *http.Request) {
	runs, err := h.svc.ListRunsByTestPlan(r.Context(), resolvedID(r, "planKey"))
	h.respond(w, http.StatusOK, runs, err)
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
		Format      string                 `json:"format"`
		Name        string                 `json:"name"`
		Report      string                 `json:"report"`
		Attachments []domain.NewAttachment `json:"attachments"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	result, err := h.svc.Import(r.Context(), resolvedID(r, "projectKey"), service.ImportInput{
		Format: body.Format, Name: body.Name, Report: body.Report, Attachments: body.Attachments,
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

func (h *api) deleteRun(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteRun(r.Context(), resolvedID(r, "runKey"))
	h.respond(w, http.StatusNoContent, nil, err)
}

func (h *api) listRunItems(w http.ResponseWriter, r *http.Request) {
	// jiraLinked is never paginated (a run's jira-linked items are
	// inherently a small subset) — nextCursor is always null on this
	// branch, but the envelope shape stays identical either way.
	if r.URL.Query().Get("jiraLinked") == "true" {
		items, err := h.svc.RunItemsJiraLinked(r.Context(), resolvedID(r, "runKey"))
		h.respond(w, http.StatusOK, newPagePayload(items, ""), err)
		return
	}
	cursor, limit := parsePageParams(r)
	items, nextCursor, err := h.svc.RunItemsPage(r.Context(), resolvedID(r, "runKey"), r.URL.Query().Get("assignee"), cursor, limit)
	h.respond(w, http.StatusOK, newPagePayload(items, nextCursor), err)
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

func (h *api) compareRuns(w http.ResponseWriter, r *http.Request) {
	cmp, err := h.svc.CompareRuns(r.Context(), resolvedID(r, "runKey"), resolvedID(r, "otherRunKey"))
	h.respond(w, http.StatusOK, cmp, err)
}

func (h *api) suiteTrend(w http.ResponseWriter, r *http.Request) {
	includeOpen := r.URL.Query().Get("includeOpen") == "true"
	trend, err := h.svc.SuiteTrend(r.Context(), resolvedID(r, "suiteKey"), includeOpen)
	h.respond(w, http.StatusOK, trend, err)
}

func (h *api) flakyCases(w http.ResponseWriter, r *http.Request) {
	flaky, err := h.svc.FlakyCases(r.Context(), resolvedID(r, "projectKey"))
	h.respond(w, http.StatusOK, flaky, err)
}

func (h *api) projectStatusSummary(w http.ResponseWriter, r *http.Request) {
	sum, err := h.svc.ProjectStatusSummary(r.Context(), resolvedID(r, "projectKey"))
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

// setItemJiraLink sets or clears a run item's Jira issue key
// (add-jira-connector).
func (h *api) setItemJiraLink(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		JiraIssueKey *string `json:"jiraIssueKey"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	it, err := h.svc.SetRunItemJiraLink(r.Context(), chi.URLParam(r, "itemID"), body.JiraIssueKey)
	h.respond(w, http.StatusOK, it, err)
}

// setItemJiraSync writes the Jira connector's cached issue summary/status
// for a run item (add-jira-connector).
func (h *api) setItemJiraSync(w http.ResponseWriter, r *http.Request) {
	body, err := decode[struct {
		JiraIssueSummary string `json:"jiraIssueSummary"`
		JiraIssueStatus  string `json:"jiraIssueStatus"`
	}](r)
	if err != nil {
		badBody(h, w)
		return
	}
	it, err := h.svc.SetRunItemJiraSync(r.Context(), chi.URLParam(r, "itemID"), body.JiraIssueSummary, body.JiraIssueStatus)
	h.respond(w, http.StatusOK, it, err)
}
