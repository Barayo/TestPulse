## Context

Today's only login path is `Service.Login(ctx, email, password)`
(`apps/api/internal/service/identity.go`): verify a bcrypt hash, then
`createSession` — a 32-byte random secret, stored only as its SHA-256 hash
(`store.Sessions.Create`), returned once as an `HttpOnly`/`Secure`/`SameSite=Lax`
cookie. `domain.User` has no external-identity concept. `users.password_hash`
is `NOT NULL`. There is no public self-registration — every account is either
Tenant-Admin-created, the env-var-seeded bootstrap admin, or the one-time
`/setup` first-run flow. Per `CLAUDE.md`, agents authenticate exclusively via
scoped API tokens and are untouched by this change.

**Revision note**: an earlier pass of this design (still visible in D2–D6
below, which mostly still hold) put SSO config entirely behind env vars,
following the SMTP/password-recovery precedent
(`Config.PasswordResetEnabled()`). A manual walkthrough against a real IdP
(Dex) surfaced that this doesn't match how every other Tenant-Admin-facing
instance setting works today — `InstanceSettings`
(`public_projects_enabled`, `run_retention_days`, `color_theme`, etc.) is a
single DB row, read/written through `GET/PATCH /api/v1/instance-settings`
and a Settings-page card, with no restart required. D1 below replaces the
env-var model with that same pattern before any of this ships (nothing here
has been committed, so this is a redesign, not a migration).

## Goals / Non-Goals

**Goals:**
- Let a human sign in via OIDC Authorization Code + PKCE against one
  external IdP, configured by a Tenant Admin through a Settings-page card
  (no restart), discovered via the IdP's standard
  `/.well-known/openid-configuration` document.
- JIT-provision a TestPulse account on first successful OIDC login; link to
  an existing account by verified email on subsequent logins.
- Let a configured ID-token claim grant `IsTenantAdmin`.
- Let a Tenant Admin disable password login instance-wide once SSO works.
- Store the OAuth client secret encrypted at rest, not in plaintext.

**Non-Goals:**
- Multiple simultaneously configured IdPs (single IdP per instance for this
  change; ROADMAP's `v0.5+` line is where multi-tenant/enterprise auth
  variety belongs).
- Arbitrary per-project role mapping from claims that bypasses `Team`
  entirely, and full bidirectional sync (automatic *removal* from a `Team`
  when a claim value is lost — see D10 for why that boundary is deliberate).
- SAML/SCIM (later rungs).
- Changing anything about agent/API-token authentication.

## Decisions

