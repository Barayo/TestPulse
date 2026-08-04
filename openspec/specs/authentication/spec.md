# authentication

## Purpose

Establishing *who* is making a request: local user accounts (bcrypt),
session-based login for the web UI, and scoped API tokens for agents — so
every request resolves to exactly one authenticated actor (human or agent)
before any domain route runs.
## Requirements
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

### Requirement: Session-based login
The system SHALL authenticate a user's email and password against the
stored bcrypt hash and, on success, create a server-side session and set an
`HttpOnly`, `Secure`, `SameSite=Lax` cookie referencing it by opaque ID. The
session expiry SHALL be 30 days from creation, extended (sliding) on each
authenticated request that uses it.

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

### Requirement: Scoped API tokens for agents
The system SHALL let any authenticated user create a named API token acting
as its own actor, distinct from and never impersonating the human who
created it. The full token value is returned only once, at creation; the
system stores only a salted hash and a short prefix for identification. A
user manages tokens they created; token management for other users' tokens
is restricted per the authorization capability.

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

### Requirement: Domain routes require authentication
The system SHALL reject any request to a domain route (projects, cases,
suites, runs, folders, and their sub-resources) that does not resolve to an
authenticated actor via session cookie or bearer token. System routes
(`/healthz`, `/readyz`, `/api/v1/meta`) and the login route remain
unauthenticated.

#### Scenario: Anonymous request to a domain route is rejected
- **WHEN** a request to a domain route (e.g. `GET /api/v1/projects`) carries
  no valid session cookie or bearer token
- **THEN** the request is rejected with `401 {"error":"unauthorized"}`

#### Scenario: Health and meta endpoints stay open
- **WHEN** a request is made to `/healthz`, `/readyz`, or `/api/v1/meta`
  with no authentication
- **THEN** the request succeeds as before

### Requirement: Self-service profile
An authenticated user SHALL be able to view and update their own display
name, avatar, and timezone, independent of the admin-only user
management capability that manages other users' role and deactivation
status.

#### Scenario: Updating display name and timezone
- **WHEN** a user submits a new display name and/or timezone for their own account
- **THEN** the account is updated and the new values are reflected wherever the user's identity is shown

#### Scenario: Choosing a preset avatar
- **WHEN** a user selects one of the preset avatars
- **THEN** their account records that avatar's key, and it replaces the generated default wherever their identity is shown

#### Scenario: No avatar selected shows a generated default
- **WHEN** a user has not selected a preset avatar
- **THEN** a generated initial-on-color avatar is shown instead, derived from their display name (or email) and user id, requiring no stored image

#### Scenario: A user cannot edit another user's profile
- **WHEN** a user attempts to update display name, avatar, or timezone for an account that is not their own
- **THEN** the request is rejected — self-service profile editing is scoped to the authenticated user's own account only

