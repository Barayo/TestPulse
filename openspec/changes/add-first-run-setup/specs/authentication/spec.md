## ADDED Requirements

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

## MODIFIED Requirements

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
