## ADDED Requirements

### Requirement: Tenant-Admin-configurable SSO settings
The system SHALL let a Tenant Admin configure OIDC/SSO settings — issuer
URL, client ID, client secret, an admin-claim name and matching values, and
an SSO-only toggle — via `PATCH /api/v1/instance-settings`, stored on the
same instance-wide settings row as every other Tenant-Admin setting
(public project access, run retention, color theme). The client secret
SHALL be encrypted at rest and SHALL NOT be returned by any read; `GET
/api/v1/instance-settings` and `GET /api/v1/meta` SHALL instead report
whether one is currently set. Saving new issuer/client ID/client secret
values SHALL validate them by performing live provider discovery before
persisting anything; a discovery failure SHALL reject the request with no
change to stored settings. A dedicated action SHALL clear every SSO
setting at once, rather than requiring the issuer field to be blanked as a
sentinel for "disabled."

#### Scenario: Saving valid SSO settings persists and enables SSO
- **WHEN** a Tenant Admin submits an issuer, client ID, and client secret
  for a reachable, spec-compliant identity provider
- **THEN** the settings are persisted, the client secret is stored
  encrypted, and `GET /api/v1/meta` reports `ssoEnabled: true`

#### Scenario: An unreachable or invalid issuer is rejected before saving
- **WHEN** a Tenant Admin submits an issuer URL that does not serve a valid
  OIDC discovery document
- **THEN** the request is rejected and no settings are changed

#### Scenario: The client secret is never returned by a read
- **WHEN** a Tenant Admin (or anyone) requests `GET /api/v1/instance-settings`
  or `GET /api/v1/meta` after SSO has been configured
- **THEN** the response reports that a client secret is set, but never its
  value

#### Scenario: Omitting the client secret on update keeps the current one
- **WHEN** a Tenant Admin updates the issuer or admin-claim fields without
  including a client secret in the request
- **THEN** the previously-stored, encrypted client secret is left unchanged

#### Scenario: Disabling SSO clears every setting at once
- **WHEN** a Tenant Admin submits the disable-SSO action
- **THEN** the issuer, client ID, client secret, admin-claim fields, and
  SSO-only toggle are all cleared, and `GET /api/v1/meta` reports
  `ssoEnabled: false`

#### Scenario: Setting a client secret without an encryption key configured is rejected
- **WHEN** a Tenant Admin submits a client secret while the instance has no
  `TESTPULSE_ENCRYPTION_KEY` configured
- **THEN** the request is rejected with an error naming the missing
  environment variable, and no settings are changed

### Requirement: OIDC login against a configured external identity provider
The system SHALL let a user authenticate via OpenID Connect Authorization
Code flow with PKCE against the single external identity provider
configured per the previous requirement. The provider's standard discovery
document (`<issuer>/.well-known/openid-configuration`) SHALL be used to
locate its authorization, token, and JWKS endpoints, so any spec-compliant
IdP works without provider-specific code. `GET /auth/oidc/login` SHALL
redirect to the provider's authorization endpoint with a PKCE code
challenge and a signed `state` value, and SHALL bind that `state` to the
browser making the request via a same-named `HttpOnly` cookie set in the
same response. `GET /auth/oidc/callback` SHALL reject the request unless
the presented cookie matches the `state` query parameter, in addition to
verifying the signed payload itself — the signature alone proves the
server issued it, not that the caller is the browser that started the
flow. Only once both checks pass SHALL it exchange the returned code for
tokens, validate the ID token (issuer, audience, signature, nonce), and
create a session identical in shape to a password login's session.

#### Scenario: SSO is not configured
- **WHEN** no Tenant Admin has configured issuer/client ID/client secret
- **THEN** `GET /auth/oidc/login` and `GET /auth/oidc/callback` respond `404`,
  and `GET /api/v1/meta` reports `ssoEnabled: false`

#### Scenario: Successful OIDC login creates a session
- **WHEN** a user completes the OIDC flow with a valid ID token
- **THEN** a session is created and its cookie is set exactly as a password
  login's would be, and the browser is redirected to the app

