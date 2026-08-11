package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// mountPublicAPI registers the opt-in, unauthenticated read-only route
// group (enable-public-project-access) under /api/v1/public. It is mounted
// outside the authenticate middleware in server.go — no Actor is ever
// resolved for these requests. Each route reuses the exact same handler
// function, and the exact same project-resolver, as its authenticated
// counterpart in mountAPI, just swapping h.requirePermission for
// h.requirePublicProject: this guarantees a resource (a suite, run, case,
// item, or attachment) is gated by the project it actually belongs to, not
// by whatever {projectKey} segment happens to appear in the URL.
//
// Deliberately excluded, by simply never registering them here: project
// membership, permissions, every write route, and every admin/teams/roles/
// tokens/identity route. NotFound/MethodNotAllowed are overridden to a
// plain JSON 404, scoped only to this router, so a request for one of
// those excluded paths (or any typo) gets the same "doesn't exist" 404 as
// a genuinely private or nonexistent project — not the SPA fallback the
// top-level router otherwise serves for any unmatched path.
// listPublicProjects backs the anonymous discovery index
// (add-public-project-discovery): every project that is both
// instance-enabled and individually public, or an empty list — the
// service layer never distinguishes "switch off" from "nothing published".
func (h *api) listPublicProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.svc.ListPublicProjects(r.Context())
	h.respond(w, http.StatusOK, projects, err)
}

func mountPublicAPI(r chi.Router, h *api) {
	r.Route("/public", func(r chi.Router) {
		notFound := func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		}
		r.NotFound(notFound)
		r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) { notFound(w, r) })

		r.Get("/projects", h.listPublicProjects)
		r.Route("/projects/{projectKey}", func(r chi.Router) {
			r.Use(h.resolveKey("projectKey", h.svc.ProjectIDByKey))
			r.With(h.requirePublicProject(projectIDParam)).Get("/", h.getProject)
			r.With(h.requirePublicProject(projectIDParam)).Get("/cases", h.listCases)
			r.With(h.requirePublicProject(projectIDParam)).Get("/folders", h.listFolders)
			r.With(h.requirePublicProject(projectIDParam)).Get("/flaky-cases", h.flakyCases)
			r.With(h.requirePublicProject(projectIDParam)).Get("/suites", h.listSuites)
			r.With(h.requirePublicProject(projectIDParam)).Get("/runs", h.listRuns)
		})
		r.Route("/cases/{caseKey}", func(r chi.Router) {
			r.Use(h.resolveKey("caseKey", h.svc.CaseIDByKey))
			r.With(h.requirePublicProject(projectIDFromCase)).Get("/", h.getCase)
			r.With(h.requirePublicProject(projectIDFromCase)).Get("/versions", h.listCaseVersions)
			r.With(h.requirePublicProject(projectIDFromCase)).Get("/executions", h.listCaseExecutions)
		})
		r.Route("/suites/{suiteKey}", func(r chi.Router) {
			r.Use(h.resolveKey("suiteKey", h.svc.SuiteIDByKey))
			r.With(h.requirePublicProject(projectIDFromSuite)).Get("/", h.getSuite)
			r.With(h.requirePublicProject(projectIDFromSuite)).Get("/trend", h.suiteTrend)
		})
		r.Route("/runs/{runKey}", func(r chi.Router) {
			r.Use(h.resolveKey("runKey", h.svc.RunIDByKey))
			r.With(h.requirePublicProject(projectIDFromRun)).Get("/", h.getRun)
			r.With(h.requirePublicProject(projectIDFromRun)).Get("/items", h.listRunItems)
			r.With(h.requirePublicProject(projectIDFromRun)).Get("/summary", h.runSummary)
		})
		r.Route("/items/{itemID}", func(r chi.Router) {
			r.With(h.requirePublicProject(projectIDFromItem)).Get("/results", h.listResults)
		})
		r.Route("/attachments/{attachmentID}", func(r chi.Router) {
			r.With(h.requirePublicProject(projectIDFromAttachment)).Get("/", h.getAttachment)
		})
	})
}
