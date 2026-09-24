## ADDED Requirements

### Requirement: A project's import jobs are listable
A user with `manageProject` permission on a project (or a Tenant Admin)
SHALL be able to list every import job ever created for that project,
newest first, regardless of status.

#### Scenario: Listing returns all jobs for a project, newest first
- **WHEN** a user with `manageProject` permission requests the import-job
  list for a project that has both a dry-run and a real import job
- **THEN** both jobs are returned, ordered with the most recently created
  job first

#### Scenario: A project with no import jobs returns an empty list
- **WHEN** a user requests the import-job list for a project that was
  never targeted by an import wizard run
- **THEN** an empty list is returned, not an error

#### Scenario: A user without manageProject cannot list a project's import jobs
- **WHEN** a user whose effective permissions on a project do not include
  `manageProject` requests that project's import-job list
- **THEN** the request is rejected with `403`

### Requirement: An empty project with import history surfaces it instead of the generic getting-started view
When a project has no folders, suites, or cases, and has at least one
associated import job, the project's Overview page SHALL show that job's
source, status, and timing instead of the generic "Get started" onboarding
block.

#### Scenario: An empty project with a failed import job shows its status
- **WHEN** a project has zero cases and its most recent import job has
  status `failed`
- **THEN** the Overview page shows the source, that it failed, and the
  job's error message, instead of the generic getting-started steps

#### Scenario: An empty project with a still-running import job shows its status
- **WHEN** a project has zero cases and its most recent import job has
  status `pending` or `running`
- **THEN** the Overview page shows that an import from that source is in
  progress, instead of the generic getting-started steps

#### Scenario: An empty project with no import history shows the generic getting-started view
- **WHEN** a project has zero cases and no import job was ever created
  for it
- **THEN** the Overview page shows the generic three-step getting-started
  block, unchanged from today

#### Scenario: A non-empty project never shows import-job status on its Overview page
- **WHEN** a project has at least one case, regardless of its import-job
  history
- **THEN** the Overview page shows its normal content, not import-job
  status

### Requirement: A failed import job's stored error is a sanitized, actionable message
When an import job fails, the error persisted and surfaced to the user
SHALL be a short, vendor-appropriate message describing the general
category of failure (connectivity, authentication, not-found, or
unexpected), and SHALL NOT include the underlying internal error chain,
Go type/function names, or any internal identifier such as a job ID.

#### Scenario: A connectivity failure produces an actionable message
- **WHEN** an import job fails because the configured site URL could not be
  reached
- **THEN** the stored error message says the site could not be reached and
  suggests checking the URL, without any raw network-error text

#### Scenario: An authentication failure produces an actionable message
- **WHEN** an import job fails because the vendor API rejected the
  configured credentials
- **THEN** the stored error message says authentication failed and
  suggests checking the credentials

#### Scenario: An unexpected failure does not leak internal identifiers
- **WHEN** an import job fails for a reason outside the connectivity,
  authentication, or not-found categories
- **THEN** the stored error message is a generic actionable fallback and
  never contains the job's own internal ID or any Go error-wrapping text
