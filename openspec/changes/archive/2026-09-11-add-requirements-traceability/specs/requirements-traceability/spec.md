## ADDED Requirements

### Requirement: Requirement entity, flat and project-scoped
The system SHALL let a user with `manageProject` permission on a project create a Requirement with a `name`, an optional `description`, and an optional free-text `externalRef`. Every Requirement SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), formed as `{projectKey}-REQ{n}`, sequential per project. Requirements SHALL NOT support parent/child nesting — each is a standalone record. A user with `manageProject` permission SHALL be able to update a Requirement's `name`, `description`, and `externalRef`.

#### Scenario: A newly created Requirement has a key
- **WHEN** a user with `manageProject` permission creates a Requirement in a project whose key is "LOGIN"
- **THEN** the Requirement is created with key "LOGIN-REQ1"

#### Scenario: Sequential numbering within a project
- **WHEN** a second Requirement is created in the same project
- **THEN** its key is "LOGIN-REQ2"

#### Scenario: A permission that doesn't include manageProject cannot create or edit a Requirement
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to create, edit, or delete a Requirement
- **THEN** the request is rejected with `403`

### Requirement: Deleting a Requirement with linked cases is rejected
The system SHALL reject deletion of a Requirement that still has one or more linked Cases, requiring the caller to unlink them first — the same "reject orphaning" pattern used for deleting a Test Plan with Runs still scoped to it.

#### Scenario: Deleting a Requirement with linked cases is rejected
- **WHEN** a user attempts to delete a Requirement that still has one or more Cases linked to it
- **THEN** the request is rejected, and the Requirement and its links are unaffected

#### Scenario: Deleting a Requirement with no linked cases succeeds
- **WHEN** a user with `manageProject` permission deletes a Requirement that has no Cases linked to it
- **THEN** the Requirement is removed and no longer appears in the project's Requirement list

### Requirement: Case-requirement linking, editable from either side
The system SHALL let a user with `manageProject` permission link or unlink a Case and a Requirement (many-to-many), addressable from either the Requirement's detail view or the Case's detail view. Linking an already-linked pair SHALL be idempotent (no error). Unlinking SHALL NOT delete the Case or the Requirement — only the link between them.

#### Scenario: Linking a case to a requirement
- **WHEN** a user with `manageProject` permission links a Case to a Requirement
- **THEN** the Case appears in the Requirement's linked cases, and the Requirement appears in the Case's linked requirements

#### Scenario: Linking an already-linked case is a no-op
- **WHEN** a user links a Case to a Requirement it is already linked to
- **THEN** the request succeeds without creating a duplicate link

#### Scenario: Unlinking removes only the link
- **WHEN** a user with `manageProject` permission unlinks a Case from a Requirement
- **THEN** the Case no longer appears in the Requirement's linked cases, and both the Case and the Requirement continue to exist

#### Scenario: A permission that doesn't include manageProject cannot link or unlink
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to link or unlink a Case and a Requirement
- **THEN** the request is rejected with `403`

### Requirement: Release-scoped requirement coverage matrix
The system SHALL provide, for a given Release, a coverage status per Requirement in that Release's project, computed via a single server-side aggregate query — never a client-side per-case fetch loop. A Requirement's status SHALL be computed by a worst-case rollup across its linked Cases' latest Results among Runs scoped to that Release's Test Plans specifically (not any Result outside those Test Plans):
- `notRun`: the Requirement has no linked Cases, or at least one linked Case has no Result under this Release's Test Plans.
- `failing`: every linked Case has a Result under this Release's Test Plans, and at least one of those latest Results is `failed` or `blocked`.
- `covered`: every linked Case has a Result under this Release's Test Plans, and all of those latest Results are `pass`.

A linked Case whose latest Result under this Release's Test Plans is `skipped` SHALL be treated as having no informative result for this computation (folded into the `notRun` condition), not as a distinct coverage status.

#### Scenario: A requirement with no linked cases is not run
- **WHEN** a Requirement has no Cases linked to it
- **THEN** its coverage status for any Release is `notRun`

#### Scenario: An unrun linked case makes the requirement not run
- **WHEN** a Requirement has two linked Cases, one with a `pass` Result under the Release's Test Plans and one with no Result under those Test Plans
- **THEN** the Requirement's coverage status for that Release is `notRun`

#### Scenario: A failing linked case makes the requirement failing
- **WHEN** a Requirement has two linked Cases, both with Results under the Release's Test Plans, one `pass` and one `failed`
- **THEN** the Requirement's coverage status for that Release is `failing`

#### Scenario: All linked cases passing makes the requirement covered
- **WHEN** a Requirement has two linked Cases, both with `pass` Results under the Release's Test Plans
- **THEN** the Requirement's coverage status for that Release is `covered`

#### Scenario: A result from a different release does not count
- **WHEN** a Requirement's linked Case has a `pass` Result under a Run scoped to a different Release's Test Plan, and no Result under the Release being viewed
- **THEN** the Requirement's coverage status for the Release being viewed is `notRun`
