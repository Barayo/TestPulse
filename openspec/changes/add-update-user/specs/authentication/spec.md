## MODIFIED Requirements

### Requirement: Local user accounts
The system SHALL support local user accounts identified by email, with a
bcrypt-hashed password. There is no public self-registration — only a
Tenant Admin (see `authorization`) can create a new account. A newly
created account's `displayName` SHALL default to a name derived from
the email's local-part (separators `.`/`_`/`-`/`+` become spaces, each
resulting word title-cased) rather than staying unset. A Tenant Admin
MAY also change an existing account's email and/or set a new password
directly; changing a password SHALL revoke every existing session for
that account.

#### Scenario: Create a user
- **WHEN** a Tenant Admin submits a new account with an email and password
- **THEN** the account is created with the password stored as a bcrypt hash,
  never in plain text

#### Scenario: Duplicate email is rejected
- **WHEN** a new account is submitted with an email already in use
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Weak password is rejected
- **WHEN** a new account, password change, or password update submits a
  password under 12 characters
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Non-Tenant-Admin cannot create a user
- **WHEN** a non-Tenant-Admin authenticated user submits a new account
- **THEN** the request is rejected with `403`

#### Scenario: New account gets a default display name from its email
- **WHEN** a Tenant Admin creates an account for `jane.doe@example.com`
- **THEN** the account's `displayName` is "Jane Doe" rather than unset

#### Scenario: Tenant Admin changes a user's email
- **WHEN** a Tenant Admin updates an existing account's email to one not
  already in use
- **THEN** the account's email is updated and reflected on subsequent reads

#### Scenario: Tenant Admin changing a user's email to one already in use is rejected
- **WHEN** a Tenant Admin updates an account's email to one already used by
  a different account
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Tenant Admin sets a new password for a user
- **WHEN** a Tenant Admin sets a new password for an existing account
- **THEN** the account's password hash is updated and every existing
  session for that account is revoked, requiring a fresh login

#### Scenario: Non-Tenant-Admin cannot update another user's email or password
- **WHEN** a non-Tenant-Admin authenticated user attempts to change another
  account's email or password
- **THEN** the request is rejected with `403`
