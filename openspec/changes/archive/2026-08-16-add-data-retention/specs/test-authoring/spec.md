## MODIFIED Requirements

### Requirement: Project management
The system SHALL let a Tenant Admin create projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text), settable at creation or updated later. There is no owner concept — access to a project is determined entirely by project membership (see `project-membership`), assigned by a Tenant Admin after creation. Every project SHALL be assigned an immutable, unique `key` at creation (see `resource-keys`), used to address it in the API and UI. Every project SHALL carry an `isSample` flag, `false` unless the project is the automatically-created Sample Project (see `sample-data`). Any user with `read` permission on a project SHALL be able to list and read it; a Tenant Admin SHALL be able to list and read every project regardless of membership. Renaming, updating the description, archiving, and unarchiving a project SHALL require `manageProject` permission (or Tenant Admin). Archiving and unarchiving are both reversible, low-stakes actions — neither removes any data; only permanent deletion (see below) does.

#### Scenario: Unarchiving a project restores it to active
- **WHEN** a user with `manageProject` permission unarchives a previously-archived project
- **THEN** the project's archived flag clears and it behaves exactly as any other active project again

## ADDED Requirements

### Requirement: Deleting an archived project
The system SHALL let a user with the `projectDelete` permission on a project permanently delete it, but only once the project is already archived. Because a project's data volume is unbounded, deletion SHALL execute asynchronously: the project is queued for deletion and hidden from all project listings immediately, and a background process then permanently removes every section, case (and all of its versions), suite, run, run item, and result scoped to that project, and every membership row (direct or team-based) assigning a role on it. This is separate from, and strictly more destructive than, archiving: archiving hides a project and is reversible; deletion is permanent and is not.

#### Scenario: Delete an archived project
- **WHEN** a user with `projectDelete` deletes a project that is already archived
- **THEN** the project is immediately hidden from all project listings, and everything scoped to it (sections, cases, case versions, suites, runs, run items, results, membership rows) is permanently removed by a background process without requiring further action

#### Scenario: Cannot delete an active project
- **WHEN** a user attempts to delete a project that is not archived
- **THEN** the request is rejected with a validation error, and the project is untouched — a project must be archived first

#### Scenario: Insufficient permission
- **WHEN** a user without `projectDelete` on the project attempts to delete it, even if archived
- **THEN** the request is rejected and the project is not deleted

#### Scenario: Deletion resumes after a server restart
- **WHEN** a project is queued for deletion and the server restarts before the background process finishes removing everything scoped to it
- **THEN** deletion resumes automatically on the next startup without requiring the admin to retry, and eventually completes

### Requirement: Automatic project archiving
The system SHALL let a Tenant Admin configure a single, instance-wide inactivity threshold, in days. A non-archived project whose activity — the newest of its own creation time, its most recently created run, its most recently created case version, and its most recently created suite — is older than the threshold SHALL be automatically archived by a background process the same way a manual archive would be. A threshold of `0` SHALL mean the policy is off — no project is ever auto-archived. A Tenant Admin MAY exempt an individual project from this policy; only a Tenant Admin, never a Project Admin or any custom role, SHALL be able to set or clear a project's exemption. Automatic archiving is never destructive — an auto-archived project can be unarchived at any time, exactly as if it had been archived manually.

#### Scenario: Threshold off by default
- **WHEN** an instance has never had `autoArchiveInactiveDays` configured
- **THEN** it defaults to `0` and no project is ever automatically archived

#### Scenario: An inactive project is auto-archived
- **WHEN** a Tenant Admin sets `autoArchiveInactiveDays` to a positive number and a non-archived, non-exempt project's activity is older than that many days
- **THEN** the background worker archives the project the same way a manual archive does

#### Scenario: Recent activity keeps a project from being auto-archived
- **WHEN** a project was created long ago but has a run, case version, or suite created more recently than the configured threshold
- **THEN** the project is left untouched by the automatic sweep, regardless of the project's own age

#### Scenario: An exempted project is never auto-archived
- **WHEN** a Tenant Admin has exempted a project from automatic archiving
- **THEN** the background worker never archives that project, no matter how inactive it is, until the exemption is cleared

#### Scenario: Only a Tenant Admin can set or clear the exemption
- **WHEN** a user without Tenant Admin standing — including a Project Admin with `manageProject` on the project — attempts to set or clear a project's auto-archive exemption
- **THEN** the request is rejected and the project's exemption is unchanged

#### Scenario: Only a Tenant Admin can change the instance-wide threshold
- **WHEN** a user without Tenant Admin standing attempts to change `autoArchiveInactiveDays`
- **THEN** the request is rejected and the threshold is unchanged

#### Scenario: Automatic archiving is audited as a system actor
- **WHEN** the background worker archives a project automatically
- **THEN** an audit log entry is recorded with actor kind `system`, distinct from a human-triggered archive

#### Scenario: Auto-archiving is fully reversible
- **WHEN** a project is automatically archived by the policy
- **THEN** a user with `manageProject` on it can unarchive it at any time, exactly as they could a manually-archived project
