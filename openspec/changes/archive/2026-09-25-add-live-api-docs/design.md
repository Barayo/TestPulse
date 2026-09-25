## Context

`apps/api/internal/web/web.go` establishes the pattern this change reuses:
`//go:embed all:dist` embeds a directory that's populated at build time (not
committed as real content — a placeholder `dist/index.html` is committed so
`go build`/`go test` work standalone), and `Makefile`'s `sync-web` /
`Dockerfile`'s `COPY --from=web` populate it for real before compiling.

`packages/shared/openapi.yaml` cannot be embedded directly from
`apps/api` — Go's `//go:embed` patterns may not contain `..` and are
resolved relative to the source file's own directory, so a file outside
`apps/api`'s directory tree is simply unreachable no matter the module
layout. The same physical-copy step `sync-web` already uses for the web
bundle is the only way to get it there.

Verified before designing (not assumed from the issue text):
`openapi.yaml` currently has **zero `securitySchemes`** — grep confirms no
hits. The issue's claim that "TestPulse's scoped API tokens already work
exactly like Swagger UI's Authorize dialog expects" is aspirational, not
current fact: without a declared security scheme, Swagger UI renders no
Authorize lock icon at all. This change has to add the scheme, not just
assume it.

Also relevant: `add-content-security-policy` (shipped the prior session)
set `Content-Security-Policy: script-src 'self'; connect-src 'self'; ...`
globally via `securityHeaders`. Swagger UI's standalone distribution
(`swagger-ui-dist`, Apache-2.0) ships `index.html` referencing its JS
bundle, standalone-preset, and initializer as **external `<script src=...>`
files**, not inline script — this composes cleanly with `script-src
'self'` with zero relaxation needed. Its one inline `<style>` reset block
is already covered by the existing `style-src 'self' 'unsafe-inline'`
(added for React's `style={{}}` usage, not specifically for this). The one
real conflict: Swagger UI's default config points a "validate this spec"
badge at `https://validator.swagger.io/validator`, which `connect-src
'self'` would block — and which is wrong behavior for a self-hosted/
air-gapped deployment regardless of CSP, so it needs to be disabled, not
allowlisted.

## Goals / Non-Goals

**Goals:**
- Any running instance (including self-hosted/air-gapped ones) serves its
  own interactive API docs with zero external dependency, always
  reflecting exactly the version deployed.
- "Try it out" works against a real scoped API token, via a real
  `bearerAuth` scheme in the contract — not just a doc-only claim.
- No CSP relaxation required — this composes with the existing policy
  as-is.

**Non-Goals:**
- Not building a custom docs UI/theme — the stock `swagger-ui-dist`
  distribution, pointed at our own spec, is sufficient.
- Not adding session-cookie-based "Authorize" UX beyond what falls out for
  free: a human already logged into the same browser tab gets their
  session cookie sent automatically on "Try it out" requests (same-origin
  fetch, default credentials mode) with no extra work — bearerAuth is
  for the agent/token case Swagger UI's Authorize dialog is actually built
  around.
- Not gating `/docs` behind auth — the API's shape is already public via
  the OSS repo's `openapi.yaml`; an unauthenticated endpoint reveals
  nothing new (proposal.md).
- Not changing how `packages/shared/openapi.yaml` is authored or versioned
  — this only adds a security scheme to it and a new consumer (the
  embedded docs endpoint), following the same contract-first workflow
  (CLAUDE.md) as any other spec edit.

## Decisions

**D1: `swagger-ui-dist` (Apache-2.0) over ReDoc.** The issue's own
recommendation, confirmed: the agent-onboarding use case needs "Try it
out" (live requests against the real instance), which Swagger UI has and
ReDoc (read-only) doesn't. Both are open source, satisfying CLAUDE.md's
stack-addition constraint.

**D2: A new `apps/api/internal/apidocs` package, structurally identical to
`internal/web`.** `//go:embed all:dist` for the Swagger UI static assets,
`//go:embed openapi.yaml` for the spec itself, both populated by a new
`sync-api-docs` Makefile target (mirroring `sync-web`) and a new
`Dockerfile` copy step:
- `packages/shared/openapi.yaml` → `apps/api/internal/apidocs/openapi.yaml`
- `node_modules/swagger-ui-dist/*` (minus files we don't need) →
  `apps/api/internal/apidocs/dist/`, with `swagger-initializer.js`
  rewritten (a small script, not manual) to point `url:` at our own
  `/docs/openapi.yaml` instead of the default Petstore demo, and add
  `validatorUrl: null`.
- A committed placeholder (real committed copy of the current
  `openapi.yaml`, not a dummy) for both embedded files, matching
  `internal/web`'s placeholder-`dist/index.html` precedent, so `go build`/
  `go test` work in CI's `api` job without running the sync step first —
  same reasoning: that job never runs `sync-web` either and relies on the
  committed placeholder.

**D3: A CI drift check, mirroring the existing "Contract types are
current" step in the `web` job (`ci.yml` line ~163).** A new step in the
`api` job re-runs `sync-api-docs`'s copy and `git diff --exit-code`s the
result — if `openapi.yaml` changes without the committed embedded copy
being refreshed, CI fails the same way a stale generated TS client already
does.

**D4: Add `bearerAuth` to `openapi.yaml`'s `components.securitySchemes`,
applied as the default top-level `security` requirement.**
```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []
```
Purely additive — doesn't change any request/response shape, so it's safe
against the `openapi-typescript`-generated client and its own CI drift
check (`web` job). Individual public/unauthenticated routes (health
probes, `/api/v1/public/...`) can override with `security: []` per-operation
if Swagger UI's padlock-per-route accuracy matters later; not required for
this change to be useful.

**D5: `/docs` is unauthenticated, mounted at the router's top level
alongside the embedded web UI** — not inside the `authenticate` middleware
group, not gated by any settings flag. Matches proposal.md's reasoning
(nothing new exposed) and keeps parity with self-hosted/air-gapped
deployments having zero external dependency for this.

## Risks / Trade-offs

- **A committed duplicate of `openapi.yaml`'s content can drift from the
  real source of truth** → Mitigated by D3's CI drift check, the same
  mitigation this codebase already trusts for the generated TS client.
- **`swagger-ui-dist` version updates need a manual `sync-api-docs` rerun
  to pick up upstream fixes** → Acceptable; it's a small, infrequently-
  updated static asset bundle, same maintenance shape as any vendored
  dependency.
- **Adding a global `security` requirement to `openapi.yaml` could be
  read as implying every route needs a token**, when several are
  actually unauthenticated (`/healthz`, `/api/v1/public/...`) → Accepted
  for this change (D4) — Swagger UI still functions correctly either way
  (an unauthenticated route just doesn't strictly need the header sent),
  and per-operation `security: []` overrides are a cheap, uncontroversial
  follow-up if the padlock accuracy ever actually matters to someone.

## Migration Plan

No schema/data migration. New route, new build-time sync step, new CI
step. Rollback is reverting the commit; no feature flag needed since
`/docs` failing to build would fail CI, not ship silently broken.
