## Context

`docs/deployment.md` currently states a deliberate architecture choice: "Put TLS at the ingress/load balancer; the app itself serves plain HTTP." The session cookie's `Secure` flag is set via `requestIsHTTPS` (`apps/api/internal/server/identity_handlers.go`), which already checks `r.TLS != nil` as one of two detection paths — the other being `X-Forwarded-Proto: https`, which is what `testpulse.fly.dev`'s Fly.io deployment and every other current path actually relies on. The `r.TLS != nil` branch has never had anything to trigger it, since the Go process has never had a way to actually hold a TLS listener.

The Helm chart already supports TLS via the standard `ingress.tls` values field — a cert-manager-compatible pattern that works out of the box with any ingress controller. That path needs no code change. The gap is specifically: (1) the Go binary has no option to terminate TLS itself, for simple deployments without a Kubernetes ingress or hand-rolled reverse proxy, and (2) the reverse-proxy path is documented only as an abstract warning, not a working example.

## Goals / Non-Goals

**Goals:**
- Let an operator terminate TLS directly in the Go binary via two new config env vars, for deployments (bare VM, simple docker-compose) that don't already sit behind a TLS-terminating proxy or ingress controller.
- Provide a concrete, runnable reverse-proxy example (Caddy-fronted docker-compose override) plus documented nginx/Traefik snippets, replacing the current prose-only warning.
- Verify the native-TLS path with a real integration test using a self-signed certificate — not just config-parsing unit tests — so "the server actually serves HTTPS when configured" is proven, not assumed.

**Non-Goals:**
- No automatic certificate issuance or renewal (no ACME/Let's Encrypt client embedded in the Go binary). An operator using native TLS supplies and rotates cert/key files themselves; an operator who wants automatic renewal uses the reverse-proxy path (Caddy does this natively) or the Helm chart's cert-manager-backed ingress.
- No change to the Helm chart — its ingress-based TLS story is already complete.
- No change to local dev (`make dev-api`/`make dev-web` stay plain HTTP, per the issue's explicit scope note).
- No mutual TLS (client certificates) — this is server-side TLS termination only.

## Decisions

**D1 — Two new paired env vars, fail-fast if only one is set.** `TESTPULSE_TLS_CERT_FILE` and `TESTPULSE_TLS_KEY_FILE` (both optional, but required together), following the same "optional pair" shape as `TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD`. Unlike that pair (which silently no-ops downstream in `Service.BootstrapAdmin` if incomplete), `config.Load` itself fails fast — `fmt.Errorf` naming whichever variable is missing — if exactly one is set. Rationale: an incomplete TLS config is a security-relevant misconfiguration (operator believes HTTPS is active; it silently isn't), categorically different from an incomplete admin-seed pair (worst case, no admin gets seeded, caught immediately by "can't log in"). Starting on plain HTTP instead of failing would be the wrong failure mode here.

**D2 — `main.go` branches on `cfg.TLSCertFile != ""` to choose `ListenAndServeTLS` vs `ListenAndServe`.** Minimal: no new abstraction, no interface — one `if` around the existing `go func() { errCh <- srv.ListenAndServe() }()` block. `srv.Addr` is reused unchanged; an operator who wants HTTPS on 443 instead of the default `:8080` sets `TESTPULSE_ADDR` as they already would.

**D3 — No automatic plain-HTTP-to-HTTPS redirect.** When native TLS is configured, the server only listens on the TLS port — it does not also bind a second plain-HTTP listener to redirect from. Rationale: running two listeners doubles the surface this change needs to get right (port conflicts, two `TESTPULSE_ADDR`-shaped values, redirect-loop edge cases) for a convenience an operator can trivially get from whichever reverse-proxy/firewall layer already manages their inbound traffic, if they want it. An operator who needs both HTTP and HTTPS reachable puts a proxy in front, same as the existing documented pattern.

**D4 — Reverse-proxy docs lead with Caddy, not nginx.** Caddy's automatic HTTPS (zero-config Let's Encrypt for a real domain, `tls internal` for local/self-signed) makes it the shortest path to a working example, and it's already a common choice for self-hosted single-binary-style stacks like this one. nginx and Traefik snippets are included as documented alternatives (common in existing Kubernetes/enterprise setups) but not the lead example. Every example explicitly sets `X-Forwarded-Proto: https` and is a real, testable compose override (`deploy/compose/docker-compose.tls.yml`), not just a code block in prose — so `docker compose -f docker-compose.yml -f docker-compose.tls.yml up` actually works.

**D5 — Self-signed cert test generates its own cert in-process, nothing checked into the repo.** The integration test uses Go's `crypto/tls`/`crypto/x509`/`crypto/rand` to generate a throwaway self-signed cert + key to temp files at test setup, starts the real `http.Server` with `ListenAndServeTLS` on an ephemeral port (`:0`), and connects with an `http.Client` configured with a `tls.Config{RootCAs: <the generated cert's pool>}` (not `InsecureSkipVerify` — the test should prove the handshake validates against the actual cert, matching how a real client would trust a real cert). A second test confirms `config.Load` rejects a cert-file-only or key-file-only configuration with a clear error naming the missing variable.

## Risks / Trade-offs

- **[Risk]** An operator misreads "native TLS support" as "TestPulse now manages certificates for you" and expects automatic renewal. → **Mitigation**: docs are explicit that this is bring-your-own-cert, no ACME, and point to the reverse-proxy path (Caddy) for anyone who wants automatic issuance/renewal instead.
- **[Trade-off]** Only one listener (D3) means an operator who wants both plain-HTTP (e.g. for an internal health-check scraper that doesn't speak TLS) and HTTPS externally has to run a proxy anyway, even with native TLS configured. → **Mitigation**: this is already the documented recommended pattern for anything beyond the simplest single-domain case; native TLS is additive for the simple case, not a replacement for proxy-based setups with more complex routing needs.
- **[Risk]** `docker-compose.tls.yml`'s example Caddyfile, if copied verbatim into production with a placeholder domain, fails ACME issuance. → **Mitigation**: the example is clearly commented as requiring a real, DNS-resolvable domain for automatic HTTPS, with `tls internal` called out explicitly as the local-testing substitute.

## Migration Plan

Fully additive — no existing config field, route, or deployment path changes behavior when `TESTPULSE_TLS_CERT_FILE`/`TESTPULSE_TLS_KEY_FILE` are unset (the default). No database migration. Rollback is simply unsetting the two env vars.
