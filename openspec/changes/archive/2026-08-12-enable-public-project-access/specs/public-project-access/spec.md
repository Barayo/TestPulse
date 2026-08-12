## ADDED Requirements

### Requirement: Per-project public read access

A Project Admin (a user whose effective project permissions include
`manageProject`) SHALL be able to toggle a project's `publicAccess` flag.
When `true`, the project's cases, folders, suites, runs, run items,
results, and attachments SHALL be readable, without authentication, at a
stable URL keyed by the project's key. `publicAccess` SHALL default to
`false` for every project, including newly created ones. Toggling it OFF
SHALL immediately make the project unreachable at its public URL.

#### Scenario: Project Admin enables public access

- **WHEN** a Project Admin toggles a project's `publicAccess` to `true`
- **THEN** an unauthenticated request to that project's public read
  endpoints succeeds, and the project's Settings page shows the public URL

#### Scenario: Public project exposes only read-only project content

- **WHEN** an unauthenticated request is made to a public project's read
  endpoints for cases, folders, suites, runs, run items, results, or
  attachments
- **THEN** the request succeeds and returns the same data an authenticated
  member with `read` permission would see

#### Scenario: Public project never exposes membership or permissions

- **WHEN** an unauthenticated request is made to a public project's
  membership list, or to any endpoint that would require resolving an
  actor's own effective permissions
- **THEN** the request is rejected as if the project does not exist (`404`)

#### Scenario: Public access grants no write ability

- **WHEN** an unauthenticated request attempts to create, edit, or delete
  any resource on a public project, or to create or record results for a
  run
- **THEN** the request is rejected as if the project does not exist (`404`)

#### Scenario: A non-public project is unreachable anonymously

- **WHEN** an unauthenticated request is made to a project whose
  `publicAccess` is `false`
- **THEN** the request is rejected as if the project does not exist (`404`)

#### Scenario: Disabling public access immediately revokes anonymous reads

- **WHEN** a Project Admin toggles a previously-public project's
  `publicAccess` to `false`
- **THEN** subsequent unauthenticated requests to that project are
  rejected as if the project does not exist (`404`)

### Requirement: Instance-wide kill switch for public project access

The system SHALL maintain one instance-wide setting,
`publicProjectsEnabled` (boolean, default `true`), mutable only by a
Tenant Admin. A project's public read endpoints SHALL be reachable only
when both `publicProjectsEnabled` is `true` AND that project's own
`publicAccess` is `true`. Disabling `publicProjectsEnabled` SHALL NOT
modify any project's own `publicAccess` value.

#### Scenario: Instance-wide switch overrides a project's own setting

- **WHEN** `publicProjectsEnabled` is `false` and a project's own
  `publicAccess` is `true`
- **THEN** unauthenticated requests to that project's public read
  endpoints are rejected as if the project does not exist (`404`)

#### Scenario: Re-enabling the instance-wide switch restores prior state

- **WHEN** a Tenant Admin toggles `publicProjectsEnabled` from `false`
  back to `true`, and a project's own `publicAccess` was left `true`
  throughout
- **THEN** unauthenticated requests to that project's public read
  endpoints succeed again, with no action needed on the project's own
  setting

#### Scenario: Only a Tenant Admin can change the instance-wide switch

- **WHEN** a non-Tenant-Admin user attempts to change
  `publicProjectsEnabled`
- **THEN** the request is rejected with `403`

#### Scenario: The instance-wide switch state is visible to any caller

- **WHEN** any caller, authenticated or not, requests instance metadata
- **THEN** the response includes the current `publicProjectsEnabled` value
