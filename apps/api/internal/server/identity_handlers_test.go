package server

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// setSessionCookie/clearSessionCookie must mark the cookie Secure whenever
// the request reached the app over HTTPS — either terminated by the Go
// process itself (r.TLS != nil, local/dev) or by a reverse proxy in front
// of it (X-Forwarded-Proto: https, the real testpulse.fly.dev deployment:
// fly.toml sets force_https with a plain-HTTP internal_port, so r.TLS is
// always nil there and the proxy header is the only signal available).
// Checking r.TLS alone silently served the session cookie without Secure
// in production (backlog #112).
func TestSessionCookieSecure(t *testing.T) {
	sess := domain.Session{ID: "sekret", UserID: "u1", ExpiresAt: time.Now().Add(time.Hour)}

	cases := []struct {
		name           string
		tls            bool
		forwardedProto string
		wantSecure     bool
	}{
		{name: "plain HTTP, no proxy header", tls: false, forwardedProto: "", wantSecure: false},
		{name: "TLS terminated by the Go process itself", tls: true, forwardedProto: "", wantSecure: true},
		{name: "TLS terminated by a reverse proxy (Fly.io)", tls: false, forwardedProto: "https", wantSecure: true},
		{name: "proxy header present but explicitly http", tls: false, forwardedProto: "http", wantSecure: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
			if tc.tls {
				req.TLS = &tls.ConnectionState{}
			}
			if tc.forwardedProto != "" {
				req.Header.Set("X-Forwarded-Proto", tc.forwardedProto)
			}

			rec := httptest.NewRecorder()
			setSessionCookie(rec, req, sess)

			cookies := rec.Result().Cookies()
			if len(cookies) != 1 {
				t.Fatalf("got %d cookies, want 1", len(cookies))
			}
			if cookies[0].Secure != tc.wantSecure {
				t.Errorf("Secure = %v, want %v", cookies[0].Secure, tc.wantSecure)
			}
		})
	}
}

func TestClearSessionCookieSecure(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	req.Header.Set("X-Forwarded-Proto", "https")

	rec := httptest.NewRecorder()
	clearSessionCookie(rec, req)

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	if !cookies[0].Secure {
		t.Error("clearSessionCookie did not honor X-Forwarded-Proto: https")
	}
}
