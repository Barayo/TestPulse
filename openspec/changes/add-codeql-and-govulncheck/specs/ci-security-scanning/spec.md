## ADDED Requirements

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
newly-disclosed pattern is caught against unchanged code.

#### Scenario: A pull request is analyzed by CodeQL
- **WHEN** a pull request changes Go or TypeScript/JavaScript source
- **THEN** CodeQL analyzes the changed language(s) and reports any finding

#### Scenario: A scheduled scan runs independent of any pull request
- **WHEN** the weekly CodeQL schedule fires
- **THEN** CodeQL analyzes the current `main` branch for both languages,
  without requiring an open pull request
