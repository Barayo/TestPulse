## MODIFIED Requirements

### Requirement: Scoped API tokens for agents
The system SHALL let any authenticated user create a named API token acting
as its own actor, distinct from and never impersonating the human who
created it. The full token value is returned only once, at creation; the
system stores only a salted hash and a short prefix for identification. A
user manages tokens they created; token management for other users' tokens
is restricted per the authorization capability.

A token MAY optionally be created scoped to exactly one project and one
role (the same fully-custom, instance-wide roles used for project
membership, per the authorization capability). Scoping is only accepted if
the creating user currently holds `read` on that project and every
permission flag the named role grants; a token can never be scoped to a
role more powerful than its creator's own current access. Omitting scope
creates a token that inherits its creator's full, live permission level,
per the authorization capability's requirement for that behavior —
unchanged from before this capability existed.

#### Scenario: Create a token
- **WHEN** an authenticated user creates a token with a name
- **THEN** the full token value is returned once in the response and never
  retrievable again, and the token appears in the creator's token list
  showing only its name and prefix

#### Scenario: Authenticate with a token
- **WHEN** a request carries `Authorization: Bearer tp_<token>` for a valid,
  non-revoked token
- **THEN** the request is authenticated as that token's own actor (not as
  the user who created it)

#### Scenario: Revoked token is rejected
- **WHEN** a request carries a token that has been revoked
- **THEN** the request is rejected with `401`

#### Scenario: A user can only revoke their own tokens
- **WHEN** a non-Tenant-Admin user attempts to revoke a token created by a
  different user
- **THEN** the request is rejected with `403`

#### Scenario: Create a token scoped to a project and role
- **WHEN** an authenticated user creates a token with a name, a `projectId`,
  and a `roleId` for a role whose every granted permission the creator
  currently holds on that project
- **THEN** the token is created scoped to that project and role, and the
  token list shows its scope (project and role name) alongside its name
  and prefix — never "full access"

#### Scenario: Scoping is rejected if it would exceed the creator's own access
- **WHEN** an authenticated user attempts to create a token scoped to a
  project they cannot read, or to a role that grants a permission flag
  they do not themselves currently hold on that project
- **THEN** the request is rejected with `400`, and no token is created
