## 1. Add a bearer security scheme to the contract

- [x] 1.1 Edit `packages/shared/openapi.yaml`: add `components.securitySchemes.bearerAuth` (`type: http, scheme: bearer`) and a top-level `security: [{bearerAuth: []}]` (design.md D4).
- [x] 1.2 Run `make generate` (`npm -w @testpulse/shared run generate`), confirm `git diff packages/shared/src` is empty (purely additive spec change, matching the CI drift check's own assumption).
- [x] 1.3 Run `npx swagger-cli validate packages/shared/openapi.yaml` (or equivalent already-used validator, check `package.json` scripts) if one exists in this repo; otherwise confirm the YAML parses via the `generate` step succeeding.

## 2. Vendor swagger-ui-dist and the sync step

- [x] 2.1 Add `swagger-ui-dist` as a `devDependency` of `packages/shared/package.json` (Apache-2.0, satisfies CLAUDE.md's open-source constraint).
- [x] 2.2 Run `npm install`, confirm `node_modules/swagger-ui-dist` exists.
- [x] 2.3 Add a small Node script (e.g. `packages/shared/scripts/sync-api-docs.mjs`) that: copies `node_modules/swagger-ui-dist`'s runtime files (`index.html`, `swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`, `swagger-ui.css`, `favicon-32x32.png`, `favicon-16x16.png`) into `apps/api/internal/apidocs/dist/`; copies `packages/shared/openapi.yaml` into `apps/api/internal/apidocs/openapi.yaml`; rewrites the copied `swagger-initializer.js`'s `url:` field from the Petstore default to `"openapi.yaml"` and adds `validatorUrl: null` (design.md D2, the connect-src/air-gapped reasoning).
- [x] 2.4 Add a `sync-api-docs` target to the root `Makefile` (mirroring `sync-web`) that runs this script.
- [x] 2.5 Run `make sync-api-docs`, confirm `apps/api/internal/apidocs/dist/` and `apps/api/internal/apidocs/openapi.yaml` are populated, then commit these as the real (not placeholder) initial content — matching `internal/web`'s committed-dist precedent, since this content doesn't require a build step to produce, only a copy.

## 3. The apidocs package

- [x] 3.1 Write a failing test `TestServesSpecAtOpenAPIPath` in `apps/api/internal/apidocs/apidocs_test.go` (mirroring `internal/web/web_test.go`'s `fstest.MapFS` pattern) asserting `GET /openapi.yaml` returns the embedded spec bytes with `Content-Type: application/yaml`.
- [x] 3.2 Write a failing test `TestServesSwaggerUIAtRoot` asserting `GET /` returns the embedded `index.html` content.
- [x] 3.3 Write a failing test `TestServesStaticAssets` asserting `GET /swagger-ui-bundle.js` (or another embedded static asset) returns its content, not the index fallback.
- [x] 3.4 Run the tests, confirm they fail (package doesn't exist yet).
- [x] 3.5 Implement `apps/api/internal/apidocs/apidocs.go`: `//go:embed all:dist` and `//go:embed openapi.yaml`, a `Handler() http.Handler` serving `/openapi.yaml` from the spec bytes and everything else from the dist `fs.FS` (static file, no SPA fallback needed — unlike `internal/web`, an unmatched path here should 404, not redirect to the Swagger UI shell).
- [x] 3.6 Run the tests, confirm they pass.

## 4. Mount the route

- [x] 4.1 Write a failing test `TestScenario_DocsEndpointServesWithoutAuthentication` in `apps/api/internal/server/server_test.go` asserting `GET /docs` (unauthenticated) returns 200.
- [x] 4.2 Run the test, confirm it fails (404, no such route yet).
- [x] 4.3 Implement: `r.Mount("/docs", apidocs.Handler())` in `server.go`, registered before the catch-all `r.NotFound(web.Handler().ServeHTTP)`, outside the authenticated route group.
- [x] 4.4 Run the test, confirm it passes.

## 5. Docker and CI

- [x] 5.1 Add a `COPY --from=web` step to the `Dockerfile`'s API build stage that runs the same sync (or copies the pre-synced `apps/api/internal/apidocs/` directory the same way `internal/web/dist` is already copied) so container builds always have the live contract embedded, not the committed snapshot.
- [x] 5.2 Add a "Docs contract is current" step to the `api` job in `.github/workflows/ci.yml`, mirroring the `web` job's "Contract types are current" step: run the sync script, then `git diff --exit-code apps/api/internal/apidocs` (design.md D3).
- [x] 5.3 Push a scratch branch or use `act`/local validation to confirm this new CI step actually fails when `openapi.yaml` is edited without re-running sync, and passes when it is (a drift check that never fires is worse than none).

## 6. Documentation

- [x] 6.1 Update `docs/api.md`: add a note pointing at the live `GET /docs` endpoint on any running instance, alongside the existing raw-file link, per CLAUDE.md's standing docs rule.

## 7. Full verification

- [x] 7.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 7.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 7.3 Run `make lint-api`, confirm clean.
- [x] 7.4 Run `npm -w web run typecheck` (or the full `web` CI job's steps locally) to confirm the `bearerAuth` scheme addition didn't break the generated TS client.
- [x] 7.5 Deploy locally (`docker compose down -v` + `up --build -d`) and load `http://localhost:8080/docs` in a real browser. Verify: the page renders Swagger UI with the real TestPulse spec (not the Petstore demo), the browser console shows no CSP violations, and "Authorize" + "Try it out" against a real endpoint (e.g. `GET /api/v1/projects` with a real API token) succeeds.
