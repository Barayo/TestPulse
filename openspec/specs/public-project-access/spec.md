# public-project-access

## Purpose

Letting an anonymous visitor browse a project a Project Admin has made
publicly accessible — reading the identical pages an authenticated member
sees, with every write control absent — and discover which projects are
public at all, without already possessing a direct link
(`enable-public-project-access`, `unify-authenticated-and-public-views`).

## Requirements

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

### Requirement: Anonymous visitors see the same pages as authenticated members, read-only

For every project-content page (project dashboard, Library, a case, the
suites list, a suite, the runs list, a run, a run item), the system SHALL
render the identical page and layout for an anonymous visitor viewing a
publicly accessible project as it renders for an authenticated member
with read access to that project, sourced from the existing unauthenticated
read API. Every control that creates, edits, deletes, or records a result
SHALL be absent for the anonymous visitor, using the same permission-based
hiding mechanism already used to hide those controls from an authenticated
member who lacks the matching permission — not a separate, page-specific
implementation.

#### Scenario: Anonymous visitor sees the same project dashboard a member sees

- **WHEN** an anonymous visitor opens a publicly accessible project's
  dashboard
- **THEN** they see the same summary strip, Library/Suites/Runs panels,
  and per-item classification detail an authenticated member with read
  access sees for that project

#### Scenario: Write controls are absent for an anonymous visitor

- **WHEN** an anonymous visitor views any page of a publicly accessible
  project
- **THEN** no control that would create, edit, delete, close/reopen a run,
  or record a result is rendered anywhere on the page

#### Scenario: A private or nonexistent project shows the same not-found handling regardless of cause

- **WHEN** an anonymous visitor opens the URL for a project that doesn't
  exist, or exists but isn't publicly accessible (either because its own
  setting is off or the instance-wide switch is off)
- **THEN** they see the same "not found" state in every case, with no way
  to distinguish which cause applies, alongside an option to log in

#### Scenario: An old direct public-project link still works

- **WHEN** a visitor opens a previously shared `/public/{projectKey}` link
- **THEN** they are taken to the project's unified page at
  `/projects/{projectKey}`, rendered anonymously if they have no session

#### Scenario: An old discovery-index link still works

- **WHEN** a visitor opens a previously shared `/public` link
- **THEN** they are taken to `/`, rendered anonymously if they have no
  session

### Requirement: Project list resolves to zero, one, or many public projects for anonymous visitors

Visiting the project list while anonymous SHALL behave differently
depending on how many projects are publicly accessible: exactly one SHALL
redirect directly to that project's page without ever showing a list;
zero or more than one SHALL show the list (an empty state, or every
public project, respectively) — mirroring the behavior an authenticated
non-admin user with access to exactly one project already gets.

#### Scenario: Exactly one public project redirects directly

- **WHEN** an anonymous visitor opens the project list and exactly one
  project is publicly accessible
- **THEN** they are taken directly to that project's page, without the
  list ever being shown

#### Scenario: Multiple public projects show a list

- **WHEN** an anonymous visitor opens the project list and more than one
  project is publicly accessible
- **THEN** they see every publicly accessible project listed

#### Scenario: No public projects shows an empty state

- **WHEN** an anonymous visitor opens the project list and no project is
  publicly accessible
- **THEN** they see a message indicating none are available, not an error
