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
temporary password that forces the required-change flag in the same
action.

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

### Requirement: Session-based login
The system SHALL authenticate a user's email and password against the
stored bcrypt hash and, on success, create a server-side session and set an
`HttpOnly`, `Secure`, `SameSite=Lax` cookie referencing it by opaque ID. The
session expiry SHALL be a Tenant-Admin-configurable number of days from
creation (`sessionTimeoutDays`, default 30, bounded 1–90), extended
(sliding) on each authenticated request that uses it, using whatever value
is currently configured at the time of creation or extension. When SSO-only
mode is enabled (see `sso-oidc`), password-based login SHALL be rejected
regardless of credentials; a session created via OIDC login uses this same
mechanism and expiry.

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

#### Scenario: Active use extends the session by the configured timeout
- **WHEN** a request authenticates successfully using a session with less
  than the currently-configured `sessionTimeoutDays` remaining before expiry
- **THEN** the session's expiry is pushed forward to `sessionTimeoutDays`
  from that request

#### Scenario: A Tenant Admin configures the session timeout
- **WHEN** a Tenant Admin sets `sessionTimeoutDays` to a value between 1 and 90 via the instance settings update endpoint
- **THEN** the new value is saved and used for sessions created or extended from that point on

#### Scenario: Out-of-bounds timeout values are rejected
- **WHEN** a Tenant Admin attempts to set `sessionTimeoutDays` to less than 1 or more than 90
- **THEN** the request is rejected with a validation error and the setting is unchanged

#### Scenario: Changing the timeout does not affect already-active sessions
- **WHEN** a Tenant Admin changes `sessionTimeoutDays` while other sessions are already active
- **THEN** those sessions keep their existing expiry until they are next extended or expire naturally, rather than being immediately shortened or extended

#### Scenario: Expired session is rejected
- **WHEN** a request presents a session cookie whose session has expired
- **THEN** the request is rejected with `401` as if unauthenticated

#### Scenario: SSO-only mode rejects password login even with correct credentials
- **WHEN** SSO-only mode is enabled and a user submits their correct email
  and password to `POST /api/v1/auth/login`
- **THEN** the request is rejected with `401` and no session is created

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

### Requirement: Domain routes require authentication
The system SHALL reject any request to a domain route (projects, cases,
suites, runs, folders, and their sub-resources) that does not resolve to an
authenticated actor via session cookie or bearer token. System routes
(`/healthz`, `/readyz`, `/api/v1/meta`), the login route, and — only while
the instance has zero user accounts — the first-run setup route remain
unauthenticated.

#### Scenario: Anonymous request to a domain route is rejected
- **WHEN** a request to a domain route (e.g. `GET /api/v1/projects`) carries
  no valid session cookie or bearer token
- **THEN** the request is rejected with `401 {"error":"unauthorized"}`

#### Scenario: Health and meta endpoints stay open
- **WHEN** a request is made to `/healthz`, `/readyz`, or `/api/v1/meta`
  with no authentication
- **THEN** the request succeeds as before

#### Scenario: First-run setup stays open only while the instance has no users
- **WHEN** an unauthenticated request reaches the first-run setup route
  while the instance already has at least one user account
- **THEN** the request is rejected, unlike `/healthz`/`/readyz`/`/api/v1/meta`
  which stay open unconditionally

### Requirement: First-run instance setup
When an instance has zero user accounts and startup did not bootstrap one
from `TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD`, the system SHALL
let the first visitor create the Tenant Admin account themselves — their
own email and their own chosen password, supplied directly in the same
request that creates the account. This is a narrow, explicit exception to
"only a Tenant Admin can create a new account" (see Local user accounts),
scoped to the zero-users bootstrap moment only. Once any user account
exists, this SHALL be permanently unavailable, regardless of the env
variables' state. The created account SHALL NOT be flagged as requiring a
password change — that flag exists for admin-generated temporary
passwords, and does not apply to a password the account's own owner just
chose.

#### Scenario: Creating the first admin account
- **WHEN** the instance has zero user accounts and someone submits an
  email and a password meeting the minimum strength requirement to set up
  the instance
- **THEN** a Tenant Admin account is created with that email and password,
  a session is created for it exactly as a successful login would, and the
  account is not flagged as requiring a password change

#### Scenario: Unavailable once any user exists
- **WHEN** the instance already has at least one user account and a
  request attempts first-run setup
- **THEN** the request is rejected and no account is created, regardless
  of whether the account created is later authenticated as the request's
  own actor

#### Scenario: Concurrent setup attempts — only one succeeds
- **WHEN** two first-run setup requests arrive for a still-empty instance
  at effectively the same time
- **THEN** exactly one creates the Tenant Admin account; the other is
  rejected as if the instance were already set up

#### Scenario: Weak password is rejected
- **WHEN** a first-run setup request submits a password under 12
  characters
- **THEN** the request is rejected with a validation error naming the
  field, and no account is created

### Requirement: Self-service profile
An authenticated user SHALL be able to view and update their own display
name, avatar, and timezone, independent of the admin-only user
management capability that manages other users' role and deactivation
status. The preset avatar roster SHALL include at least 14 women out of
at least 30 total presets — a floor, not a ceiling, kept as a regression
guard against the roster drifting back toward the skew flagged in issue
#125 (originally 6 women of 21) as future presets are added.

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

#### Scenario: Preset avatar roster meets the gender-balance floor
- **WHEN** the preset avatar roster is inspected (e.g. by a unit test over `AVATAR_PRESETS`)
- **THEN** it includes at least 14 women out of at least 30 total presets
