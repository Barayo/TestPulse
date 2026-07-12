package web

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

var testDist = fstest.MapFS{
	"dist/index.html":     {Data: []byte("<html>app shell</html>")},
	"dist/assets/main.js": {Data: []byte("console.log('hi')")},
}

func get(t *testing.T, h http.Handler, path string) (*http.Response, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	res := rec.Result()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	return res, string(body)
}

func TestServesExistingStaticFile(t *testing.T) {
	res, body := get(t, handlerFor(testDist), "/assets/main.js")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(body, "console.log") {
		t.Errorf("body = %q, want asset content", body)
	}
}

func TestServesIndexAtRoot(t *testing.T) {
	res, body := get(t, handlerFor(testDist), "/")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(body, "app shell") {
		t.Errorf("body = %q, want index.html content", body)
	}
}

func TestSPAFallbackForClientRoutes(t *testing.T) {
	// Client-side routes like /projects/42 must serve the app shell so the
	// SPA router can take over after a full-page load.
	res, body := get(t, handlerFor(testDist), "/projects/42")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(body, "app shell") {
		t.Errorf("body = %q, want index.html content", body)
	}
}

func TestEmbeddedHandlerServesPlaceholder(t *testing.T) {
	// The real embedded FS must always be servable (placeholder committed).
	res, body := get(t, Handler(), "/")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(strings.ToLower(body), "testpulse") {
		t.Errorf("body = %q, want TestPulse shell", body)
	}
}
