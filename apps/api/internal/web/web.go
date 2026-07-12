// Package web serves the embedded production build of the TestPulse UI.
//
// The build pipeline (Makefile `sync-web`, Dockerfile) copies apps/web/dist
// into this package's dist/ directory before compiling, so the final binary
// is fully self-contained. The committed dist/index.html is a placeholder
// for builds that skip the web step.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Handler serves the SPA from the embedded bundle: real files when they
// exist, index.html for client-side routes.
func Handler() http.Handler {
	return handlerFor(distFS)
}

func handlerFor(root fs.FS) http.Handler {
	dist, err := fs.Sub(root, "dist")
	if err != nil {
		panic(err) // unreachable: dist is embedded at compile time
	}
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" {
			if f, err := dist.Open(p); err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback: serve index.html for client-side routes.
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
