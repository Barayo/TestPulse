## MODIFIED Requirements

### Requirement: Project management
The system SHALL let a Tenant Admin create projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text), settable at creation or updated later. There is no owner concept — access to a project is determined entirely by project membership (see `project-membership`), assigned by a Tenant Admin after creation. Every project SHALL be assigned an immutable, unique `key` at creation (see `resource-keys`), used to address it in the API and UI. Every project SHALL carry an `isSample` flag, `false` unless the project is the automatically-created Sample Project (see `sample-data`). Any user with `read` permission on a project SHALL be able to list and read it; a Tenant Admin SHALL be able to list and read every project regardless of membership. Renaming, updating the description, archiving, and unarchiving a project SHALL require `manageProject` permission (or Tenant Admin). Archiving and unarchiving are both reversible, low-stakes actions — neither removes any data; only permanent deletion (see below) does. While a project is archived, every write to its content — test cases, suites, folders, runs, run items, results, releases, test plans, requirements, comments, attachments, tags, and custom fields — SHALL be rejected with `409 Conflict`, regardless of the actor's permission and regardless of whether the write is attempted via the HTTP API or an MCP tool call. This rejection applies unconditionally, including to a Tenant Admin — there is no bypass. The only permitted write on an archived project is unarchiving it: a request that sets `archived` to `false` and changes nothing else SHALL succeed; a request that bundles any other field change together with unarchiving SHALL be rejected with `409 Conflict` instead of applying either change.

#### Scenario: Unarchiving a project restores it to active
- **WHEN** a user with `manageProject` permission unarchives a previously-archived project
- **THEN** the project's archived flag clears and it behaves exactly as any other active project again

#### Scenario: Create a project
- **WHEN** a Tenant Admin submits a new project with a name
- **THEN** the project is created and appears in the project list

#### Scenario: Non-Tenant-Admin cannot create a project
- **WHEN** a non-Tenant-Admin user submits a new project
- **THEN** the request is rejected with `403`

#### Scenario: Project name is required
- **WHEN** a Tenant Admin submits a project without a name
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Description is optional
- **WHEN** a Tenant Admin creates a project with only a name
- **THEN** the project is created with an empty description

#### Scenario: Description can be set later
- **WHEN** a user with `manageProject` permission updates their project with a description
- **THEN** the project reflects it on subsequent reads

#### Scenario: A newly created project has a key
- **WHEN** a Tenant Admin creates a project
- **THEN** the project is created with a `key` assigned, with no separate step required

#### Scenario: Normally-created projects are never marked sample
- **WHEN** a Tenant Admin creates a project through the normal create action
- **THEN** the project's `isSample` flag is `false`

#### Scenario: Project list is scoped to membership
- **WHEN** a non-Tenant-Admin user with a role on two of five existing projects lists projects
- **THEN** only those two projects are returned

#### Scenario: A permission that doesn't include manageProject cannot update project settings
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to rename, re-describe, or archive that project
- **THEN** the request is rejected with `403`

#### Scenario: Writing content to an archived project is rejected
- **WHEN** a user with `caseCreate` permission on an archived project attempts to create a test case in it (or any equivalent content write — a suite, a run, a comment, a custom field value)
- **THEN** the request is rejected with `409 Conflict`, and nothing is created

#### Scenario: Archived-project rejection applies to MCP tool calls identically
- **WHEN** an agent's scoped API token, with sufficient permission, calls an MCP write tool (e.g. `upsert_test_case`, `create_test_run`) against an archived project
- **THEN** the call is rejected with the same `409 Conflict` a human's equivalent HTTP request would receive

#### Scenario: Tenant Admin has no bypass for writing to an archived project
- **WHEN** a Tenant Admin attempts to write content to an archived project
- **THEN** the request is rejected with `409 Conflict` exactly as it would be for any other user — Tenant Admin standing does not exempt this rule

#### Scenario: Reading an archived project's content is unaffected
- **WHEN** a user with `read` permission on an archived project lists or reads its cases, suites, runs, or other content
- **THEN** the request succeeds exactly as it would on an active project

#### Scenario: Unarchiving alone succeeds while archived
- **WHEN** a user with `manageProject` permission on an archived project submits an update containing only `{"archived": false}`
- **THEN** the project is unarchived and the request succeeds

#### Scenario: Bundling other changes with unarchiving is rejected
- **WHEN** a user submits an update to an archived project that sets `archived` to `false` together with any other field (for example, a new name or description)
- **THEN** the request is rejected with `409 Conflict`, and neither the unarchive nor the other field change is applied
