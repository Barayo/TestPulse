## ADDED Requirements

### Requirement: A user with manageProject permission can create an import job for a project
The system SHALL let a user with `manageProject` permission on a project create an import job (`POST /projects/{projectKey}/import-jobs`) naming a `source` (e.g. `testrail`), a `mode` (`dry_run` or `real`), and source-specific credentials. The job is created with status `pending`. A user without `manageProject` on the target project SHALL be rejected with `403`.

#### Scenario: A project admin creates a dry-run import job
- **WHEN** a user with `manageProject` permission on a project submits TestRail credentials with mode `dry_run`
- **THEN** an import job is created with status `pending` and the source-specific credentials stored encrypted

#### Scenario: A user without manageProject cannot create an import job
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to create an import job
- **THEN** the request is rejected with `403`

### Requirement: An import job's status and progress are pollable
The system SHALL let a user with `manageProject` permission on the job's project poll an import job's status (`GET /projects/{projectKey}/import-jobs/{jobId}`), including `status` (`pending`/`running`/`succeeded`/`failed`), `progress` (current/total counts), and, once available, a `report` (counts per entity type and a named list of anything that did not survive the mapping).

#### Scenario: Polling a running job reflects live progress
- **WHEN** an import job is `running` and has processed 187 of 340 cases
- **THEN** polling the job returns `status: running` and progress reflecting 187 of 340

#### Scenario: Polling a completed job returns its report
- **WHEN** an import job has finished successfully
- **THEN** polling the job returns `status: succeeded` and a report naming counts per entity type created

### Requirement: A dry-run import job writes nothing
The system SHALL guarantee that an import job with `mode: dry_run` never creates, modifies, or deletes any project content — folders, cases, custom fields, or otherwise — regardless of what its report indicates would happen in a real run.

#### Scenario: A dry-run job produces a report with no side effects
- **WHEN** a dry-run import job completes
- **THEN** its report names the entities that would be created, and the target project's actual folder/case counts are unchanged

### Requirement: Import job credentials are encrypted at rest and scrubbed after completion
The system SHALL store an import job's source credentials encrypted at rest, and SHALL clear them (set to null) once the job reaches a terminal status (`succeeded` or `failed`). Credentials SHALL never appear in a job's report.

#### Scenario: Credentials are cleared after a job completes
- **WHEN** an import job transitions to `succeeded` or `failed`
- **THEN** its stored credentials are cleared and are not retrievable via the job's status endpoint

### Requirement: An import worker claims and reports on jobs via scoped agent authentication
The system SHALL let an agent actor with a valid API token list pending import jobs scoped to its token's project (`GET /import-jobs?status=pending`) and report progress/completion on a claimed job (`PATCH /import-jobs/{jobId}`). A token scoped to one project SHALL only see and update jobs for that project.

#### Scenario: A scoped agent token only sees its own project's pending jobs
- **WHEN** an agent authenticates with a token scoped to project A and lists pending import jobs
- **THEN** only project A's pending jobs are returned, never another project's

#### Scenario: An agent reports progress on a claimed job
- **WHEN** an agent claims a pending job and reports progress via `PATCH /imports/{jobId}`
- **THEN** subsequent status polls for that job reflect the reported progress

### Requirement: A TestRail import maps suites and sections to a folder hierarchy, not to TestPulse Suites
The system SHALL map each TestRail suite to a distinct top-level folder in the target TestPulse project, and each section within that suite to a nested folder beneath its suite's folder, preserving TestRail's section hierarchy. TestRail cases SHALL be created as TestPulse cases within the appropriate nested folder. TestPulse's own Suite construct (a named selection of cases for scoping a run) SHALL NOT be created, modified, or otherwise touched by a TestRail import.

#### Scenario: Two TestRail suites with identically-named sections do not collide
- **WHEN** a TestRail project has two suites that each contain a section named "Login"
- **THEN** the import creates two distinct "Login" folders, one nested under each suite's own top-level folder, with no case interleaving between them

#### Scenario: A TestRail case is created in its suite/section's folder
- **WHEN** a TestRail case belongs to a section within a suite
- **THEN** the imported TestPulse case is created in the nested folder corresponding to that suite and section

### Requirement: Unmappable custom fields are dropped and individually named in the report, never silently
A TestRail case's custom fields whose type maps to TestPulse's `text` or `select` custom field types SHALL be created (or reused, if already created by an earlier case in the same import) as project custom fields and populated on the imported case. A TestRail custom field whose type has no TestPulse equivalent SHALL be dropped from the imported case, and SHALL be named individually in the job's report — never omitted, never collapsed into a summary count.

#### Scenario: A mappable custom field is created and populated
- **WHEN** a TestRail case has a single-select custom field with a value
- **THEN** the imported TestPulse case has a corresponding `select` custom field populated with that value

#### Scenario: An unmappable custom field is named in the report, not silently dropped
- **WHEN** a TestRail project uses a custom field type with no TestPulse equivalent
- **THEN** the import's report names that field explicitly as dropped, and no imported case silently loses data without it appearing in the report

### Requirement: The web app offers importing a TestRail project as a project-creation entry point
The project creation entry point SHALL offer "Import from TestRail" alongside "Start from scratch" as a distinct path, leading to a dedicated screen for connecting to a TestRail instance, previewing an import via a dry run, and confirming a real import.

#### Scenario: A user can reach the TestRail import flow from project creation
- **WHEN** a user with permission to create projects opens the "+ New project" entry point
- **THEN** they are offered a choice between starting from scratch and importing from TestRail, and choosing the latter navigates to the TestRail import flow
