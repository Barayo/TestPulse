## Context

`updateUser` (`server/identity_handlers.go`) already handles `isTenantAdmin`/`deactivate`/`reactivate` via `PATCH /api/v1/users/{userId}`. Nothing today ever changes a user's email or password after creation — not the Tenant Admin, not the user themselves (`updateCurrentUserProfile` only touches `displayName`/`avatarKey`/`timezone`). `domain.ValidateEmail`/`domain.ValidatePassword` already exist and are reused by `CreateUser`; this change reuses them for updates too, so behavior stays consistent (same 12-character minimum, same email shape check).

## Goals / Non-Goals

**Goals:**
- Let a Tenant Admin change a target user's email and/or set a new password.
- Revoke that user's existing sessions when their password changes, so a session can't outlive a reset (the one place this matters — deactivation doesn't need this, since `AuthenticateSession` re-checks `deactivated_at` live on every request; a session's validity is never re-derived from the password hash, so nothing else invalidates it).

**Non-Goals:**
- No self-service password/email change (by the user themselves) — a separate concern, not scoped here.
- No reset-link/forgot-password email flow (#66) — this is an admin directly setting a new value, not a token-based flow.
- No password history/reuse checks — out of scope, matches `CreateUser`'s existing bar.

## Decisions

- **Extend the existing `PATCH /api/v1/users/{userId}` body** with optional `email`/`password` fields, rather than a new endpoint — it's the same "Tenant Admin edits a user" action, and the handler already branches per-field the same way `isTenantAdmin`/`deactivate`/`reactivate` do.
- **`Service.UpdateUser` validates before writing**: `domain.ValidateEmail`/`domain.ValidatePassword` (reused, not reimplemented), uniqueness on email change (same `isUniqueViolation` handling `CreateUser` already has), and re-hashes with bcrypt on password change.
- **New `SessionRepo.DeleteByUser(ctx, userID) error`** (`DELETE FROM sessions WHERE user_id = $1`, already indexed) called only when the password actually changes — not on every update, so an email-only edit doesn't force a re-login.
- **UI**: an "Edit" action per row on `PeoplePage.tsx`'s Users table opens a dialog pre-filled with the current email; password is a blank field ("leave blank to keep the current password") rather than showing/requiring the existing one — mirrors "New user"'s form, not the destructive-confirmation dialog pattern (this isn't destructive). Visual details finalized via Pepe before implementation, per standing practice.

## Risks / Trade-offs

[An admin could change a user's email to one that user doesn't control, effectively locking them out or redirecting their identity] → No mitigation beyond the existing trust model: Tenant Admin already has unilateral power over every account (deactivate, delete, change admin flag) — this is the same trust boundary, not a new one.
[Revoking sessions on password change logs the user out of every device, including ones they're actively using] → Deliberate — same trade-off any "reset password" flow makes; the alternative (stale sessions surviving a reset) is worse.
