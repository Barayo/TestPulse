## ADDED Requirements

### Requirement: Role deletion-preview counts are Tenant-Admin-gated
The system SHALL let a Tenant Admin retrieve real reference counts for a role before
deleting it — how many users hold it directly, how many teams hold it, and how many
distinct projects either touches — gated by Tenant Admin status alone, the same
instance-wide gate as the rest of role management. This is a read-only preview; it
does not itself change anything.

#### Scenario: Tenant Admin views a role's deletion preview
- **WHEN** a Tenant Admin requests the deletion preview for an existing role
- **THEN** the response includes the count of users directly assigned the role, the
  count of teams assigned the role, and the count of distinct projects either touches

#### Scenario: Non-Tenant-Admin cannot view a role's deletion preview
- **WHEN** a user without Tenant Admin status requests a role's deletion preview
- **THEN** the request is rejected
