package store

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// DefaultPageLimit and MaxPageLimit bound every *Page store method
// (add-cursor-pagination). A caller-supplied limit outside this range is
// silently clamped, never rejected — see clampLimit.
const (
	DefaultPageLimit = 50
	MaxPageLimit     = 200
)

// ErrInvalidCursor is returned by decodeCursor/decodeCursorWithRank for a
// cursor a client didn't just receive from this same endpoint — malformed
// encoding, malformed JSON, or well-formed JSON missing required fields.
// handlers.go's respond() maps it to 400 (spec.md: "A malformed or
// unrecognized cursor is rejected"); found unenforced (mapped to a bare 500
// instead) by Paco's pre-commit QA pass on this change.
var ErrInvalidCursor = fmt.Errorf("invalid cursor")

type cursorPayload struct {
	CreatedAt time.Time `json:"createdAt"`
	ID        string    `json:"id"`
}

// encodeCursor produces an opaque, replay-only pagination token from the
// (created_at, id) of the last item on a page — the composite every
// *Page store method orders and filters by, so ties on created_at still
// resolve deterministically.
func encodeCursor(createdAt time.Time, id string) string {
	payload := cursorPayload{CreatedAt: createdAt, ID: id}
	data, err := json.Marshal(payload)
	if err != nil {
		// cursorPayload is a fixed, always-marshalable shape.
		panic(fmt.Sprintf("encodeCursor: %v", err))
	}
	return base64.URLEncoding.EncodeToString(data)
}

// decodeCursor reverses encodeCursor. A cursor a client didn't just
// receive from this same endpoint — malformed, foreign, or hand-edited —
// errors rather than silently returning an arbitrary page.
func decodeCursor(cursor string) (createdAt time.Time, id string, err error) {
	data, err := base64.URLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("invalid cursor encoding: %w: %w", ErrInvalidCursor, err)
	}
	var payload cursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return time.Time{}, "", fmt.Errorf("invalid cursor payload: %w: %w", ErrInvalidCursor, err)
	}
	if payload.ID == "" || payload.CreatedAt.IsZero() {
		return time.Time{}, "", fmt.Errorf("invalid cursor: missing createdAt or id: %w", ErrInvalidCursor)
	}
	return payload.CreatedAt, payload.ID, nil
}

type rankedCursorPayload struct {
	Rank      int       `json:"rank"`
	CreatedAt time.Time `json:"createdAt"`
	ID        string    `json:"id"`
}

// encodeCursorWithRank/decodeCursorWithRank are encodeCursor/decodeCursor
// plus a leading rank component — RoleRepo.ListPage is the one *Page
// method whose base order isn't just created_at, but rank then
// created_at (List's existing "rank, created_at" order), so its cursor
// must carry rank too or resuming at a rank boundary would skip or
// duplicate rows.
func encodeCursorWithRank(rank int, createdAt time.Time, id string) string {
	payload := rankedCursorPayload{Rank: rank, CreatedAt: createdAt, ID: id}
	data, err := json.Marshal(payload)
	if err != nil {
		panic(fmt.Sprintf("encodeCursorWithRank: %v", err))
	}
	return base64.URLEncoding.EncodeToString(data)
}

func decodeCursorWithRank(cursor string) (rank int, createdAt time.Time, id string, err error) {
	data, err := base64.URLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, time.Time{}, "", fmt.Errorf("invalid cursor encoding: %w: %w", ErrInvalidCursor, err)
	}
	var payload rankedCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return 0, time.Time{}, "", fmt.Errorf("invalid cursor payload: %w: %w", ErrInvalidCursor, err)
	}
	if payload.ID == "" || payload.CreatedAt.IsZero() {
		return 0, time.Time{}, "", fmt.Errorf("invalid cursor: missing createdAt or id: %w", ErrInvalidCursor)
	}
	return payload.Rank, payload.CreatedAt, payload.ID, nil
}

type offsetCursorPayload struct {
	Offset int `json:"offset"`
}

// encodeOffsetCursor/decodeOffsetCursor wrap a plain integer offset in the
// same opaque-base64-JSON shape as encodeCursor, for search's pagination
// (add-mcp-search-listprojects-pagination design.md D2) — search's
// rank-ordered results across a UNION ALL of heterogeneous tables aren't a
// good fit for true (rank, id) keyset pagination (a floating-point rank
// tiebreak across independently-computed ts_rank values), so this is a
// deliberately simpler offset internally, kept opaque externally so the
// MCP tool's interface still matches every *Page-backed tool's cursor
// shape.
func encodeOffsetCursor(offset int) string {
	payload := offsetCursorPayload{Offset: offset}
	data, err := json.Marshal(payload)
	if err != nil {
		panic(fmt.Sprintf("encodeOffsetCursor: %v", err))
	}
	return base64.URLEncoding.EncodeToString(data)
}

func decodeOffsetCursor(cursor string) (int, error) {
	data, err := base64.URLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, fmt.Errorf("invalid cursor encoding: %w: %w", ErrInvalidCursor, err)
	}
	var payload offsetCursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return 0, fmt.Errorf("invalid cursor payload: %w: %w", ErrInvalidCursor, err)
	}
	if payload.Offset <= 0 {
		return 0, fmt.Errorf("invalid cursor: missing or non-positive offset: %w", ErrInvalidCursor)
	}
	return payload.Offset, nil
}

// clampLimit enforces DefaultPageLimit/MaxPageLimit: non-positive falls
// back to the default, anything over the max is capped to it — never an
// error, matching this codebase's existing silently-cap-don't-reject
// convention for other request bounds (e.g. defaultMaxBodyBytes).
func clampLimit(limit int) int {
	if limit <= 0 {
		return DefaultPageLimit
	}
	if limit > MaxPageLimit {
		return MaxPageLimit
	}
	return limit
}

// ClampLimit is clampLimit, exported for the server package's
// parsePageParams (add-cursor-pagination task 1.3) — one shared
// implementation of the default/max rule, not a duplicate.
func ClampLimit(limit int) int {
	return clampLimit(limit)
}
