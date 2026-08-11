package server

import (
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// loginRateLimiter throttles POST /api/v1/auth/login per client IP —
// bare-minimum brute-force/credential-stuffing mitigation (backlog #113).
// Login already returns a generic "invalid email or password" for any
// failure (no user enumeration); this adds the missing per-attempt cost.
//
// In-memory and per-process: correct for today's single-machine
// deployment (fly.toml: min_machines_running = 1), but each replica would
// enforce its own independent limit if this were ever scaled to multiple
// machines — a shared store (e.g. Redis) would be needed then. Noted
// rather than silently assumed away.
type loginRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rateLimiterEntry
	rate     rate.Limit
	burst    int
	now      func() time.Time
}

type rateLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// evictAfter bounds memory growth from distinct attacking IPs — an entry
// unused for this long is dropped on the next allow() call, regardless of
// which key that call is for.
const rateLimiterEvictAfter = 10 * time.Minute

func newLoginRateLimiter(r rate.Limit, burst int) *loginRateLimiter {
	return &loginRateLimiter{
		limiters: make(map[string]*rateLimiterEntry),
		rate:     r,
		burst:    burst,
		now:      time.Now,
	}
}

func (l *loginRateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	e, ok := l.limiters[key]
	if !ok {
		e = &rateLimiterEntry{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.limiters[key] = e
	}
	e.lastSeen = now

	cutoff := now.Add(-rateLimiterEvictAfter)
	for k, entry := range l.limiters {
		if entry.lastSeen.Before(cutoff) {
			delete(l.limiters, k)
		}
	}

	return e.limiter.AllowN(now, 1)
}

func (l *loginRateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many attempts, try again later"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP deliberately does NOT trust X-Forwarded-For — unlike
// X-Forwarded-Proto (requestIsHTTPS), any client can set that header
// themselves, and a spoofed value used as the rate-limit key would let an
// attacker bypass the limiter entirely by sending a different fake IP on
// every request. Fly-Client-IP is safe instead: Fly's edge proxy always
// overwrites it with the real TCP connection's source IP, discarding
// whatever the client sent — it's the one header on this deployment that
// can't be forged past the edge. A deployment behind a different reverse
// proxy (no Fly-Client-IP) falls back to RemoteAddr — coarser (every
// request through an unrecognized proxy shares one bucket) but never
// spoofable, which matters more for a rate limit's own key.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("Fly-Client-IP"); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
