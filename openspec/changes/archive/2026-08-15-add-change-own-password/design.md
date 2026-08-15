## Context

Three password-setting paths already exist, each substituting a different
proof for "you're allowed to do this":
- `Service.SetUserPassword` (`add-update-user`) — Tenant Admin authority
  substitutes for proof; the admin picks the value directly.
- `Service.ResetPassword` (`add-forgot-password`) — a single-use emailed
  token substitutes for proof.
- (this change) self-service change — the current password itself is the
  proof.

The user's direction: admin authority alone should no longer be sufficient
to *know* another account's real password. It should trigger one of the
other two mechanisms instead — send them the email-token path, or force
them through the current-password-substitute-free "require change at next
login" path — with a direct, admin-generated *temporary* value kept only
as a fallback for instances that can't do email at all.

## Goals / Non-Goals

**Goals:**
- Self-service change-password, own-account-only, reusing existing
  primitives (`domain.ValidatePassword`, `bcrypt`, `SessionRepo.DeleteByUser`).
- Replace `SetUserPassword`'s free-text field entirely — an admin can no
  longer submit an arbitrary password string for someone else.
- A `requirePasswordChange` flag, enforced both client-side (a real gate,
  not just hiding a button) and server-side (a client bypassing the UI
  still can't reach ordinary routes).
- A generate-only temporary-password fallback, available only when SMTP
  is not configured, that always forces `requirePasswordChange` in the
  same action.
- Reuse the same email-sending machinery `add-forgot-password` built for
  the admin-triggered reset-email action, rather than a parallel
  implementation.

**Non-Goals:**
- No password-strength meter — same 12-character floor as everywhere else.
- No rate limiting on the self-service change endpoint — it requires an
  already-authenticated session, not an anonymous surface (same reasoning
  as `add-forgot-password` design.md's rate-limit decision).
- No mid-session enforcement of `requirePasswordChange` — "at next login"
  is enforced exactly there: the login response signals it, the frontend
  gates before the app shell, and the server blocks non-allowlisted
  routes for that session. A session that started *before* the flag was
  set is not retroactively interrupted; the flag's own name is "at next
  login," not "immediately."
- Not touching the New-user creation form's existing Generate button —
  out of scope per explicit instruction.

## Decisions

- **`SetUserPassword` is removed, not deprecated-in-place.** Its
  free-text `password` parameter is exactly the capability being revoked;
  keeping the method around with unclear semantics would be worse than a
  clean removal. `PATCH /api/v1/users/{userId}`'s `password` field is
  removed from the request schema (**BREAKING**, acceptable pre-1.0.0).

- **Three new/changed service methods, one middleware:**
  - `Service.ChangeOwnPassword(ctx, actor, currentPassword, newPassword) error` —
    verifies `currentPassword` via `bcrypt.CompareHashAndPassword` against
    the actor's own stored hash (generic `unauthorized` on mismatch, same
    no-enumeration posture `Login` already has), validates + hashes +
    stores the new one, revokes every session, **clears**
    `must_change_password` if it was set (this is the only path that can
    clear it — the whole point of the flag is that it survives until the
    owner sets their own real password).
  - `Service.SendPasswordResetEmail(ctx, actor, userID) error` (admin
    variant) — Tenant-Admin-only, `forbidden` otherwise; rejects with
    `invalid` if `!s.passwordResetEnabled`; looks up the target directly
    (no enumeration concern — the admin already knows the account is
    real) and calls a new unexported `s.sendPasswordResetEmail(ctx, user)`
    helper extracted from the existing `ForgotPassword` (identity.go
    lines ~222-233: token creation + email body + send) — both the public
    and admin-triggered paths now share that one implementation instead
    of two copies.
  - `Service.SetRequirePasswordChange(ctx, actor, userID, require bool) error` —
    Tenant-Admin-only; just flips the column. (`bool` not just "set true"
    — an admin might want to clear a flag they set by mistake, without
    forcing a whole password cycle to do it.)
  - `Service.GenerateTemporaryPassword(ctx, actor, userID) (string, error)` —
    Tenant-Admin-only; rejects with `invalid` if `s.passwordResetEnabled`
    (the fallback is unavailable, full stop, when the proper path exists —
    server-enforced, not just a hidden button). Generates a random raw
    password server-side (new unexported `generateTemporaryPassword()` in
    identity.go, `crypto/rand`-based, mirroring
    `apps/web/src/lib/generatePassword.ts`'s approach — 58-character
    alphabet excluding ambiguous characters, 20 characters, rejection
    sampling to avoid modulo bias — a design already established and
    reused here rather than invented fresh), stores its hash, sets
    `must_change_password = true`, revokes every session, returns the raw
    value once (reveal-once — the handler never logs it, same discipline
    as `CreateToken`'s full token value).
  - A new `requireNoPendingPasswordChange` middleware (mirrors
    `requireTenantAdmin`'s shape in `apps/api/internal/server/`) applied
    to every authenticated route *except* an explicit allowlist:
    `POST /auth/logout`, `POST /users/me/password`, `GET /users/me`.
    Everything else 403s for an actor whose underlying user has
    `MustChangePassword = true`. `domain.Actor` gains a
    `MustChangePassword bool`, resolved in `AuthenticateSession` (an
    agent/token actor has no such flag — always `false` for
    `ActorKindAgent`, since only human accounts log in interactively and
    hit this gate).

- **The frontend never has to *discover* the flag via a failed request.**
  `Login`'s response (the `User` it already returns) includes
  `mustChangePassword`; the frontend reads it right there and routes to a
  full-screen gate before ever rendering the app shell — the same
  full-screen pattern `ForgotPasswordPage`/`ResetPasswordPage` already
  use, not a dismissable modal. The server-side middleware exists as
  defense-in-depth against a client bypassing that gate (e.g. calling the
  API directly), not as the mechanism the UI depends on to know to show
  it.

- **The temporary-password fallback UI is generate-only — no free-text
  input at all**, in either direction (the server won't accept a
  client-supplied value even if the frontend tried to send one; the
  frontend doesn't offer the field). This is what actually delivers "only
  the account owner sets their real password": the admin-set value is
  mechanically temporary (forced rotation is atomic with setting it), not
  a value that depends on the admin remembering to also flag it
  separately.

- **`GeneratedPasswordChip` moves to `apps/web/src/components/GeneratedPasswordChip.tsx`.**
  It's currently module-private to `PeoplePage.tsx`; three call sites
  (New-user form, `ResetPasswordPage.tsx`, the admin temporary-password
  fallback) need it now. A mechanical extraction, not a redesign of the
  component itself.

## Risks / Trade-offs

[An admin on an SMTP-configured instance loses the ability to hand a
specific memorable password to a user directly (e.g. over the phone)] →
Accepted: that capability is exactly what's being removed on purpose. The
reset-email path covers the legitimate case (the user sets their own
value); a phone-dictated password was already the weaker practice this
change exists to close off.

[Server-side middleware adds a new cross-cutting check to every
authenticated route] → Scoped tightly (one boolean read off the already-
resolved actor, one small allowlist) — mirrors `requireTenantAdmin`'s
existing shape rather than introducing a new enforcement pattern.

[`openspec/changes/archive/2026-08-14-add-forgot-password/design.md`'s
Risks section describes the old admin fallback ("they contact their
Tenant Admin, who has a real reset path") in terms that no longer match
this change's shape exactly] → The archived document is left as-is (it
accurately reflected the trade-off at the time it was written); the
current, accurate description of the admin fallback lives here and in
`openspec/specs/authentication/spec.md` once this change archives —
archived design docs are historical record, not living documentation.
