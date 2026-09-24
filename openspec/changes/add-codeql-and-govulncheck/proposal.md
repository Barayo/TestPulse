## Why

As a maintainer, when a PR introduces a code-level vulnerability pattern (SQL
injection, XSS, insecure crypto, path traversal) or a dependency/stdlib
vulnerability, I want CI to catch it before merge, so it doesn't depend
solely on manual review or Dependabot's manifest-level scanning. Today
`.github/workflows/ci.yml` runs build/lint/test/coverage/Helm-lint/secret-
scan/DCO/migrations-guard — no CodeQL, no `govulncheck`, no code-level
scanning at all (issue #188).

Scoping this while implementing surfaced a materially bigger gap than the
issue's own text anticipated: `tools/import-connector` and
`tools/jira-connector` (separate Go modules, handle third-party
credentials, make outbound requests) have **zero CI coverage of any kind**
today — not just missing vuln scanning, no build/test/lint either. Running
the intended tools against them locally found real, live problems: 4
pre-existing lint violations in `jira-connector` (3 unchecked
`resp.Body.Close()`, 1 non-idiomatic capitalized error string), and 7
reachable stdlib/dependency vulnerabilities in `apps/api` alone (plus
overlapping stdlib ones in both connectors) — all fixed by a `go
1.26.5`→`1.26.6` toolchain patch bump plus a `golang.org/x/image`
v0.44.0→v0.45.0 bump. Shipping a scanning gate that's red on day one, or
silently ignoring what it finds, would be worse than not shipping it.

## What Changes

- Add a CodeQL workflow (`.github/workflows/codeql.yml`) analyzing Go
  (manual build mode, across all 3 Go modules) and JavaScript/TypeScript
  (`apps/web`), on PRs plus a weekly schedule to catch newly-disclosed CVEs
  against unchanged code.
- Add a `govulncheck` step to the existing `api` CI job (`apps/api`).
- Add two new CI jobs, `import-connector` and `jira-connector`, mirroring
  the `api` job's shape (build, vet, lint, test, govulncheck) — the first
  CI coverage of any kind for these two modules.
- Fix the 4 real lint violations `golangci-lint` finds in `jira-connector`
  once it's actually run.
- Bump the Go toolchain (`go 1.26.5` → `1.26.6`) in all 3 `go.mod` files and
  bump `golang.org/x/image` to v0.45.0 in `apps/api`, closing every
  vulnerability `govulncheck` currently finds as reachable, so the new gate
  is green from day one.

## Capabilities

### New Capabilities
- `ci-security-scanning`: CI-level static/vulnerability scanning across
  every first-party Go module and the web frontend.

### Modified Capabilities
(none)

## Impact

- **CI**: `.github/workflows/ci.yml` (new `govulncheck` step on `api`, two
  new jobs), new `.github/workflows/codeql.yml`.
- **Dependencies**: `apps/api/go.mod`/`go.sum` (`golang.org/x/image` bump),
  `go` directive bumped in all 3 `go.mod` files.
- **Code**: `tools/jira-connector/internal/jiraclient/client.go`,
  `tools/jira-connector/internal/testpulseclient/client.go` (lint fixes
  only — no behavior change).
- **Docs**: `docs/development.md` (or wherever CI checks are documented) —
  note the new scanning jobs and what they cover.
- **Sample Project**: exempt — pure CI/infra change, no user-visible
  surface (CLAUDE.md's standing exemption).
