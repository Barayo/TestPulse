## 1. Config

- [x] 1.1 Write failing tests in `apps/api/internal/config/config_test.go`: `TESTPULSE_TLS_CERT_FILE`/`TESTPULSE_TLS_KEY_FILE` both unset → `Config.TLSCertFile`/`TLSKeyFile` empty, no error; both set → both fields populated; only one set (each direction) → `Load` returns an error naming the missing variable.
- [x] 1.2 Run the tests, confirm they fail (fields/validation don't exist yet).
- [x] 1.3 Add `TLSCertFile`, `TLSKeyFile string` fields to `config.Config`, read via `getenv` in `Load`, and a validation check (mirroring the existing `LogLevel` enum check's fail-fast style) rejecting exactly-one-set with `fmt.Errorf` naming the missing variable. Add both to the package doc comment's documented-variables list.
- [x] 1.4 Run the tests, confirm they pass.

## 2. Server startup

- [x] 2.1 Write a failing integration test in `apps/api/cmd/testpulse-api/tls_test.go` (new file): generate a self-signed cert+key to a temp dir using `crypto/ecdsa`/`crypto/x509`/`crypto/rand`/`encoding/pem` (a self-contained test helper, nothing checked into the repo), start the real server via a new testable `serve(ln net.Listener, srv *http.Server, cfg config.Config) error` helper (extracted so the test can bind its own ephemeral-port listener and learn the port, since `ListenAndServeTLS` binds its own listener internally and never reports the port back), connect with an `http.Client` whose `tls.Config.RootCAs` trusts the generated cert (not `InsecureSkipVerify`), and assert the request succeeds over HTTPS.
- [x] 2.2 Second test in the same file: with no TLS config, `serve` serves plain HTTP unchanged. (The cert-file-only-rejected case is already covered by `config_test.go`'s task-1 tests — `run()` calls `config.Load` first and returns its error before any listener is created, so no separate main-package test is needed for that path.)
- [x] 2.3 Run both tests, confirm they fail (`serve` doesn't exist yet).
- [x] 2.4 In `apps/api/cmd/testpulse-api/main.go`, add the `serve` helper and wire it in: `net.Listen(\"tcp\", cfg.Addr)` once, then `serve(ln, srv, cfg)` in the existing goroutine — TLS via `srv.ServeTLS` when `cfg.TLSCertFile != \"\"`, plain `srv.Serve` otherwise. No second plain-HTTP listener (design.md D3).
- [x] 2.5 Run both tests, confirm they pass.

## 3. Reverse-proxy example (Caddy)

- [x] 3.1 Add `deploy/compose/docker-compose.tls.yml`: a compose override adding a `caddy` service in front of the existing `app` service, publishing 443 (and 80 for ACME HTTP-01 challenge), setting `TESTPULSE_PUBLIC_URL` to the HTTPS form. (The base file's `app` 8080 host mapping is left in place with a comment noting production operators should restrict it themselves — removing it via override merge semantics was more fragile than it was worth for an example file.)
- [x] 3.2 Add `deploy/compose/Caddyfile`: reverse-proxies to `app:8080`, sets `X-Forwarded-Proto` explicitly via `header_up`, comments showing both the real-domain automatic-HTTPS form and the `tls internal` local-testing substitute.
- [x] 3.3 Manually verified: `docker compose -f deploy/compose/docker-compose.yml -f deploy/compose/docker-compose.tls.yml up` serves the app over HTTPS locally (`curl -sk https://localhost/healthz` → 200), and logging in via `curl -sk https://localhost/api/v1/auth/login` returns a `Set-Cookie` with `Secure` set, confirming `X-Forwarded-Proto: https` reaches the app correctly.

## 4. Docs

- [x] 4.1 Rewrite `docs/deployment.md`'s "Put TLS at the ingress/load balancer" bullet and the "Security status" TLS paragraph to describe both paths: native TLS (env vars, bring-your-own-cert, no auto-renewal) and reverse-proxy (Caddy/nginx/Traefik, with the Caddy compose override as the concrete example), retiring the "this project doesn't ship a way to do that" aside now that it's inaccurate. Added a new "TLS termination" section covering both paths in full.
- [x] 4.2 Add nginx and Traefik configuration snippets (config block, not a runnable compose override) to `docs/deployment.md`, each explicitly setting `X-Forwarded-Proto: https`.
- [x] 4.3 Update the config env var table in `docs/deployment.md` to include `TESTPULSE_TLS_CERT_FILE`/`TESTPULSE_TLS_KEY_FILE`.

## 5. Verification

- [x] 5.1 Run `make lint-api coverage-api` and confirm both pass with coverage ≥80% (82.7%; a sampledata DB-contention flake on the first run was confirmed unrelated by rerunning in isolation and then rerunning the full target clean). Also ran `make test-api` (`go test ./...`, includes `cmd/testpulse-api` which `coverage-api` deliberately excludes per its `internal/...`-only scope) — fully green, confirming the new TLS integration tests actually execute in the suite CI runs.
- [x] 5.2 Ran `make lint-web` — clean (0 issues beyond pre-existing warnings unrelated to this change). Skipped `coverage-web`: no web code changed by this backend/docs/deploy-only change.
