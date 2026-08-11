## REMOVED Requirements

### Requirement: Discovery index resolves to zero, one, or many projects

**Reason**: This change retires the standalone `/public` discovery page.
The project list at `/` now serves this role for anonymous visitors,
reusing the identical zero/one/many resolution logic — see "Project list
resolves to zero, one, or many public projects for anonymous visitors"
under Added Requirements below. (This requirement was introduced by
`add-public-project-discovery`, not yet archived at the time of this
change; recorded as REMOVED here so reconciliation at archive time is
unambiguous regardless of archive order.)

**Migration**: No user-facing migration — `/public` becomes a redirect to
`/`, which now exhibits the same behavior this requirement described.

## ADDED Requirements

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
