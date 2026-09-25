package apidocs

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

var testDist = fstest.MapFS{
	"dist/index.html":           {Data: []byte("<html>swagger shell</html>")},
	"dist/swagger-ui-bundle.js": {Data: []byte("console.log('bundle')")},
}

const testSpec = "openapi: 3.0.3\ninfo:\n  title: test\n"

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

func TestServesSpecAtOpenAPIPath(t *testing.T) {
	res, body := get(t, handlerFor(testDist, []byte(testSpec)), "/openapi.yaml")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if body != testSpec {
		t.Errorf("body = %q, want the embedded spec", body)
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/yaml" {
		t.Errorf("Content-Type = %q, want application/yaml", ct)
	}
}

func TestServesSwaggerUIAtRoot(t *testing.T) {
	res, body := get(t, handlerFor(testDist, []byte(testSpec)), "/")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(body, "swagger shell") {
		t.Errorf("body = %q, want index.html content", body)
	}
}

func TestServesStaticAssets(t *testing.T) {
	res, body := get(t, handlerFor(testDist, []byte(testSpec)), "/swagger-ui-bundle.js")
	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if !strings.Contains(body, "bundle") {
		t.Errorf("body = %q, want the bundle asset content", body)
	}
}

// TestRealIndexHTMLHasBaseHrefForDocsMount is a regression test for a bug
// found live: GET /docs (the documented entry point, no trailing slash)
// makes the browser resolve index.html's relative asset hrefs against "/"
// (docs' parent), not "/docs/" — every CSS/JS sub-request then 404s/
// misroutes to the unrelated web-SPA catch-all instead of this package's
// own embedded assets, leaving the page blank. A <base href="/docs/">
// tag (added by sync-api-docs.mjs) fixes it regardless of trailing slash.
// Uses the real embedded dist, not the synthetic testDist above, since
// this is specifically about what sync-api-docs.mjs actually produced.
func TestRealIndexHTMLHasBaseHrefForDocsMount(t *testing.T) {
	_, body := get(t, Handler(), "/")
	if !strings.Contains(body, `<base href="/docs/">`) {
		t.Errorf("index.html does not contain the required <base href=\"/docs/\"> tag; body: %s", body)
	}
}

func TestUnknownPathIs404(t *testing.T) {
	res, _ := get(t, handlerFor(testDist, []byte(testSpec)), "/does-not-exist.js")
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 (no SPA fallback here, unlike internal/web)", res.StatusCode)
	}
}