### D1: DB-backed config on `instance_settings`, admin UI, live reload — not env vars
SSO config (issuer, client ID, encrypted client secret, admin-claim
name/values, SSO-only toggle) lives as more columns on the existing
singleton `instance_settings` row (`enable-public-project-access`,
`add-color-theme-customization`'s precedent), read/written through the
existing `GET`/`PATCH /api/v1/instance-settings` endpoints
(Tenant-Admin-only, unchanged authorization) and a new "Single sign-on"
card on `InstanceSettingsPage.tsx`, next to Color theme / Run retention /
Public project access. `TESTPULSE_PUBLIC_URL` (already required for
password-recovery's reset-link, and for building the OIDC `redirect_uri`)
remains the one env var this feature still reads; every other value is
admin-set at runtime, no restart, no redeploy.

Rejected the original env-var-only design (see the revision note above):
it matched the SMTP precedent structurally, but SMTP is genuinely
ops-owned config (a mail relay's credentials aren't something a Tenant
Admin manages day-to-day), whereas an IdP integration is exactly the kind
of thing this codebase already treats as Tenant-Admin self-service
(`InstanceSettings`'s other five fields). Also rejected a brand-new
`identity_provider_configs` table: `instance_settings` is already the
established "one Tenant-Admin-editable settings row" home, and a second
singleton table would just be the same pattern duplicated for no reason.

### D7: Client secret encrypted at rest with a new required-when-used key
`TESTPULSE_OIDC_CLIENT_SECRET` no longer exists — `PATCH
/api/v1/instance-settings` accepts a plaintext `oidcClientSecret` field
(write-only: never echoed back by `GET`, which instead reports
`oidcClientSecretSet: true/false`), and the service layer encrypts it
(AES-256-GCM, key = `sha256(TESTPULSE_ENCRYPTION_KEY)` to normalize any
passphrase length to 32 bytes) before it reaches `store.InstanceSettings`.
`TESTPULSE_ENCRYPTION_KEY` is a new, optional env var — optional because an
instance that never configures SSO never needs it; attempting to save an
OIDC client secret without it configured is rejected with an error naming
the missing variable, the same "fail fast by name" shape `config.Load`
already uses for `TESTPULSE_DATABASE_URL`. Omitting `oidcClientSecret` on a
`PATCH` leaves the currently-stored one untouched (matches
`UpdatePasswordHash`'s "only touch what's explicitly provided" shape); a
dedicated `disableSso: true` field clears every `oidc_*` column at once
(avoids the empty-string-vs-unchanged ambiguity `ClearAvatarKey` was
already introduced to solve for exactly this reason).

### D8: A live-reloadable authenticator, validated before it's persisted
Because config can now change at runtime, the previous "discover once at
boot, pass a fixed `*OIDCAuthenticator` into `server.New`" shape doesn't
work. `server.OIDCManager` holds the current `*OIDCAuthenticator` behind an
`atomic.Pointer`; `oidcLogin`/`oidcCallback`/`handleMeta` read through it on
every request. `PATCH /api/v1/instance-settings`, when the request changes
any OIDC field, first attempts `NewOIDCAuthenticator` against the
*proposed* new values (live discovery against the new issuer) — a 400 with
the discovery error is returned immediately, before anything is persisted,
if that fails — and only on success does it persist to `instance_settings`
and swap `OIDCManager`'s pointer. This gives an admin immediate,
in-the-form feedback on a bad issuer URL instead of a silent failure the
next time someone tries to log in. At boot, `main.go` reads
`instance_settings` and attempts the same discovery for whatever's already
stored; unlike before, a failure here is *not* a fatal startup error (SSO
is now a runtime admin setting, not deploy-time infra config) — it logs a
warning and starts with SSO disabled, matching how deployment.md already
tells an admin to verify SSO works before flipping SSO-only, rather than
letting a bad third-party dependency someone configured take the whole app
down.

### D10: Claim→Team mapping is additive-only — no automatic removal
Real IdP groups commonly need to grant project-level access too, not just
the single Tenant Admin boolean (D5). The natural extension point is
`Team`: `Team.MemberIDs` already carries membership, and a Team's own
`ProjectTeamRole` assignments already grant project roles — so a
claim→Team mapping table (`oidc_team_mappings`: `claim_value`, `team_id`)
lets an admin declare "IdP group X → TestPulse Team Y" pairs, re-evaluated
on every login: for each configured pair whose `claim_value` appears among
the ID token's group-claim values, the user is added to that `Team` if not
already a member (idempotent).

The claim NAME used for this is the same one configured for Tenant Admin
matching (D5) — renamed from `oidc_admin_claim` to `oidc_group_claim` to
be honest that it now serves both purposes, since "which claim carries the
IdP's group list" is one fact about the IdP, not two.

This is deliberately **additive only**: losing a claim value does NOT
remove the user from that `Team`. Unlike the single Tenant Admin boolean
(where "on" and "off" are the whole state, so demoting on claim loss is
unambiguous and safe), `Team.MemberIDs` is a list an admin may also curate
directly — automatically removing entries this sync itself didn't
necessarily add would require tracking per-membership provenance (was this
membership SSO-granted or admin-added?), which is a real SCIM-shaped
feature, not a one-login side effect. Add-only still delivers the common
case (a new hire's IdP group membership grants them the right project
access automatically) without that provenance-tracking complexity; a
Tenant Admin who needs to *revoke* still removes someone from a Team
manually, exactly as they would today with no SSO involved at all.
Full bidirectional sync (and arbitrary per-project claim mapping beyond
Team-shaped groups) remains explicitly out of scope, same reasoning as D5.

### D9: A one-line pointer as static copy on the setup form, not a post-submit banner
A brand-new instance has zero users and thus zero possible SSO config —
only a Tenant Admin can configure SSO, and `/setup`'s whole job is creating
the *first* one. There is nothing to "surface" about existing SSO state at
that point; there can't be any yet. `/setup` also has no intermediate
success screen to attach a line to — `handleSubmit` navigates straight to
`/` on success (`justSucceeded.current = true; navigate('/', { replace:
true })`), and `/` has no router-state banner mechanism the way
`/login`/`/reset-password` do (discovered while implementing — an earlier
draft of this design assumed a "success step" that doesn't exist). Rather
than add a new banner mechanism to the projects root just for this one
line, the pointer is static copy on the setup form itself — "You can
configure single sign-on later from Instance Settings." — visible before
submission, not after. Keeps first-run setup exactly as short as it is
today for the common case (no SSO, just a local admin).

### D2: PKCE verifier/nonce carried in a signed `state`, not server-side storage
The OIDC `state` param returned by the IdP on callback needs to prove the
callback belongs to a request this server actually issued, and carry the
PKCE code verifier and the nonce used for ID-token replay protection.
Instead of a new `oidc_login_attempts` table (a 10-minute-lived row needing
its own cleanup), `state` itself is an HMAC-SHA256-signed, base64url payload
`{verifier, nonce, exp}`, keyed by `TESTPULSE_ENCRYPTION_KEY` (D7) rather
than the OIDC client secret itself — the client secret is now admin-editable
at runtime (D1), and tying state-signing to a value that can be rotated
mid-flight would invalidate any in-flight login attempt; `ENCRYPTION_KEY`
is the one still-stable, still-server-only secret this feature has. The
callback recomputes the HMAC before trusting the payload and
rejects an expired or tampered `state` the same way a wrong password is
rejected: `401`, no session created. Rejected a bare unsigned cookie alone:
the verifier is a bearer secret for the token exchange and must be
tamper-evident, not just present.

**Revision (caught by automated security review, not by the original
design or its tests): a signed `state` alone is not enough.** It proves
*this server* issued the payload, but not that the browser presenting the
callback is the *same* browser that started the flow — the classic OAuth
login-CSRF gap (an attacker can start their own flow, get a validly-signed
`state` for their own IdP session, then get a victim's browser to hit the
callback URL with it, logging the victim in as the attacker). The fix adds
back exactly one cookie — `oidc_state`, `HttpOnly`/`Secure`/`SameSite=Lax`,
set at `oidcLogin` to the same value as the `state` query param, checked
(`hmac.Equal`) at `oidcCallback`, cleared immediately after — binding the
callback to the browser that started it without needing server-side
storage; this is additive to the signed payload, not a replacement for it.

### D3: Account matching — `oidc_subject` first, then by email (verified only), then JIT-provision
`users` gains a nullable, unique `oidc_subject` column. On callback: look up
by `oidc_subject` (stable across IdP-side email changes) first. If that
misses, look up by the ID token's `email` claim:
- **An account with that email already exists.** `users.email` is unique,
  so there is no way to create a second, distinct account with the same
  email — the only choices are link or reject. Link (backfilling
  `oidc_subject`) only when the IdP asserts `email_verified: true`;
  otherwise reject the login outright (discovered during implementation —
  an early draft of this design tried to "create a distinct account
  instead," which is impossible under the unique constraint and was caught
  by the first test asserting it).
- **No account holds that email yet.** Nothing to collide with, so
  JIT-provision regardless of the email-verified flag — verification only
  matters when it's being used to decide trust in an *existing* account.

A JIT-provisioned account's display name defaults the same way
`Service.CreateUser`'s does (`domain.DefaultDisplayName`).

### D4: `password_hash` becomes nullable; existing password `Login` needs no special-casing
`bcrypt.CompareHashAndPassword` against a `NULL`/empty hash already fails
closed — an SSO-only account attempting password login gets the same `401`
as a wrong password, with no new conditional in `Service.Login`. Only the
migration (`ALTER COLUMN password_hash DROP NOT NULL`) and
`store.Users.Create`'s SSO-provisioning variant change.

### D5: Claim→role mapping scoped to a Tenant Admin boolean plus Team membership, not arbitrary per-project roles
The issue asks for "claim→role mapping." Mapping arbitrary claim values
directly to arbitrary per-project roles (bypassing `Team` entirely) would
need new structured config with no existing analog and no clear MVP shape.
Reusing the existing `IsTenantAdmin` boolean — already a first-class
field, already fully wired through `EffectivePermissions` — covers the
instance-wide case; `Team` membership (D10) covers the project-scoped
case, reusing a mapping (`Team` → `ProjectTeamRole`) that already exists
rather than inventing a second one. Both are re-evaluated on every login
(not just at provisioning): the Tenant Admin boolean flips both ways
(D5 itself); `Team` membership only ever gains entries (D10) — see D10 for
why those aren't symmetric. Assigning a *new* Team's project roles, or
handling any mapping shape `Team` can't express, still happens through
`add-project-rbac`'s existing admin flows, unchanged.

### D6: SSO-only mode disables password login and password recovery, with no break-glass
The `oidc_only` column (D1), read live from `instance_settings` on every
call rather than snapshotted at construction, makes `Service.Login` reject
unconditionally (before touching the `users` table) and makes both
password-recovery endpoints no-op, the same shape `PasswordResetEnabled`
already uses for "SMTP not configured." No separate break-glass path is
introduced: a Tenant Admin only enables this after confirming their own SSO
login works, and the existing env-var bootstrap-admin path only ever runs
once, before any admin action — it cannot itself be locked out by a
setting only reachable after login.

## Risks / Trade-offs

- **[Risk] Email-based account linking trusts the IdP's `email_verified`
  claim.** → Mitigation: only link-by-email when `email_verified: true`;
  otherwise JIT-provision a distinct account. This is the standard mitigation
  most OIDC relying parties use and is safe for the single-trusted-IdP-per-
  instance model this change targets.
- **[Risk] A misconfigured IdP after SSO-only is enabled locks everyone
  out.** → Mitigation: documented prominently in `docs/deployment.md` and
  in the Settings-page card's own copy (test SSO login before flipping
  SSO-only); recovery, since there's no break-glass, is a direct DB
  update to `instance_settings.oidc_only = false` — documented as the
  explicit recovery step, the same category of manual fix a locked-out
  instance already has no better alternative to today.
- **[Risk] The encrypted client secret is unrecoverable if
  `TESTPULSE_ENCRYPTION_KEY` is lost or changed.** → Mitigation: documented
  in `docs/deployment.md` as a key an operator must treat like any other
  production secret (back it up, don't rotate casually); losing it means
  re-entering the client secret via the Settings-page card, not a full SSO
  reconfiguration (issuer/client ID/admin-claim survive untouched).
- **[Trade-off] Single IdP per instance.** Acceptable for v0.2's "Team-ready"
  scope (one org, one IdP); multi-IdP is a real feature, not an oversight,
  and belongs to a later rung if demand appears.

## Migration Plan

1. `00004_sso_oidc.sql`: `ALTER TABLE users ALTER COLUMN password_hash DROP
   NOT NULL`; `ALTER TABLE users ADD COLUMN oidc_subject text UNIQUE`;
   `ALTER TABLE instance_settings ADD COLUMN oidc_issuer text, ADD COLUMN
   oidc_client_id text, ADD COLUMN oidc_client_secret_encrypted text, ADD
   COLUMN oidc_group_claim text, ADD COLUMN oidc_admin_claim_values
   text[], ADD COLUMN oidc_only boolean NOT NULL DEFAULT false`; `CREATE
   TABLE oidc_team_mappings (id uuid PK, claim_value text NOT NULL, team_id
   uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE)` (D10). Purely
   additive — no backfill needed.
2. Deploy with no SSO configured (the default for every instance, new or
   existing): every `oidc_*` column is `NULL`/empty/false,
   `ssoEnabled`/`ssoOnly` report `false`, `/auth/oidc/*` 404s, login page
   unchanged — fully backward compatible.
3. A Tenant Admin opens Instance Settings, fills in the "Single sign-on"
   card (issuer, client ID, client secret), saves — the save call itself
   validates discovery before persisting (D8) — verifies SSO login
   end-to-end, optionally sets the admin-claim fields, and only then
   optionally flips SSO-only.
4. Rollback: flip SSO-only back off, or use "Disable SSO" to clear every
   `oidc_*` column at once — both are immediate, no restart, no redeploy.

## Open Questions

None outstanding.
