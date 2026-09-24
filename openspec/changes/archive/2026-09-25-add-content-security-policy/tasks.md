## 1. Add the Content-Security-Policy header

- [x] 1.1 Write a failing test extending `TestSecurityHeadersPresentOnEveryResponse` in `apps/api/internal/server/server_test.go` (or a new dedicated test) asserting the `Content-Security-Policy` header on `GET /healthz`'s response equals the exact directive string from design.md D1 (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`).
- [x] 1.2 Run the test, confirm it fails (no `Content-Security-Policy` header set yet).
- [x] 1.3 Implement: add the `Content-Security-Policy` header to `securityHeaders` in `apps/api/internal/server/middleware.go`, set unconditionally (not gated on `requestIsHTTPS`, matching every header here except HSTS — design.md D2).
- [x] 1.4 Run the test, confirm it passes.

## 2. Add frame-ancestors alongside the existing X-Frame-Options

- [x] 2.1 Confirm (via the same test from 1.1) that `frame-ancestors 'none'` is present in the CSP header string, and that `X-Frame-Options: DENY` is still also set unchanged — no separate task needed if 1.1's assertion already covers the full directive string.

## 3. Verify against the real built bundle

- [x] 3.1 Run `make build` (or `cd apps/web && npm run build`) to produce a real `apps/web/dist/`, confirming no inline `<script>`/`<style>` tags exist in `dist/index.html` beyond Vite's own hashed module script and stylesheet link (re-confirms design.md's Context audit still holds after any web changes since that audit).
- [x] 3.2 Deploy locally (`docker compose down -v` + `up --build -d`) and load the app in a real browser. Verify: the app renders and functions correctly (login, navigate a project, open a run) with no browser console CSP violation errors. Check the Network tab response headers for `Content-Security-Policy` on at least one request.
- [x] 3.3 Run the full `apps/web/e2e/` suite against the rebuilt stack (`make e2e`), confirming no CSP-caused failures (a directive violation would break rendering or interaction, not just log a console warning).

## 4. Documentation

- [x] 4.1 Update `docs/deployment.md`'s security-status section (or wherever `securityHeaders` is documented) noting the CSP is now set, listing the directive set, and noting that adding a new external resource (CDN script/font/image, third-party iframe) requires updating the policy in `middleware.go`.

## 5. Full verification

- [x] 5.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 5.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 5.3 Run `make lint-api`, confirm clean.
