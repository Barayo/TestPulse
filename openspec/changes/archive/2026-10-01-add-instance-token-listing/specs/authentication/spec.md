## ADDED Requirements

### Requirement: Instance-wide token listing for Tenant Admins
The system SHALL provide a cursor-paginated, Tenant-Admin-only listing of every API token across every user, including each token's owner, name, prefix, scope (unscoped, or the project key and role name it's scoped to), and creation date — never the token secret itself.

#### Scenario: A Tenant Admin lists every token in the instance
- **WHEN** a Tenant Admin requests the instance-wide token listing
- **THEN** the response includes tokens created by every user, each showing its owner, name, scope, and creation date, paginated via the same cursor/limit convention every other instance-wide listing uses

#### Scenario: A non-Tenant-Admin cannot list instance-wide tokens
- **WHEN** a non-Tenant-Admin authenticated user requests the instance-wide token listing
- **THEN** the request is rejected with `403`

#### Scenario: An unscoped token's scope is shown as full access
- **WHEN** the instance-wide listing includes a token created without a project/role scope
- **THEN** that token's entry has no project key or role name, distinguishing it from a scoped token