#### Scenario: Tampered or expired state is rejected
- **WHEN** the callback's `state` parameter fails signature verification or
  its embedded expiry has passed
- **THEN** the request is rejected with `401` and no session is created

#### Scenario: A valid state without its binding cookie is rejected (login CSRF)
- **WHEN** the callback's `state` parameter is validly signed and
  unexpired, but the request carries no matching `state`-binding cookie
  (e.g. an attacker replaying their own validly-signed `state` against a
  different browser)
- **THEN** the request is rejected with `401` and no session is created

#### Scenario: A valid state with a mismatched binding cookie is rejected
- **WHEN** the callback's `state` parameter is validly signed and
  unexpired, but the presented cookie's value does not match it
- **THEN** the request is rejected with `401` and no session is created

#### Scenario: An invalid ID token is rejected
- **WHEN** the token exchange returns an ID token with the wrong issuer,
  audience, or signature
- **THEN** the request is rejected with `401` and no session is created

### Requirement: Just-in-time user provisioning and account linking
The system SHALL create a new user account automatically on a person's first
successful OIDC login, without requiring a Tenant Admin to have created it
first. Matching an OIDC login to a TestPulse account SHALL proceed in order: by a
previously-linked `oidc_subject`; then by matching email against an
existing account. Since email is unique per account, an email match to an
existing account SHALL link that account (backfilling its `oidc_subject`)
only when the ID token asserts `email_verified: true`; when the ID token
does not assert this, the login SHALL be rejected rather than linked or
duplicated. When no account holds that email at all, a new account SHALL
be created with `oidc_subject` set and no password, regardless of the
email-verified flag — there being no existing account to collide with. A
JIT-provisioned account's `displayName` SHALL default the same way a
Tenant-Admin-created account's does.

#### Scenario: First login for a new email provisions an account
- **WHEN** a person completes OIDC login with an email that has no existing
  TestPulse account
- **THEN** a new account is created with that email, no password set, and
  `oidc_subject` recorded

#### Scenario: A returning SSO user is matched by subject
- **WHEN** a person who has logged in via SSO before logs in again
- **THEN** they are authenticated as the same account, even if their email
  changed at the identity provider since their last login

#### Scenario: An existing local account is linked on first SSO login by verified email
- **WHEN** a person with an existing password-based TestPulse account logs
  in via SSO using the same, verified email
- **THEN** they are authenticated as that same existing account, and its
  `oidc_subject` is recorded for future logins

#### Scenario: An unverified email colliding with an existing account is rejected
- **WHEN** an OIDC login's ID token has a matching email but
  `email_verified: false`, and an existing account already holds that email
- **THEN** the login is rejected — no linking, and no duplicate account
  (email is unique per account, so a "distinct" account with the same email
  is not possible)

#### Scenario: An unverified email with no existing account is provisioned normally
- **WHEN** an OIDC login's ID token has `email_verified: false` and no
  account holds that email yet
- **THEN** a new account is provisioned as usual — verification only
  matters when deciding whether to trust an existing account, not when
  there is nothing to collide with

### Requirement: Claim-based Tenant Admin mapping
The system SHALL grant `IsTenantAdmin` to a user, re-evaluated on every OIDC
login, when a group claim name and a set of matching admin values are
configured (Tenant-Admin-configurable, see the settings requirement above)
and the ID token's named claim contains one of the configured values.
Direct per-project role assignment that bypasses `Team` remains out of
scope; project-level access via claim mapping happens only through the
Team-mapping requirement below.

#### Scenario: A matching claim grants Tenant Admin
- **WHEN** an ID token's configured claim contains one of the configured
  admin values
- **THEN** the authenticated user has `IsTenantAdmin: true`, whether the
  account was just provisioned or already existed

#### Scenario: A missing or non-matching claim does not grant admin
- **WHEN** an ID token lacks the configured claim, or its value doesn't
  match any configured admin value
- **THEN** the user's `IsTenantAdmin` status is unaffected by this login

#### Scenario: Losing the claim demotes on next login
- **WHEN** a user previously granted Tenant Admin via a matching claim logs
  in again with an ID token that no longer contains a matching value
- **THEN** `IsTenantAdmin` is set to `false` for that account

