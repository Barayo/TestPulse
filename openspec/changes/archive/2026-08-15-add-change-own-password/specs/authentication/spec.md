## MODIFIED Requirements

### Requirement: Local user accounts
The system SHALL support local user accounts identified by email, with a
bcrypt-hashed password. There is no public self-registration — only a
Tenant Admin (see `authorization`) can create a new account. A newly
created account's `displayName` SHALL default to a name derived from
the email's local-part (separators `.`/`_`/`-`/`+` become spaces, each
resulting word title-cased) rather than staying unset. A Tenant Admin MAY
change an existing account's email directly. A Tenant Admin SHALL NOT set
an arbitrary password value for another account directly — password
changes for another account happen only via an admin-triggered reset
email, a required-change-at-next-login flag, or (only when the instance
has no SMTP configured) a server-generated temporary password that
forces the required-change flag in the same action.

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

#### Scenario: Non-Tenant-Admin cannot update another user's email
- **WHEN** a non-Tenant-Admin authenticated user attempts to change another
  account's email
- **THEN** the request is rejected with `403`

## ADDED Requirements

### Requirement: Self-service password change
An authenticated user SHALL be able to change their own password by
supplying their current password (verified server-side) and a new one
meeting the minimum strength requirement. Success revokes every existing
session for the account, including the one making the request, and clears
that account's required-password-change flag if it was set.

#### Scenario: Changing the password with the correct current password
- **WHEN** a user submits their correct current password and a new
  password meeting the minimum strength requirement
- **THEN** the account's password is updated and every existing session
  for that account is revoked

#### Scenario: An incorrect current password is rejected
- **WHEN** a user submits an incorrect current password
- **THEN** the request is rejected and the password is unchanged

#### Scenario: A weak new password is rejected
- **WHEN** a user submits their correct current password with a new
  password under 12 characters
- **THEN** the request is rejected with a validation error and the
  password is unchanged

#### Scenario: The requester's own session ends on success
- **WHEN** a user successfully changes their own password
- **THEN** their current session is revoked along with every other, and
  they must log in again with the new password to continue

### Requirement: Admin-triggered password reset email
A Tenant Admin SHALL be able to trigger a password-reset email for a
specific account, when the instance has SMTP configured — the same
mechanism `password-recovery`'s self-service flow uses, addressed at a
known account rather than an email the caller supplied.

#### Scenario: Admin triggers a reset email
- **WHEN** a Tenant Admin requests a password-reset email for an existing
  account, and the instance has SMTP configured
- **THEN** a single-use reset token is created and an email containing a
  reset link is sent to that account's address

#### Scenario: Unavailable without SMTP configured
- **WHEN** a Tenant Admin requests a password-reset email while the
  instance has no SMTP configured
- **THEN** the request is rejected

#### Scenario: Non-Tenant-Admin cannot trigger a reset email for another account
- **WHEN** a non-Tenant-Admin authenticated user attempts to trigger a
  password-reset email for another account
- **THEN** the request is rejected with `403`

### Requirement: Required password change at next login
A Tenant Admin SHALL be able to flag an account as requiring a password
change. The flag is enforced starting at that account's next successful
login, not retroactively against any session already in progress: the
login response signals it, and until the account's owner changes their
own password, every request other than logging out, reading their own
profile, and changing their own password is rejected.

#### Scenario: Admin flags an account
- **WHEN** a Tenant Admin sets the required-password-change flag on an
  account
- **THEN** the flag is recorded, with no effect on that account's
  currently active sessions

#### Scenario: Flagged account logs in
- **WHEN** an account with the flag set logs in successfully
- **THEN** the login response indicates a password change is required

#### Scenario: Flagged account is blocked from other actions until it changes its password
- **WHEN** an authenticated request other than logout, reading own
  profile, or changing own password arrives from an account with the
  flag set
- **THEN** the request is rejected

#### Scenario: Changing the password clears the flag
- **WHEN** an account with the flag set successfully changes its own
  password
- **THEN** the flag is cleared and the account's requests are no longer
  restricted

### Requirement: Temporary password generation without SMTP configured
When the instance has no SMTP configured, a Tenant Admin SHALL be able to
generate a random temporary password for an account as a fallback —
never a value the admin chooses. Generating one forces the
required-password-change flag in the same action and revokes every
existing session for that account. The value is returned once and never
retrievable again.

#### Scenario: Admin generates a temporary password
- **WHEN** a Tenant Admin generates a temporary password for an account,
  and the instance has no SMTP configured
- **THEN** the account's password is set to a random generated value,
  the required-password-change flag is set, every existing session for
  the account is revoked, and the raw value is returned once

#### Scenario: Unavailable when SMTP is configured
- **WHEN** a Tenant Admin attempts to generate a temporary password while
  the instance has SMTP configured
- **THEN** the request is rejected — the reset-email path is required
  instead

#### Scenario: Non-Tenant-Admin cannot generate a temporary password for another account
- **WHEN** a non-Tenant-Admin authenticated user attempts to generate a
  temporary password for another account
- **THEN** the request is rejected with `403`
