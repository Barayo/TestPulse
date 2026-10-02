# ci-security-scanning

## Purpose

Catching a code-level vulnerability pattern, a known-vulnerable
dependency/stdlib version, or a license-incompatible dependency before
merge, across every first-party Go module and the web frontend — closing
the gap where nothing in CI caught any of these before, only Dependabot's
manifest-level CVE scanning (`add-codeql-and-govulncheck`,
`trademark-license-review`).

## Requirements

### Requirement: Every first-party Go module is vulnerability-scanned in CI
Each of the three first-party Go modules (`apps/api`,
`tools/import-connector`, `tools/jira-connector`) SHALL be scanned by
`govulncheck` on every pull request, and the corresponding CI job SHALL
fail if a reachable known vulnerability is found.

#### Scenario: A reachable stdlib vulnerability fails CI
- **WHEN** a pull request's Go toolchain version has a known, reachable
  standard-library vulnerability
- **THEN** the module's CI job fails with the vulnerability reported

#### Scenario: A clean module passes
- **WHEN** a pull request introduces no new reachable vulnerability in a
  Go module
- **THEN** that module's govulncheck step passes

### Requirement: The two connector modules have the same CI coverage as apps/api
`tools/import-connector` and `tools/jira-connector` SHALL each be built,
vetted, linted, and tested in CI on every pull request, matching the
`apps/api` job's existing coverage.

#### Scenario: A connector build failure fails CI
- **WHEN** a pull request breaks the build of `tools/import-connector` or
  `tools/jira-connector`
- **THEN** that module's CI job fails

#### Scenario: A connector lint violation fails CI
- **WHEN** a pull request introduces a `golangci-lint` violation in either
  connector module
- **THEN** that module's CI job fails

#### Scenario: A connector test failure fails CI
- **WHEN** a pull request breaks an existing test in either connector
  module
- **THEN** that module's CI job fails

### Requirement: Go and web source are scanned by CodeQL
Every pull request SHALL be analyzed by CodeQL for both Go (across all
three modules) and JavaScript/TypeScript (`apps/web`) code-level
vulnerability patterns. The same analysis SHALL also run on a recurring
schedule against `main`, independent of any pull request, so a
newly-disclosed pattern is caught against unchanged code. Because this
repository has no budget for GitHub Advanced Security, a finding fails
the CI job directly (CodeQL's own SARIF output is parsed and the job
exits non-zero on any result) rather than being surfaced through GitHub's
Code Scanning UI or inline PR annotations.

#### Scenario: A pull request is analyzed by CodeQL
- **WHEN** a pull request changes Go or TypeScript/JavaScript source
- **THEN** CodeQL analyzes the changed language(s) and reports any finding

#### Scenario: A scheduled scan runs independent of any pull request
- **WHEN** the weekly CodeQL schedule fires
- **THEN** CodeQL analyzes the current `main` branch for both languages,
  without requiring an open pull request

#### Scenario: A CodeQL finding fails the CI job
- **WHEN** CodeQL's analysis produces one or more results for a language
- **THEN** that language's CI job fails, and the full SARIF output is
  available as a downloadable build artifact

### Requirement: Dependency licenses are checked in CI
Every pull request's dependency tree — the npm workspace (`apps/web` and
`packages/shared`) and each first-party Go module (`apps/api`,
`tools/import-connector`, `tools/jira-connector`) — SHALL be scanned for
license compatibility with TestPulse's own AGPL-3.0-only license, and the
corresponding CI job SHALL fail if a disallowed license (GPL-2.0-only, the
LGPL family, BSL-1.1, SSPL-1.0, Elastic-2.0, or any unrecognized/unknown
license) is found on any dependency, direct or transitive.

#### Scenario: A disallowed-license dependency fails CI
- **WHEN** a pull request introduces a dependency (direct or transitive)
  carrying a disallowed license
- **THEN** the license-check CI job fails, naming the dependency and its
  license

#### Scenario: A clean dependency tree passes
- **WHEN** a pull request introduces no dependency with a disallowed or
  unrecognized license
- **THEN** the license-check CI job passes

### Requirement: The committed THIRD-PARTY-LICENSES file stays current
A `THIRD-PARTY-LICENSES` file at the repository root SHALL list every
third-party dependency's license across the npm workspace and all three
Go modules. The license-check CI job SHALL fail if a fresh scan's output
differs from the committed file's contents.

#### Scenario: An undeclared new dependency fails CI
- **WHEN** a pull request adds a dependency without regenerating
  `THIRD-PARTY-LICENSES`
- **THEN** the license-check CI job fails, naming the drift and the `make`
  command to regenerate the file

#### Scenario: A regenerated file matching the dependency tree passes
- **WHEN** `THIRD-PARTY-LICENSES` was regenerated and committed alongside
  a dependency change
- **THEN** the license-check CI job's drift check passes