### Requirement: Claim-based Team mapping
The system SHALL let a Tenant Admin configure a list of {claim value,
Team} pairs, matched against the same group claim configured for Tenant
Admin mapping. On every OIDC login, for each configured pair whose claim
value appears among the ID token's group-claim values, the user SHALL be
added to that Team if not already a member. This mapping SHALL be
additive only: a claim value no longer present SHALL NOT remove the user
from a Team they were previously added to by this mechanism, or from any
Team an admin added them to directly.

#### Scenario: A matching claim value adds the user to the mapped Team
- **WHEN** a Tenant Admin has mapped claim value "engineers" to Team
  "Platform", and a user's ID token's group claim includes "engineers"
- **THEN** the user is added as a member of Team "Platform"

#### Scenario: Already being a member is a no-op
- **WHEN** a user who is already a member of a mapped Team logs in again
  with the same matching claim value
- **THEN** their membership is unchanged — no duplicate membership, no error

#### Scenario: A non-matching claim value does not add Team membership
- **WHEN** a user's ID token's group claim does not include any configured
  mapping's claim value
- **THEN** no Team membership changes as a result of this login

#### Scenario: Losing a claim value does not remove existing Team membership
- **WHEN** a user previously added to a Team via a matching claim value
  logs in again with an ID token that no longer contains that value
- **THEN** the user remains a member of that Team — this mapping never
  removes membership automatically

#### Scenario: Multiple mapped claim values add membership to multiple Teams
- **WHEN** a user's ID token's group claim includes values matching more
  than one configured mapping
- **THEN** the user is added to every matching Team

### Requirement: SSO-only enforcement
The system SHALL let a Tenant Admin disable password-based login
instance-wide via the SSO-only setting (see the settings requirement
above), only usable while OIDC is configured. While enabled, `POST
/auth/login` SHALL reject every request regardless of credentials, and the
`password-recovery` capability's endpoints SHALL no-op the same way they
already do when SMTP is unconfigured.

#### Scenario: Password login is rejected when SSO-only is enabled
- **WHEN** SSO-only is enabled and any request is made to
  `POST /auth/login`
- **THEN** the request is rejected with `401`, regardless of whether the
  submitted credentials are otherwise correct

#### Scenario: Instance metadata reflects SSO-only mode
- **WHEN** a client requests `GET /api/v1/meta` while SSO-only is enabled
- **THEN** the response reports `ssoEnabled: true` and `ssoOnly: true`, so
  the login page can hide the password form entirely

### Requirement: Login page reflects SSO configuration
The web UI's login page SHALL show a "Sign in with SSO" action, navigating
the full page (not a fetch call) to `/auth/oidc/login`, whenever instance
metadata reports `ssoEnabled: true`. When `ssoOnly: true`, the password
email/password form SHALL NOT render at all — only the SSO action. When
`ssoEnabled: false`, the page SHALL render exactly as it does today, with
no SSO affordance.

#### Scenario: SSO configured alongside password login
- **WHEN** a user visits the login page and `ssoEnabled: true`,
  `ssoOnly: false`
- **THEN** both the password form and a "Sign in with SSO" action are shown

#### Scenario: SSO-only hides the password form
- **WHEN** a user visits the login page and `ssoOnly: true`
- **THEN** only the "Sign in with SSO" action is shown, with no email or
  password fields

#### Scenario: No SSO configured shows today's page unchanged
- **WHEN** a user visits the login page and `ssoEnabled: false`
- **THEN** the page renders exactly as it does before this change, with no
  SSO action

### Requirement: First-run setup points to SSO configuration
Since SSO can only be configured by a Tenant Admin, and the first-run
setup flow is how the very first one is created, no instance can have SSO
configured at the moment first-run setup completes. The web UI's first-run
setup success step SHALL include a pointer to Instance Settings for
configuring single sign-on later, rather than a dedicated setup step.

#### Scenario: First-run setup completion mentions SSO is available later
- **WHEN** a person completes first-run setup, creating the instance's
  first Tenant Admin account
- **THEN** the success step includes a pointer to Instance Settings for
  configuring single sign-on, without requiring it to be configured now
