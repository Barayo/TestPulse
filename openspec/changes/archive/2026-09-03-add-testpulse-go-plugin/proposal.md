## Why

Go developers running `go test` in CI have no way to link a test to a
TestPulse case key today — every other actively-used JVM/JS ecosystem
(pytest, Maven/JUnit, Jest) already has an importer plugin
(`pytest-testpulse`, `testpulse-maven-plugin`, `testpulse-gradle-plugin`,
`testpulse-jest`), but Go, one of the largest active-codebase ecosystems
still uncovered, does not (issue #169, split from #58). Go's `testing`
package recently (Go 1.25, Aug 2025) gained a stable `t.Attr(key, value
string)` method — a native `record_property()`-equivalent that didn't
exist when #58 was first scoped — and `gotestsum` (the de facto standard
`go test -json`-to-JUnit-XML tool) added native support for converting
`t.Attr` calls into `<properties>` as of v1.13.0 (Sep 2025). This makes a
Go plugin both newly practical and structurally simpler than every prior
plugin: no reflection-based XML post-processing step is needed at all.

## What Changes

- New public repo `Barayo/testpulse-go` (MIT license), a Go module
  requiring Go 1.25+, providing:
  - `testpulse.Case(t *testing.T, caseKey string, opts ...Option)` — calls
    `t.Attr("testpulse_case_key", caseKey)` and the optional
    `testpulse_platform`/`testpulse_version`/`testpulse_tags` attrs via
    `WithPlatform`/`WithVersion`/`WithTags` options.
  - `testpulse.Attach(t *testing.T, caseKey string, data []byte,
    filename, contentType string) error` — records a screenshot/artifact
    attachment for the given test and case key, validated against that
    same test's own declared case key(s), no reflection required (unlike
    the Gradle plugin's `StackWalker`-based equivalent).
  - A `testpulse-go` CLI with a `submit` subcommand that reads a
    `gotestsum`-produced JUnit XML report plus any recorded attachments,
    and submits them to TestPulse's import API, mirroring the config
    resolution, exit-code, and dry-run behavior already shipped in the
    three existing plugins (adapted to Go's ecosystem: 2-tier config
    resolution, no build-file config tier).
- Depends on `gotestsum` for JUnit XML generation rather than
  reimplementing a writer — Go has no official stdlib JUnit XML output.
- `docs/importing-results.md` gains a "Go: `testpulse-go`" section in this
  monorepo (docs-update, no code change here).

## Capabilities

### New Capabilities
- `go-import-plugin`: the `testpulse-go` module's observable contract —
  the `Case`/`Attach` API, the `submit` CLI's config resolution, exit-code
  policy, and dry-run behavior, and its dependency on `gotestsum` for
  JUnit XML generation.

### Modified Capabilities
(none — `execution-import`'s API contract is unchanged; this plugin is a
new client of it)

## Impact

- New standalone Go module/repo, not part of this monorepo's build.
- No changes to `apps/api` or `packages/shared/openapi.yaml` — this
  plugin is purely a client of the existing `POST
  /api/v1/projects/{projectKey}/imports` contract.
- `docs/importing-results.md` in this monorepo gets a new section.
- No new user-visible surface inside TestPulse itself (no API, no UI, no
  seed data) — the Sample-Project-showcase task does not apply, same as
  the three prior plugin changes.
