package server_test

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// apiServerWithLogger is apiServer plus a caller-supplied logger, so tests
// can assert on request-logging middleware output (add-service-request-
// logging) via a recordingHandler.
func apiServerWithLogger(t *testing.T, logger *slog.Logger) http.Handler {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool))
	cookie := testutil.AuthCookie(t, svc)
	return authInjectingHandler{inner: server.New(logger, ok{}, svc, 5, 5, nil, true), cookie: cookie}
}

func TestScenario_ErrorResponseIsLoggedWithRequestID(t *testing.T) {
	h := &recordingHandler{}
	srv := apiServerWithLogger(t, slog.New(h))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("POST /api/v1/projects with no body = %d, want 400", rec.Code)
	}

	attrs := h.attrs("request error")
	if attrs == nil {
		t.Fatalf("no \"request error\" log line produced; got messages %v", h.messages())
	}
	if attrs["status"] != int64(400) {
		t.Errorf("status attr = %v (%T), want 400", attrs["status"], attrs["status"])
	}
	if attrs["method"] != http.MethodPost {
		t.Errorf("method attr = %v, want POST", attrs["method"])
	}
	if attrs["path"] != "/api/v1/projects" {
		t.Errorf("path attr = %v, want /api/v1/projects", attrs["path"])
	}
	reqID, _ := attrs["requestId"].(string)
	if reqID == "" {
		t.Error("requestId attr is empty, want a non-empty request ID")
	}
}

func TestScenario_SuccessfulResponseIsNotLoggedByRequestLoggingMiddleware(t *testing.T) {
	h := &recordingHandler{}
	srv := apiServerWithLogger(t, slog.New(h))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/projects = %d, want 200", rec.Code)
	}

	if attrs := h.attrs("request error"); attrs != nil {
		t.Errorf("a successful response produced a \"request error\" log line: %v", attrs)
	}
}

func TestScenario_ResponseIncludesXRequestIdHeader(t *testing.T) {
	srv := apiServerWithLogger(t, slog.New(slog.DiscardHandler))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if got := rec.Header().Get("X-Request-Id"); got == "" {
		t.Error("X-Request-Id response header is empty, want a non-empty request ID")
	}
}
