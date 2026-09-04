## Why

.NET/xUnit developers running `dotnet test` in CI have no way to link a
test to a TestPulse case key today — pytest, Maven/JUnit, Gradle/JUnit,
Jest, and Go all already have importer plugins, but .NET, one of the
largest active-codebase ecosystems (issue #170, split from #58), does
not. Unlike Go, .NET's MSBuild supports auto-wiring a step after
`dotnet test` (the same mechanism the widely-used `coverlet.msbuild`
package already relies on), so this plugin can match Gradle/Maven's
"one command does everything" convenience rather than falling back to
Go's explicit-CLI-only design.

## What Changes

- New public repo `Barayo/testpulse-dotnet` (MIT license), a single
  combined NuGet package `TestPulse.MSBuild` (`net8.0`+) providing:
  - `[TestPulseCase(caseKey, platform = null, version = null, tags =
    null)]` — a custom attribute for xUnit test methods, discoverable via
    plain reflection (no xUnit-specific trait-discoverer machinery
    needed).
  - `TestPulseAttachments.Attach(caseKey, bytes, filename, contentType)`
    — records a screenshot/artifact attachment, validated against the
    calling test method's own declared case key.
  - An MSBuild `.targets` file, auto-wired via `AfterTargets="VSTest"`
    (verified as the real hook `dotnet test` invokes, the same one
    `coverlet.msbuild` uses), that reflects over the compiled test
    assembly, injects `<properties>` into the `JunitXml.TestLogger`-
    produced report (which does not natively support them), and submits
    to TestPulse's import API — mirroring the config resolution,
    exit-code, and dry-run behavior already shipped in the other four
    plugins.
- Depends on `JunitXml.TestLogger` (flows transitively to the consuming
  test project) for JUnit XML generation — no official .NET JUnit XML
  writer exists, same fundamental gap Surefire and Gradle's own writer
  had.
- `docs/importing-results.md` gains a ".NET: `testpulse-dotnet`" section
  in this monorepo (docs-update, no code change here).

## Capabilities

### New Capabilities
- `dotnet-import-plugin`: the `testpulse-dotnet` module's observable
  contract — the `[TestPulseCase]`/`Attach` API, the auto-wired
  annotate/submit behavior, config resolution, exit-code policy, and
  dry-run behavior, and its dependency on `JunitXml.TestLogger` for JUnit
  XML generation.

### Modified Capabilities
(none — `execution-import`'s API contract is unchanged; this plugin is a
new client of it)

## Impact

- New standalone NuGet package/repo, not part of this monorepo's build.
- No changes to `apps/api` or `packages/shared/openapi.yaml` — this
  plugin is purely a client of the existing `POST
  /api/v1/projects/{projectKey}/imports` contract.
- `docs/importing-results.md` in this monorepo gets a new section.
- No new user-visible surface inside TestPulse itself (no API, no UI, no
  seed data) — the Sample-Project-showcase task does not apply, same as
  the four prior plugin changes.
