package server

import (
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentimage"
)

// readAttachmentUpload parses a single-file multipart upload, bounding the
// request body the same way the avatar upload handler does.
func readAttachmentUpload(w http.ResponseWriter, r *http.Request) (filename string, data []byte, err error) {
	r.Body = http.MaxBytesReader(w, r.Body, attachmentimage.MaxUploadBytes+multipartOverhead)
	if err := r.ParseMultipartForm(attachmentimage.MaxUploadBytes + multipartOverhead); err != nil {
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

func (h *api) stageAttachment(w http.ResponseWriter, r *http.Request) {
	filename, data, err := readAttachmentUpload(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "attachment upload is malformed or exceeds the maximum allowed size"})
		return
	}
	att, err := h.svc.StageAttachment(r.Context(), chi.URLParam(r, "itemID"), filename, data)
	h.respond(w, http.StatusCreated, att, err)
}

func (h *api) listStagedAttachments(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.StagedAttachments(r.Context(), chi.URLParam(r, "itemID"))
	h.respond(w, http.StatusOK, list, err)
}

func (h *api) attachToResult(w http.ResponseWriter, r *http.Request) {
	filename, data, err := readAttachmentUpload(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "attachment upload is malformed or exceeds the maximum allowed size"})
		return
	}
	att, err := h.svc.AttachToResult(r.Context(), chi.URLParam(r, "resultID"), filename, data)
	h.respond(w, http.StatusCreated, att, err)
}

func (h *api) listResultAttachments(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.AttachmentsForResult(r.Context(), chi.URLParam(r, "resultID"))
	h.respond(w, http.StatusOK, list, err)
}

// getAttachment serves the raw stored image bytes — any authenticated actor
// with read permission on the project may fetch it (design.md).
func (h *api) getAttachment(w http.ResponseWriter, r *http.Request) {
	att, image, err := h.svc.GetAttachment(r.Context(), chi.URLParam(r, "attachmentID"))
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
	w.Header().Set("Content-Type", att.ContentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(image)
}

func (h *api) deleteAttachment(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteAttachment(r.Context(), chi.URLParam(r, "attachmentID"))
	h.respond(w, http.StatusNoContent, nil, err)
}
