## Context

`BootstrapAdmin` (`apps/api/internal/service/identity.go`) creates the first
Tenant Admin from `TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD` env
vars, but only if *both* are set (`if email == "" || password == ""
{ return nil }`). An operator who forgets, or deliberately omits, either one
ends up with an instance that has zero users and no way in short of a
restart with both vars set. Issue #67 (top of the board's Planned column)
asks for a way in regardless.

The design below was worked out collaboratively with the user and Pepe
(TestPulse's UX persona) this session, including a full HTML mock of the
new screen; this document captures the agreed outcome and its rationale,
not a menu of options.

## Goals / Non-Goals

**Goals:**
- An instance that boots with no admin env vars set is still usable: the
  first visitor is walked through creating the Tenant Admin account
  themselves, with their own chosen email and password.
- Zero behavior change for the existing, common case (both env vars set).
- The setup path closes permanently and irreversibly once any user exists —
  bootstrap-only, never revisited after first configuration.

**Non-Goals:**
- Not a general "instance setup wizard" (branding, SMTP config, etc.) —
  scoped to exactly one thing, creating the first admin account.
- Not a replacement for `mustChangePassword` — that gate is untouched and
  still applies everywhere it already did (admin-generated temporary
  passwords). This change doesn't route through it because there is nothing
  temporary about a password the person just typed themselves.
- Not solving the "who reaches `/setup` first" race at the application
  layer beyond an honest in-product warning — see Risks below.

## Decisions

**Display name: derive from email via `CreateUser`'s existing default, not
`BootstrapAdmin`'s fixed "Admin" profile.** `CreateUser` already calls
`domain.DefaultDisplayName(email)` for every account it creates.
`BootstrapAdmin` overrides that afterward with a fixed `"Admin"` /
`"grace-hopper"` / `"UTC"` profile — appropriate there because the email
comes from an env var with no human present to name themselves. The
interactive setup path has a real human filling out a real form, so it
uses `CreateUser`'s ordinary default (their own email's local-part) and
does **not** apply `BootstrapAdmin`'s override. Timezone and avatar stay
unset (generated-initial default, like any other freshly created account)
rather than hardcoded to `"UTC"`/`"grace-hopper"` — the account can set
these for real once inside.

**Sample Project re-seed on successful setup, not just at boot.** Found via
manual local testing (a real docker-compose deploy with the admin env vars
unset, not just automated tests): `main.go`'s boot-time
`seedSampleProjectIfEmpty` runs once, immediately after `BootstrapAdmin`.
On a first-run-setup instance `BootstrapAdmin` is a no-op, so that boot-time
attempt has no Tenant Admin to attribute the seed to, fails, and — being a
one-shot startup check — never retries once the interactive admin actually
gets created later. The always-on Sample Project showroom (CLAUDE.md)
would silently go missing for every instance that takes this path. Fixed
by calling the same seed-if-empty check again inside `setupFirstAdmin`'s
HTTP handler right after account creation succeeds, with its own small
duplicate of the boot-time function — `sampledata` imports `service`, so
`service` can't call back into `sampledata`, and `cmd/testpulse-api` isn't
importable from `internal/server`, so sharing the exact function across
both call sites isn't available without a larger restructure this doesn't
need.

**New `Service.HasAnyUser(ctx) (bool, error)`**, mirroring the existing
`Service.HasAnyProject` exactly (`len(s.store.Users.List(ctx)) > 0`) —
same shape, same justification (bypasses RBAC entirely since there's no
authenticated actor yet). Used by both `GET /api/v1/meta`'s
`setupRequired` field and `POST /api/v1/setup`'s server-side race check.

**`POST /api/v1/setup` reuses `CreateUser`, then logs in exactly like
`POST /api/v1/auth/login` does** — same session-creation code path, same
response shape (`AuthUser`), same cookie-setting. No new session mechanics
to build or test independently.

**Race handling**: `POST /api/v1/setup`'s handler re-checks `HasAnyUser`
inside the same request, immediately before creating the account (not
relying on the `GET /api/v1/meta` check the frontend made earlier, which
can be stale by the time of submission). If a user now exists, return
`409` with a body distinguishable from a validation error. The frontend
treats `409` specifically: redirect to `/login` carrying a message via
`LoginPage`'s existing one-shot router-state banner, generalized to accept
an arbitrary string (today it's hardcoded to the password-reset
confirmation text) — "This instance has already been set up — log in with
an existing account."

**Frontend gating**: `AuthProvider` fetches `setupRequired` alongside its
existing `GET /api/v1/users/me` check at boot, exposes it through context.
`RequireAuth`/`AllowAnonymous` (`App.tsx`) redirect to `/setup` when true,
checked before their existing `mustChangePassword`/session checks — `/` is
itself an anonymous route, so a fresh instance's very first visitor hits
one of these two wrappers directly. `SetupPage` itself redirects to
`/login` if `setupRequired` is false (stale visit after setup completed
elsewhere) — no extra fetch, it reads the same context value.

**Screen content** (Pepe's mock, approved): `/setup`, visually identical to
`LoginPage` (centered `Card`, `HealthBadge` top-right). Title "Set up
TestPulse," a warning callout *before* the form (visual idiom borrowed
verbatim from `ChangePasswordForm`'s existing warning styling, but moved
earlier — this warning is about *whether you should be the one filling
this out*, not a mechanics footnote to read after the fact): "This account
becomes the instance administrator — whoever completes this form first
gets full administrative access to this TestPulse instance — projects,
people, and settings. If you didn't expect to see this screen, check with
whoever manages it before continuing." Fields: Email, Password (with the
existing `GeneratedPasswordChip` generate-shortcut and strength helper),
Confirm password — `ResetPasswordPage`'s field set and validation, not
`ChangePasswordForm`'s (no current-password field applies). Submit:
"Create admin account" / "Creating…". No footer links. On success:
auto-login, land on `/` directly (no confirmation detour — unlike
`ResetPasswordPage`, there's no prior session or device-switch scenario to
protect a re-login checkpoint for).

## Risks / Trade-offs

- **[Risk] First-loader-claims-admin race on a network-reachable
  instance.** Before an operator finishes configuring the env vars (or
  immediately after boot, before they've had a chance to visit `/setup`
  themselves), anyone who can reach the instance and loads `/setup` first
  becomes the permanent Tenant Admin. → **Mitigation**: the in-product
  warning names this honestly so a legitimate first visitor who wasn't
  expecting the screen knows to stop; `docs/deployment.md` gets an explicit
  note to configure `TESTPULSE_ADMIN_EMAIL`/`PASSWORD` before first boot, or
  keep network access restricted until setup completes, for any instance
  reachable by untrusted parties pre-setup. This is a deployment-topology
  concern the application layer cannot fully close — accepted, not solved.
- **[Trade-off] No email verification on the setup-created account.**
  Consistent with every other account-creation path in this app today
  (Tenant-Admin-created accounts aren't verified either) — not a new gap
  introduced by this change.
