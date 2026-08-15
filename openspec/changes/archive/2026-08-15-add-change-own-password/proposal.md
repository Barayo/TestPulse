## Why

As a logged-in user who knows their current password, when I want to change
it without contacting a Tenant Admin or going through email-based recovery,
I want a self-service "Change password" action on my Profile page, so the
common case (I just want a new password, I'm not locked out) doesn't
require anyone else's involvement.

As a Tenant Admin managing another user's account, when that user needs a
new password, I want to trigger it *indirectly* (send them a reset email,
or require them to set one at next login) rather than choosing and knowing
their real password myself — only the account owner should ever set the
actual value of their own password. A direct, admin-chosen password should
only exist as a fallback for instances that can't provision SMTP at all,
and even then it should be a generated, forced-to-rotate temporary value,
never a string an admin picks and that persists indefinitely as someone's
real credential.

Found live in the running app (2026-08-14): the "Change password" row on
`/settings/profile` has been a permanently disabled placeholder ("Coming
soon" / "Password login isn't available yet on this instance") since
before password login even existed as this app's only auth method. Fixing
that surfaced the adjacent question of what a Tenant Admin's password
capability should look like now that self-service (both change and
recovery) exist — this change addresses both together.

## What Changes

**Self-service (any authenticated user, own account only):**
- Add `POST /api/v1/users/me/password` — change your own password given
  the current one (verified server-side) and a new one. Revokes every
  session for the account, including the one making the request.
- Replace the disabled Profile row with a working dialog.
- Add the same "Generate" password-suggestion affordance already used
  elsewhere to `ResetPasswordPage.tsx`.

**Admin (Tenant Admin managing another user), replacing today's
directly-set-any-password behavior:**
- **BREAKING**: `PATCH /api/v1/users/{userId}` no longer accepts a
  `password` field — an admin can no longer submit an arbitrary chosen
  password string for another account.
- Add `PATCH /api/v1/users/{userId}` support for `requirePasswordChange:
  true` — flags the account; enforced at the account's *next* login (not
  mid-session), reusing the self-service change-password form.
- Add `POST /api/v1/users/{userId}/password-reset-email` — Tenant Admin
  triggers the same reset-email flow `add-forgot-password` built,
  addressed at a specific known account (no enumeration concern — the
  caller is already an admin acting on a real account). Available only
  when the instance has SMTP configured (`passwordResetEnabled`).
- Add `POST /api/v1/users/{userId}/generate-temporary-password` — the
  fallback for an SMTP-less instance: server generates a random password,
  sets it, forces `requirePasswordChange` in the same action, revokes all
  sessions, and returns the raw value once (reveal-once, same pattern as
  API token creation). Rejected server-side when SMTP *is* configured —
  the reset-email path is the required route when it's available, not
  just the UI default.

**Shared:**
- Extract `GeneratedPasswordChip` (currently private to `PeoplePage.tsx`)
  into a shared component — now used by the New-user form (unchanged),
  `ResetPasswordPage.tsx`, and the admin temporary-password fallback.
- New `users.must_change_password` column; enforced both client-side (a
  full-screen gate after login, before the app shell) and server-side (an
  authenticated user with the flag set can only reach the change-password
  endpoint, logout, and their own profile read — everything else is
  rejected, so the gate isn't just a client-side UI convention).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `authentication`: the "Local user accounts" requirement's Tenant-Admin
  password behavior changes (direct set → indirect actions); new
  requirements added for self-service change, admin-triggered reset
  email, required-password-change enforcement, and the temporary-password
  fallback.

## Impact

- `apps/api/internal/db/schema.sql` — new `users.must_change_password`
  column
- `apps/api/internal/domain/domain.go` — `User.MustChangePassword`,
  `domain.Actor.MustChangePassword`
- `apps/api/internal/service/identity.go` — `ChangeOwnPassword`,
  `SendPasswordResetEmail` (admin-triggered variant), `RequirePasswordChange`,
  `GenerateTemporaryPassword`; `SetUserPassword` removed
- `apps/api/internal/server/identity_handlers.go` — new routes; a new
  middleware enforcing the must-change-password gate server-side
  `packages/shared/openapi.yaml` — new/changed endpoints, `password`
  removed from the user-update schema
- `apps/web/src/pages/ProfilePage.tsx` — real change-password dialog
- `apps/web/src/pages/PeoplePage.tsx` — Edit-user dialog reworked (no free
  password field; reset-email / require-change / generate-fallback
  actions)
- `apps/web/src/pages/ResetPasswordPage.tsx` — Generate affordance added
- `apps/web/src/components/GeneratedPasswordChip.tsx` — new shared
  component (extracted)
- A new full-screen "you must change your password" page/gate, reached
  right after login when the flag is set
- `apps/api/internal/sampledata/seed.go` — Sample Project showcase task
