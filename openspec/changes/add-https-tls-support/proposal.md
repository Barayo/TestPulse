## Why

As an operator deploying TestPulse, when I run it on an untrusted network (the public internet, or a shared network I don't fully control), I want traffic — including session cookies and credentials — encrypted in transit, so authentication isn't exposed to network sniffing the way it currently is over plain HTTP. `docs/deployment.md` already documents this gap explicitly ("Do not expose a TestPulse instance to an untrusted network without a TLS-terminating proxy in front of it") and the session cookie's `Secure` flag only matters once there's an actual TLS connection to protect.

## What Changes

- Add optional native TLS termination to the Go API: `TESTPULSE_TLS_CERT_FILE`/`TESTPULSE_TLS_KEY_FILE` env vars: when both are set, the server calls `srv.ListenAndServeTLS` instead of `srv.ListenAndServe`. No automatic certificate issuance/renewal (no ACME/Let's Encrypt integration) — the operator supplies and rotates the cert/key files themselves. Fails fast at startup if only one of the pair is set (an unambiguous misconfiguration, not a silent fallback to plain HTTP).
- Document the reverse-proxy path with concrete, copy-pasteable examples (Caddy, nginx, Traefik) replacing the current abstract warning in `docs/deployment.md`, each confirmed to forward `X-Forwarded-Proto: https` so the session cookie's existing `Secure`-detection logic (`requestIsHTTPS`) works correctly.
- Add a documented `deploy/compose/docker-compose.tls.yml` (or equivalent compose override) showing Caddy terminating TLS in front of the existing compose stack, as a concrete runnable example rather than prose alone.
- `docs/deployment.md`'s "Security status" section updated to reflect that native TLS termination now exists as an option, retiring the "this project doesn't ship a way to do that" aside.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `platform-deployment`: adds a requirement that the API can optionally terminate TLS natively via configuration, and that documented reverse-proxy patterns exist for the alternative (proxy-terminated) deployment path.

## Impact

- **Backend**: `apps/api/internal/config/config.go` (new fields + validation), `apps/api/cmd/testpulse-api/main.go` (conditional `ListenAndServeTLS`).
- **Tests**: a server-startup integration test using a self-signed certificate (generated in-test via `crypto/tls`/`crypto/x509`, not checked into the repo) to verify the server actually serves HTTPS when configured, and that a cert/key mismatch (only one set) fails startup with a clear error.
- **Deploy**: new Caddy-fronted compose override + example `Caddyfile`; `docs/deployment.md` rewritten reverse-proxy section with nginx/Traefik snippets alongside Caddy.
- **Docs**: `docs/deployment.md` (primary), `README.md`/`ROADMAP.md` only if quickstart instructions are affected (they aren't — local dev stays plain HTTP).
- No change to the Helm chart — it already supports ingress-terminated TLS via the standard `ingress.tls` values field (cert-manager pattern), which this change doesn't touch.
