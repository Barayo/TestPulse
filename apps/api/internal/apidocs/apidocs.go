// Package apidocs serves the embedded OpenAPI contract as a live,
// interactive Swagger UI endpoint (add-live-api-docs). Mirrors
// apps/api/internal/web's embed/serve pattern: the actual content is
// populated at build time (Makefile's sync-api-docs, mirroring sync-web)
// but a real, working copy is committed too, so go build/go test work
// standalone without running that step first — same reasoning as
// internal/web's committed placeholder dist/index.html.
package apidocs

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

//go:embed openapi.yaml
var specBytes []byte

// Handler serves the Swagger UI static bundle plus the spec it points at.
func Handler() http.Handler {
	return handlerFor(distFS, specBytes)
}

func handlerFor(root fs.FS, spec []byte) http.Handler {
	dist, err := fs.Sub(root, "dist")
	if err != nil {
		panic(err) // unreachable: dist is embedded at compile time
	}
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "openapi.yaml" {
			w.Header().Set("Content-Type", "application/yaml")
			_, _ = w.Write(spec)
			return
		}
		if p == "" {
			p = "index.html"
		}
		if f, err := dist.Open(p); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// No SPA fallback here — unlike internal/web, an unmatched path is a
		// genuine 404, not a client-side route the app shell will resolve.
		http.NotFound(w, r)
	})
}
