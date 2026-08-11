package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Bare-minimum brute-force mitigation on POST /api/v1/auth/login
// (backlog #113) — per-client-IP, in-memory. Fine for today's
// single-machine deployment (fly.toml: min_machines_running = 1); a
// multi-replica deployment would need a shared store instead, noted in
// loginRateLimiter's own doc comment.

func TestLoginRateLimiterAllowsBurstThenBlocks(t *testing.T) {
	l := newLoginRateLimiter(1, 3) // 1 event/sec refill, burst 3
	for i := 0; i < 3; i++ {
		if !l.allow("1.2.3.4") {
			t.Fatalf("attempt %d: expected allowed within burst", i+1)
		}
	}
	if l.allow("1.2.3.4") {
		t.Fatal("4th immediate attempt should be blocked — burst exhausted")
	}
}

func TestLoginRateLimiterTracksClientsIndependently(t *testing.T) {
	l := newLoginRateLimiter(1, 1)
	if !l.allow("1.2.3.4") {
		t.Fatal("first attempt from 1.2.3.4 should be allowed")
	}
	if l.allow("1.2.3.4") {
		t.Fatal("second immediate attempt from the same IP should be blocked")
	}
	if !l.allow("5.6.7.8") {
		t.Fatal("a different IP must not be blocked by another IP's exhausted burst")
	}
}

func TestLoginRateLimiterEvictsStaleEntries(t *testing.T) {
	now := time.Now()
	l := newLoginRateLimiter(1, 1)
	l.now = func() time.Time { return now }
	l.allow("1.2.3.4")

	now = now.Add(11 * time.Minute)
	l.allow("5.6.7.8") // triggers eviction sweep

	l.mu.Lock()
	_, stillPresent := l.limiters["1.2.3.4"]
	l.mu.Unlock()
	if stillPresent {
		t.Error("a limiter untouched for 11 minutes should have been evicted (unbounded memory growth otherwise)")
	}
}

func TestLoginRateLimitMiddlewareReturns429WhenExhausted(t *testing.T) {
	l := newLoginRateLimiter(1, 1)
	called := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	})
	h := l.middleware(next)

	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req1.RemoteAddr = "9.9.9.9:12345"
	rec1 := httptest.NewRecorder()
	h.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("first request: got %d, want 200", rec1.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req2.RemoteAddr = "9.9.9.9:12345"
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusTooManyRequests {
		t.Errorf("second immediate request: got %d, want 429", rec2.Code)
	}
	if called != 1 {
		t.Errorf("the wrapped handler ran %d times, want exactly 1 (the blocked attempt must never reach login logic)", called)
	}
}

// clientIP must never trust an arbitrary client-supplied header for a
// security-sensitive decision (rate-limit key) — X-Forwarded-For is
// exactly that: any caller can set it themselves, so trusting its first
// hop lets an attacker bypass the per-IP rate limit entirely by sending a
// different fake value on every request (caught by an automated security
// review of backlog #113's initial implementation). Fly-Client-IP is safe
// to trust instead: Fly's edge proxy always overwrites it with the real
// TCP connection's source IP, discarding whatever the client sent.

func TestClientIPUsesFlyClientIPHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = "10.0.0.1:54321" // Fly's internal proxy address
	req.Header.Set("Fly-Client-IP", "203.0.113.7")

	if got := clientIP(req); got != "203.0.113.7" {
		t.Errorf("clientIP = %q, want the real client 203.0.113.7 from Fly-Client-IP", got)
	}
}

func TestClientIPIgnoresSpoofableForwardedForHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = "203.0.113.7:54321"
	// An attacker-supplied header, not set by any trusted proxy here —
	// must be ignored, not used to defeat the rate limit by claiming a
	// different IP on every request.
	req.Header.Set("X-Forwarded-For", "1.2.3.4")

	if got := clientIP(req); got != "203.0.113.7" {
		t.Errorf("clientIP = %q, want RemoteAddr 203.0.113.7 — X-Forwarded-For must not be trusted", got)
	}
}

func TestClientIPFallsBackToRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = "203.0.113.7:54321"

	if got := clientIP(req); got != "203.0.113.7" {
		t.Errorf("clientIP = %q, want 203.0.113.7", got)
	}
}
