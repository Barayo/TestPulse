## Why

TestPulse today has exactly one way for a human to sign in: a Tenant-Admin-created
local account with an email and bcrypt password (`add-project-rbac`'s
`authentication` capability). A team evaluating or adopting TestPulse for real
usually already centralizes login through an external identity provider (Okta,
Entra ID, Google Workspace, Keycloak, etc.) and does not want to hand-provision
and hand-deprovision a second, disconnected set of credentials per person. This
is the last unshipped piece of the v0.2 "Team-ready" rung (`ROADMAP.md`,
GitHub issue #9) — `add-project-rbac` (roles/teams/permissions) already
shipped, pulled forward ahead of this one.

## What Changes

- Add OIDC (OpenID Connect) login via the standard Authorization Code + PKCE
  flow, against a single external identity provider **configured by a
  Tenant Admin at runtime** through a new "Single sign-on" card on the
  Instance Settings page (issuer URL, client ID, client secret) — the same
  DB-backed, no-restart pattern already used for every other instance-wide
  setting (public project access, run retention, color theme), not an
  env-var-only config (revised from an earlier draft of this proposal —
  see design.md's revision note). The issuer's standard discovery document
  (`/.well-known/openid-configuration`) is used, so any spec-compliant IdP
  works without per-vendor code; saving the card validates discovery
  immediately, before persisting.
- Add just-in-time (JIT) user provisioning: the first successful OIDC login
  for a given email creates a TestPulse account automatically, without a
  Tenant Admin creating it first — the one deliberate exception to
  `authentication`'s existing "no public self-registration" rule. A
  subsequent OIDC login for an email that already has a local account links
  to that same account (matched by verified email) rather than creating a
  second one.
- Add claim-based Tenant Admin mapping: an admin-configured OIDC claim name
  (the "group claim") and set of matching values that, when present in the
  ID token on any login, grants `IsTenantAdmin`.
- Add claim→Team mapping: an admin-configured list of {claim value, Team}
  pairs — on every login, the user is added (idempotently) to every Team
  whose configured claim value appears among the ID token's group-claim
  values, so an IdP group can grant project-level access (via that Team's
  existing `ProjectTeamRole` assignments) without per-project claim config.
  Deliberately additive-only: losing a claim value does not remove the
  user from a Team (see design.md D10 for why full bidirectional sync is
  out of scope). Direct per-project role mapping that bypasses `Team`
  remains out of scope for this change.
- Add an SSO-only enforcement toggle (an "SSO-only" switch on the same
  Settings card) that a Tenant Admin sets to disable password-based login
  instance-wide once SSO is confirmed working: the password login endpoint
  and the password-recovery endpoints (`password-recovery` capability)
  become rejecting/no-op, and the login page shows only the "Sign in with
  SSO" action.
- Store the OAuth client secret encrypted at rest (`TESTPULSE_ENCRYPTION_KEY`,
  a new env var, required only once a client secret is actually saved),
  never returned by any read endpoint.
- Web: the login page shows a "Sign in with SSO" link when SSO is
  configured (full-page navigation into the OIDC flow, not a fetch call),
  alongside or instead of the password form depending on the SSO-only
  toggle, mirroring how the page already conditionally shows "Forgot
  password?" based on `passwordResetEnabled`. The Instance Settings page
  gains a "Single sign-on" card (issuer, client ID, client secret,
  admin-claim fields, SSO-only toggle, disable action) alongside its
  existing Color theme / Run retention / Public project access cards.
  First-run `/setup` gains one line pointing to it after the first admin
  account is created.
- Out of scope, unaffected: API tokens/agent auth (`Scoped API tokens for
  agents` in `authentication`) — per `CLAUDE.md`'s standing architecture
  constraint, agents are first-class actors on scoped tokens and never
  authenticate via SSO. Multi-IdP support, SAML, and SCIM are later rungs
  (`v0.5+` in `ROADMAP.md`).

## Capabilities

### New Capabilities
- `sso-oidc`: OIDC Authorization Code + PKCE login against a single
  configured external IdP, JIT user provisioning, claim→Tenant-Admin
  mapping, the SSO-only enforcement toggle, and the login page's
  conditional SSO sign-in action.

### Modified Capabilities
- `authentication`: `Local user accounts` gains the JIT-provisioning
  exception to "no public self-registration"; `Session-based login` gains
  the SSO-only mode's rejection of password-based login.
- `password-recovery`: self-service password recovery becomes a no-op (not
  an error) when SSO-only mode is enabled, the same way it already
  no-ops when SMTP is unconfigured.

The login page's own conditional rendering (SSO button, password form
visibility) is specified as part of `sso-oidc` itself, following the
precedent that `password-recovery` already sets for its own "Forgot
password?" link — there is no separate `ui-navigation` login-page
requirement to modify.

## Impact

- **New Go dependencies**: `github.com/coreos/go-oidc/v3` (Apache-2.0) and
  `golang.org/x/oauth2` (BSD) — both open source per `CLAUDE.md`'s stack
  constraint. No existing OIDC/OAuth2 library is present in `apps/api/go.mod`.
- **New migration**: `apps/api/internal/db/migrations/00004_*.sql` — relax
  `users.password_hash` to nullable (SSO-only accounts never set one), add a
  nullable, unique `users.oidc_subject` column for stable account linkage
  across email changes at the IdP, add `oidc_issuer`, `oidc_client_id`,
  `oidc_client_secret_encrypted`, `oidc_group_claim`,
  `oidc_admin_claim_values`, `oidc_only` columns to `instance_settings`, and
  a new `oidc_team_mappings` table (`claim_value`, `team_id`).
- **New config**: only `TESTPULSE_ENCRYPTION_KEY` (new, optional — required
  only once a client secret is actually saved) and the already-existing
  `TESTPULSE_PUBLIC_URL` (shared with password-recovery, needed to build the
  OIDC `redirect_uri`). Everything else (issuer, client ID, client secret,
  admin-claim mapping, SSO-only) is Tenant-Admin-configured at runtime via
  `GET`/`PATCH /api/v1/instance-settings` and a new Settings-page card — no
  `TESTPULSE_OIDC_*` env vars.
- **New API surface**: `GET /auth/oidc/login` (redirect to IdP),
  `GET /auth/oidc/callback` (code exchange, JIT provisioning, session
  creation), `ssoEnabled`/`ssoOnly` fields on `GET /api/v1/meta`, new
  fields on `GET`/`PATCH /api/v1/instance-settings` (issuer, client ID,
  `oidcClientSecretSet` boolean, group-claim fields, SSO-only, a write-only
  `oidcClientSecret` input field, and a `disableSso` action), and a new
  `GET`/`POST /api/v1/sso/team-mappings` + `DELETE
  /api/v1/sso/team-mappings/{id}` (Tenant-Admin-only) for the claim→Team
  list.
- **Sample Project**: not applicable — SSO requires a real external IdP and
  cannot be meaningfully faked in `seed.go`; this is documented explicitly
  rather than silently skipped, per `CLAUDE.md`'s standing rule.
- **Docs**: `docs/deployment.md` (config reference, `TESTPULSE_ENCRYPTION_KEY`
  and the runtime-configuration story) and `docs/api.md` (the two new routes,
  the `meta` fields, the `instance-settings` fields).
