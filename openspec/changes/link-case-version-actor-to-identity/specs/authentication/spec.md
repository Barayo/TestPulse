## MODIFIED Requirements

### Requirement: Local user accounts
The system SHALL support local user accounts identified by email, with a
bcrypt-hashed password. There is no public self-registration — only a
Tenant Admin (see `authorization`) can create a new account. A newly
created account's `displayName` SHALL default to a name derived from
the email's local-part (separators `.`/`_`/`-`/`+` become spaces, each
resulting word title-cased) rather than staying unset.

#### Scenario: Create a user
- **WHEN** a Tenant Admin submits a new account with an email and password
- **THEN** the account is created with the password stored as a bcrypt hash,
  never in plain text

#### Scenario: Duplicate email is rejected
- **WHEN** a new account is submitted with an email already in use
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Weak password is rejected
- **WHEN** a new account or password change submits a password under 8
  characters
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Non-Tenant-Admin cannot create a user
- **WHEN** a non-Tenant-Admin authenticated user submits a new account
- **THEN** the request is rejected with `403`

#### Scenario: New account gets a default display name from its email
- **WHEN** a Tenant Admin creates an account for `jane.doe@example.com`
- **THEN** the account's `displayName` is "Jane Doe" rather than unset
