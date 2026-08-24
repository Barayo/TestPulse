## MODIFIED Requirements

### Requirement: Local user accounts
The system SHALL support local user accounts identified by email, with a
bcrypt-hashed password. There is no public self-registration — only a
Tenant Admin (see `authorization`) can create a new account, with the sole
exception of just-in-time provisioning on first OIDC login (see
`sso-oidc`), which requires no password. A newly created account's
`displayName` SHALL default to a name derived from the email's local-part
(separators `.`/`_`/`-`/`+` become spaces, each resulting word title-cased)
rather than staying unset. A Tenant Admin MAY change an existing account's
email directly. A Tenant Admin SHALL NOT set an arbitrary password value
for another account directly — password changes for another account happen
only via an admin-triggered reset email, a required-change-at-next-login
flag, or (only when the instance has no SMTP configured) a server-generated
temporary password that forces the required-change flag in the same action.

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

#### Scenario: JIT-provisioned account needs no password
- **WHEN** a new account is created via first OIDC login rather than by a
  Tenant Admin
- **THEN** the account is created with no password hash, and this is not
  treated as an error or an incomplete account

### Requirement: Session-based login
The system SHALL authenticate a user's email and password against the
stored bcrypt hash and, on success, create a server-side session and set an
`HttpOnly`, `Secure`, `SameSite=Lax` cookie referencing it by opaque ID. The
session expiry SHALL be 30 days from creation, extended (sliding) on each
authenticated request that uses it. When SSO-only mode is enabled (see
`sso-oidc`), password-based login SHALL be rejected regardless of
credentials; a session created via OIDC login uses this same mechanism and
expiry.

#### Scenario: Successful login
- **WHEN** a user submits their correct email and password to
  `POST /api/v1/auth/login`
- **THEN** a session is created and the response sets a session cookie

#### Scenario: Wrong password is rejected
- **WHEN** a user submits an email with an incorrect password
- **THEN** the request is rejected with `401` and no session is created

#### Scenario: Logout invalidates the session
- **WHEN** an authenticated user calls `POST /api/v1/auth/logout`
- **THEN** the session is deleted and its cookie no longer authenticates
  subsequent requests

#### Scenario: Active use extends the session
- **WHEN** a request authenticates successfully using a session with less
  than 30 days remaining before expiry
- **THEN** the session's expiry is pushed forward to 30 days from that
  request

#### Scenario: Expired session is rejected
- **WHEN** a request presents a session cookie whose session has expired
- **THEN** the request is rejected with `401` as if unauthenticated

#### Scenario: SSO-only mode rejects password login even with correct credentials
- **WHEN** SSO-only mode is enabled and a user submits their correct email
  and password to `POST /api/v1/auth/login`
- **THEN** the request is rejected with `401` and no session is created
