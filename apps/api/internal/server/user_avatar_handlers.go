package server

import (
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Barayo/TestPulse/apps/api/internal/avatarimage"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// multipartOverhead bounds how much extra a multipart request may add on
// top of the actual file bytes (boundary markers, field headers) before the
// body reader gives up — generous enough for any real client, tight enough
// to still bound worst-case memory for a hostile one.
const multipartOverhead = 64 * 1024

func (h *api) updateCurrentUserAvatar(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, avatarimage.MaxUploadBytes+multipartOverhead)
	if err := r.ParseMultipartForm(avatarimage.MaxUploadBytes + multipartOverhead); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "avatar upload is malformed or exceeds the maximum allowed size"})
		return
	}
	file, _, err := r.FormFile("avatar")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing avatar file"})
		return
	}
	defer func() { _ = file.Close() }()
	data, err := io.ReadAll(file)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "could not read uploaded file"})
		return
	}

	actor, _ := domain.ActorFromContext(r.Context())
	user, err := h.svc.UpdateOwnAvatar(r.Context(), actor, data)
	h.respond(w, http.StatusOK, user, err)
}

func (h *api) removeCurrentUserAvatar(w http.ResponseWriter, r *http.Request) {
	actor, _ := domain.ActorFromContext(r.Context())
	user, err := h.svc.RemoveOwnAvatar(r.Context(), actor)
	h.respond(w, http.StatusOK, user, err)
}

// getUserAvatar serves the raw stored image bytes for any user id — any
// authenticated actor may look up any user's avatar, the same visibility
// the People/assignee surfaces that already display it have (design.md).
func (h *api) getUserAvatar(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	image, contentType, updatedAt, err := h.svc.GetUserAvatar(r.Context(), userID)
	if err != nil {
		h.respond(w, 0, nil, err)
		return
	}

	etag := `"` + strconv.FormatInt(updatedAt.UnixNano(), 36) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(image)
}
