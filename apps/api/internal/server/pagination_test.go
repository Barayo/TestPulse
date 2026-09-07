package server

import (
	"net/http"
	"net/url"
	"testing"
)

// add-cursor-pagination task 1.3: parsePageParams reads cursor/limit query
// params for the eight paginated list endpoints and applies the same
// clamping every store-layer *Page method relies on.

func reqWithQuery(t *testing.T, rawQuery string) *http.Request {
	t.Helper()
	u := &url.URL{Path: "/", RawQuery: rawQuery}
	return &http.Request{URL: u}
}

func TestParsePageParamsDefaults(t *testing.T) {
	r := reqWithQuery(t, "")
	cursor, limit := parsePageParams(r)
	if cursor != "" {
		t.Errorf("cursor = %q, want empty", cursor)
	}
	if limit != 50 {
		t.Errorf("limit = %d, want 50 (default)", limit)
	}
}

func TestParsePageParamsPassesThroughCursor(t *testing.T) {
	r := reqWithQuery(t, "cursor=abc123")
	cursor, _ := parsePageParams(r)
	if cursor != "abc123" {
		t.Errorf("cursor = %q, want %q", cursor, "abc123")
	}
}

func TestParsePageParamsClampsOversizedLimit(t *testing.T) {
	r := reqWithQuery(t, "limit=999999")
	_, limit := parsePageParams(r)
	if limit != 200 {
		t.Errorf("limit = %d, want 200 (clamped)", limit)
	}
}

func TestParsePageParamsNonPositiveLimitFallsBackToDefault(t *testing.T) {
	for _, raw := range []string{"limit=0", "limit=-5"} {
		r := reqWithQuery(t, raw)
		_, limit := parsePageParams(r)
		if limit != 50 {
			t.Errorf("parsePageParams(%q) limit = %d, want 50 (default)", raw, limit)
		}
	}
}

func TestParsePageParamsMalformedLimitFallsBackToDefault(t *testing.T) {
	r := reqWithQuery(t, "limit=not-a-number")
	_, limit := parsePageParams(r)
	if limit != 50 {
		t.Errorf("limit = %d, want 50 (default) for a non-numeric limit", limit)
	}
}
