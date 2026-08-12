## ADDED Requirements

### Requirement: Team deletion-preview counts are Tenant-Admin-gated
The system SHALL let a Tenant Admin retrieve real reference counts for a team before
deleting it — how many members it has and how many distinct projects it holds a role
on — gated by Tenant Admin status alone, the same instance-wide gate as the rest of
team management. This is a read-only preview; it does not itself change anything.

#### Scenario: Tenant Admin views a team's deletion preview
- **WHEN** a Tenant Admin requests the deletion preview for an existing team
- **THEN** the response includes the count of current members and the count of
  distinct projects the team holds a role on

#### Scenario: Non-Tenant-Admin cannot view a team's deletion preview
- **WHEN** a user without Tenant Admin status requests a team's deletion preview
- **THEN** the request is rejected
