## Why

As a developer or agent integrating with TestPulse, when I want to explore
or test the API, I want interactive, always-accurate documentation served
directly from my running instance, so I don't have to manually locate and
parse `packages/shared/openapi.yaml` from the repo, or risk consulting docs
that don't match the version actually deployed (issue #158).

`docs/api.md` already treats `openapi.yaml` as the source of truth and
links to it on GitHub, but that's a raw YAML file, not a rendered or
interactive view — and self-hosted/air-gapped deployments have no path to
a docs site at all today.

## What Changes

- Serve the existing OpenAPI contract as a live, rendered, interactive
  endpoint (`GET /docs`) from the Go API binary itself, using the same
  `go:embed` pattern already established for the web UI bundle
  (`apps/api/internal/web`).
- Add a `bearerAuth` security scheme to `openapi.yaml` (currently absent —
  verified by grep, zero `securitySchemes` hits) so Swagger UI's
  "Authorize" dialog and "Try it out" actually work against a scoped API
  token, not just in theory.
- Disable Swagger UI's default external spec-validation badge
  (`validatorUrl: null`) — it phones home to `validator.swagger.io` by
  default, which both violates this project's just-shipped
  `Content-Security-Policy` (`connect-src 'self'`) and is wrong for a
  self-hosted/air-gapped deployment.
- Unauthenticated route, mounted alongside the embedded web UI — the
  API's shape is already public via the OSS repo's `openapi.yaml`, so this
  exposes nothing new.
- Update `docs/api.md` to point at the live endpoint alongside the raw
  file link.

## Capabilities

### New Capabilities
- `live-api-docs`: a running TestPulse instance serves its own interactive,
  always-in-sync API documentation with no external hosting dependency.

### Modified Capabilities
(none)

## Impact

- **Backend**: new `apps/api/internal/apidocs` package (mirrors
  `internal/web`'s embed/serve pattern); `apps/api/internal/server/server.go`
  (mount `/docs`).
- **Contract**: `packages/shared/openapi.yaml` (`bearerAuth` security
  scheme).
- **Build**: `Makefile` (new sync target mirroring `sync-web`),
  `Dockerfile` (copy step), `.github/workflows/ci.yml` (drift check
  mirroring the existing "Contract types are current" step).
- **Docs**: `docs/api.md`.
- **Sample Project**: exempt — developer-tooling surface, not a
  user-visible product feature (CLAUDE.md's standing exemption).
