## MODIFIED Requirements

### Requirement: Fully custom, instance-wide roles built from permission flags

The system SHALL let a Tenant Admin create, rename, and delete roles, each carrying a name, a display-only `rank`, and independently toggleable permission flags: `read`, `caseCreate`, `caseEdit`, `caseDelete`, `sectionCreate`, `sectionEdit`, `sectionDelete`, `suiteCreate`, `suiteEditMembership`, `runCreate`, `runRecordResult`, `manageProject`, `runDelete`, `projectDelete`. `rank` is a display/sort-order integer only — no authorization decision compares ranks; a role either grants a flag or it doesn't. A fresh instance SHALL be seeded with three editable default roles — Tester (`read`, `runCreate`, `runRecordResult`), Contributor (Tester's flags plus `caseCreate`, `caseEdit`, `sectionCreate`, `sectionEdit`, `suiteCreate`, `suiteEditMembership`), Project Admin (Contributor's flags plus `caseDelete`, `sectionDelete`, `manageProject`, `runDelete`, `projectDelete`) — reproducing a conventional three-tier default without hardcoding it. A Tenant Admin MAY freely edit, rename, or delete any role, including the three defaults.

#### Scenario: Create a role
- **WHEN** a Tenant Admin creates a role with a name and a set of permission flags
- **THEN** the role exists and can be assigned to a user or team on a project

#### Scenario: Edit a role's permission flags
- **WHEN** a Tenant Admin toggles a permission flag on an existing role
- **THEN** every user or team currently assigned that role has the updated flag reflected immediately, with no re-authentication required

#### Scenario: Delete a role
- **WHEN** a Tenant Admin deletes a role
- **THEN** every project membership and team role assignment referencing it is removed, and any user whose access depended solely on that role loses it

#### Scenario: Non-Tenant-Admin cannot manage roles
- **WHEN** a non-Tenant-Admin user attempts to create, edit, or delete a role
- **THEN** the request is rejected with `403`

#### Scenario: Reset restores only the three named default roles, in place
- **WHEN** a Tenant Admin resets roles to defaults, and a role named "Contributor" currently exists with edited flags
- **THEN** the "Contributor" role's flags and rank are overwritten back to its factory values with the same `id` (existing assignments referencing it stay valid), and every other role in the instance is left untouched
