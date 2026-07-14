# authorization

## Purpose

Deciding which authenticated actor may perform which action: the two
instance-wide role model (admin/member) and the ownership rules for API
token management.

## Requirements

### Requirement: Two instance-wide roles
The system SHALL assign every user exactly one role, `admin` or `member`,
instance-wide (not scoped per project — per-project roles are a later
capability). Both roles can fully read and write domain data (projects,
cases, suites, runs, folders); only `admin` can manage user accounts.

#### Scenario: Member has full domain access
- **WHEN** a user with role `member` creates, edits, or deletes a project,
  case, suite, or run
- **THEN** the request succeeds exactly as it would for an `admin`

#### Scenario: Member cannot manage users
- **WHEN** a user with role `member` attempts to create, deactivate, or
  change the role of another user account
- **THEN** the request is rejected with `403`

#### Scenario: Admin can manage users
- **WHEN** a user with role `admin` creates, deactivates, or changes the
  role of another user account
- **THEN** the request succeeds

### Requirement: Token management scoped to creator, with admin override
The system SHALL let a user list and revoke only the API tokens they
created; an `admin` SHALL additionally be able to list and revoke any
user's tokens, for offboarding.

#### Scenario: User lists their own tokens
- **WHEN** an authenticated user lists API tokens
- **THEN** only tokens they created are returned

#### Scenario: Admin lists another user's tokens
- **WHEN** an admin requests the token list for a specific user
- **THEN** that user's tokens are returned regardless of who is asking

#### Scenario: Non-admin cannot list another user's tokens
- **WHEN** a non-admin user requests the token list for a different user
- **THEN** the request is rejected with `403`
