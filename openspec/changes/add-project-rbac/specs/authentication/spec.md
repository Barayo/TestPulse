## MODIFIED Requirements

### Requirement: Local user accounts
The system SHALL support local user accounts identified by email, with a bcrypt-hashed password. There is no public self-registration in v0.1 — only a Tenant Admin can create a new account.

#### Scenario: Create a user
- **WHEN** a Tenant Admin submits a new account with an email and password
- **THEN** the account is created with the password stored as a bcrypt hash, never in plain text

#### Scenario: Duplicate email is rejected
- **WHEN** a new account is submitted with an email already in use
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Weak password is rejected
- **WHEN** a new account or password change submits a password under 8 characters
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Non-Tenant-Admin cannot create a user
- **WHEN** a non-Tenant-Admin authenticated user submits a new account
- **THEN** the request is rejected with `403`
