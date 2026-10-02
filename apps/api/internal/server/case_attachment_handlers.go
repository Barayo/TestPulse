package server

import (
	"io"
	"mime"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentfile"
)

// readCaseAttachmentUpload parses a single-file multipart upload, bounding
// the request body the same way the run-result attachment handler does.
func readCaseAttachmentUpload(w http.ResponseWriter, r *http.Request) (filename string, data []byte, err error) {
	r.Body = http.MaxBytesReader(w, r.Body, attachmentfile.MaxUploadBytes+multipartOverhead)
	if err := r.ParseMultipartForm(attachmentfile.MaxUploadBytes + multipartOverhead); err != nil {
		return "", nil, err
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = file.Close() }()
	data, err = io.ReadAll(file)
	return header.Filename, data, err
}

func (h *api) uploadCaseAttachment(w http.ResponseWriter, r *http.Request) {
	filename, data, err := readCaseAttachmentUpload(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "attachment upload is malformed or exceeds the maximum allowed size"})
		return
	}
	att, err := h.svc.AttachCaseFile(r.Context(), resolvedID(r, "caseKey"), filename, data)
	h.respond(w, http.StatusCreated, att, err)
}

func (h *api) listCaseAttachments(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListCaseAttachments(r.Context(), resolvedID(r, "caseKey"))
	h.respond(w, http.StatusOK, list, err)
}

// getCaseAttachment serves the raw stored file bytes — any authenticated
// actor with read permission on the case's project may fetch it. A PDF is
// served with Content-Disposition: inline so the browser renders it rather
// than forcing a download (design.md D6); images already render inline via
// <img> regardless of disposition.
func (h *api) getCaseAttachment(w http.ResponseWriter, r *http.Request) {
	att, data, err := h.svc.GetCaseAttachment(r.Context(), chi.URLParam(r, "attachmentID"))
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}

	etag := `"` + strconv.FormatInt(att.CreatedAt.UnixNano(), 36) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if att.ContentType == "application/pdf" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": att.Filename}))
		// A PDF renders inline via the browser's own viewer on this API
		// origin — unlike images, a PDF can carry active content, so this
		// overrides the global CSP with a sandboxed one: no script, forms,
		// or popups, and the response is treated as a unique (cookieless)
		// origin regardless of what a malicious PDF attempts.
		w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
	}
	w.Header().Set("Content-Type", att.ContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *api) deleteCaseAttachment(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteCaseAttachment(r.Context(), chi.URLParam(r, "attachmentID"))
	h.respond(w, http.StatusNoContent, nil, err)
}
