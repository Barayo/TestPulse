## Why

As a Tenant Admin, when I need to fix a user's typo'd email or a user is locked out of their account, I want to update that account directly, instead of having no path at all — today `POST /api/v1/users` creates an account, but nothing ever lets its email or password change again, for the admin or the user themselves (#65).

## What Changes

- Add email and password fields to user update: a Tenant Admin can change a target user's email and/or set a new password directly (no reset-link flow — that's a separate concern, see #66).
- Existing sessions for that user are revoked when their password changes, so a stolen/compromised session can't outlive the reset.
- Add an "Edit" action per row on the People page's Users table, opening a dialog — mirrors the existing "New user" form, keeping email/password out of the always-visible row.
- Both the Edit dialog's and "New user" form's password fields get a "Generate" affordance — a client-side, `crypto.getRandomValues()`-backed secure password, revealed once with copy-to-clipboard (same "shown once" idiom as API token creation) — so an admin isn't left inventing a password by hand.
- Self-service password/email change (by the user themselves) stays out of scope — this is admin-initiated only, matching the issue's own framing.

## Capabilities

### New Capabilities
(none — this modifies an existing capability)

### Modified Capabilities
- `authentication`: extend "Local user accounts" with Tenant-Admin-initiated email/password updates, and fix its "Weak password is rejected" scenario's stale 8-character threshold to the actual enforced minimum (12, `harden(api)` #118).

## Impact

- `apps/api/internal/store/users.go` — new email/password-hash update queries
- `apps/api/internal/service/identity.go` — `UpdateUser` gains email/password handling, validates uniqueness and strength, revokes sessions on password change
- `apps/api/internal/server/identity_handlers.go` — `PATCH /api/v1/users/{userId}` request body gains `email`/`password`
- `packages/shared/openapi.yaml` (+ regenerated `packages/shared/src/api.ts`)
- `apps/web/src/pages/PeoplePage.tsx` — Edit action + dialog on each user row, plus Generate on both password fields
- `apps/web/src/lib/generatePassword.ts` — new client-side secure password generator
- `docs/api.md`
