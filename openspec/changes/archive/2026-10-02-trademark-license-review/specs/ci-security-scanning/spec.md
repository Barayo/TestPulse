## ADDED Requirements

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
