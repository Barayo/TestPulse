package server

import (
	"net/http"

	"github.com/Barayo/TestPulse/apps/api/internal/csvcases"
)

// maxCSVUploadBytes bounds a CSV import upload — generous for any
// legitimate case-migration file (design.md's Risks: the existing global
// request-body size limit already bounds worst-case abuse; this is a
// tighter, format-appropriate cap on top of that).
const maxCSVUploadBytes = 10 * 1024 * 1024

func (h *api) importCasesCSV(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxCSVUploadBytes+multipartOverhead)
	if err := r.ParseMultipartForm(maxCSVUploadBytes + multipartOverhead); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "CSV upload is malformed or exceeds the maximum allowed size"})
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing file field"})
		return
	}
	defer func() { _ = file.Close() }()

	folderID := r.FormValue("folderId")
	if folderID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "folderId is required"})
		return
	}

	created, newFields, problems, err := h.svc.ImportCasesFromCSV(r.Context(), resolvedID(r, "projectKey"), folderID, file)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}

	problemsJSON := make([]csvRowProblemJSON, len(problems))
	for i, p := range problems {
		problemsJSON[i] = csvRowProblemJSON{Row: p.Row, Reason: p.Reason}
	}
	if newFields == nil {
		newFields = []string{}
	}
	h.respond(w, http.StatusCreated, csvImportResultJSON{Created: created, NewFields: newFields, Problems: problemsJSON}, nil)
}

type csvRowProblemJSON struct {
	Row    int    `json:"row"`
	Reason string `json:"reason"`
}

type csvImportResultJSON struct {
	Created   int                 `json:"created"`
	NewFields []string            `json:"newFields"`
	Problems  []csvRowProblemJSON `json:"problems"`
}

func (h *api) exportCasesCSV(w http.ResponseWriter, r *http.Request) {
	var folderID *string
	if v := r.URL.Query().Get("folderId"); v != "" {
		folderID = &v
	}

	cases, fields, err := h.svc.ExportCasesToCSV(r.Context(), resolvedID(r, "projectKey"), folderID)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="cases.csv"`)
	w.WriteHeader(http.StatusOK)
	_ = csvcases.WriteRows(w, cases, fields)
}
