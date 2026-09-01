## ADDED Requirements

### Requirement: Releases are reachable from project navigation
For a project that has at least one Release, the web UI SHALL provide a
reachable path from the project to its Releases, each Release to its Test
Plans, and each Test Plan to its Runs, addressed by key
(`/projects/{projectKey}/releases/{releaseKey}`,
`/projects/{projectKey}/releases/{releaseKey}/plans/{planKey}`). A project
with no Releases SHALL show no Release-related navigation entry, so
projects that don't use this capability see no change to their existing
navigation. Exact panel/page layout is intentionally unspecified here and
is established during implementation.

#### Scenario: A project with no Releases shows no Release navigation
- **WHEN** a user opens a project that has never had a Release created
- **THEN** no Release-related navigation entry is shown, and the project's existing navigation is unchanged

#### Scenario: A project with Releases exposes them in navigation
- **WHEN** a user opens a project that has at least one Release
- **THEN** the user can navigate from the project to its Releases, from a Release to its Test Plans, and from a Test Plan to its Runs

#### Scenario: Releases, Test Plans, and Runs are addressed by key
- **WHEN** a user navigates to a specific Release or Test Plan
- **THEN** the URL addresses it by its human-readable key, consistent with how projects, cases, suites, and runs are already addressed
