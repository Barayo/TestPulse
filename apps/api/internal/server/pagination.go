package server

import (
	"net/http"
	"strconv"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// parsePageParams reads the cursor/limit query params shared by every
// paginated list endpoint (add-cursor-pagination). cursor is passed
// through opaque and unvalidated here — the store layer's decodeCursor is
// what rejects a malformed one. limit is clamped via store.ClampLimit; a
// missing or non-numeric value falls back to the same default a
// non-positive one would.
func parsePageParams(r *http.Request) (cursor string, limit int) {
	q := r.URL.Query()
	cursor = q.Get("cursor")
	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil {
		limit = 0
	}
	return cursor, store.ClampLimit(limit)
}

// pagePayload is the { items, nextCursor } envelope every cursor-paginated
// list endpoint returns. nextCursor is always present in the JSON body —
// explicit null on the last page, never omitted — matching
// list-pagination's "Cursor-paginated response envelope" requirement.
type pagePayload[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

func newPagePayload[T any](items []T, nextCursor string) pagePayload[T] {
	payload := pagePayload[T]{Items: items}
	if nextCursor != "" {
		payload.NextCursor = &nextCursor
	}
	return payload
}
