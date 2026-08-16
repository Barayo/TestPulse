## ADDED Requirements

### Requirement: Run and project deletion permissions
The system SHALL define two additional project-scoped permission flags beyond `add-project-rbac`'s original ten: `runDelete` (permanently delete a run) and `projectDelete` (permanently delete an already-archived project). Both follow the same fully-custom, instance-wide role model as every other permission flag — a Tenant Admin toggles them per role, and a user's effective grant is the union of every role they hold on the project, direct or via team.

#### Scenario: `projectDelete` is independent of `manageProject`
- **WHEN** a role grants `manageProject` (rename/describe/archive) but not `projectDelete`
- **THEN** a user holding only that role can archive the project but cannot permanently delete it

#### Scenario: Seeded Project Admin role has both new flags
- **WHEN** a fresh instance is seeded with the default Tester/Contributor/Project Admin roles
- **THEN** Project Admin has both `runDelete` and `projectDelete`, and Tester and Contributor have neither
