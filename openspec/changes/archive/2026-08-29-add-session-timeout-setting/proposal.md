## Why

As a Tenant Admin, when my organization's security posture calls for a shorter re-login window (or my team wants fewer re-login interruptions than the default), I want to configure how long a session stays valid — instead the sliding session expiry is a hardcoded 30 days (`apps/api/internal/service/identity.go`'s `sessionLifetime` constant) that no one can change without a code edit. This surfaced directly while shipping `handle-session-expiry` (the re-login modal), which made session expiry a much more visible, deliberate UX moment (GH #64).

## What Changes

- A new Tenant-Admin-configurable `sessionTimeoutDays` instance setting (default 30, bounded 1–90) — same shape and update path as the existing `autoArchiveInactiveDays` setting.
- `sessionLifetime` becomes dynamic: session creation (login) and the sliding-window extension (each authenticated request) read the current instance-wide value instead of a hardcoded constant.
- Changing the setting affects only sessions created or extended *after* the change — already-active sessions keep whatever expiry they were already given, consistent with how the existing auto-archive threshold doesn't retroactively archive already-active projects.
- A new "Session timeout" card on the existing `InstanceSettingsPage.tsx` — no new page. That page **is** the "Application Settings page for Tenant Admin" GH #64 originally asked for; it already exists (public access, run retention, auto-archive, color theme, Jira sections) and just gained a gap in its own recent history, not a whole new IA surface.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `authentication`: the "Session-based login" requirement's fixed "30 days" becomes a Tenant-Admin-configurable, bounded value.

## Impact

- **Domain/DB**: `instance_settings` gains `session_timeout_days integer DEFAULT 30 NOT NULL`, new migration file.
- **API**: existing `PATCH /api/v1/instance-settings` gains `sessionTimeoutDays`, with 1–90 bounds validation.
- **Service**: `sessionLifetime` constant replaced with a per-request read of the current setting at the two existing call sites (session create, session extend) — no new call sites.
- **Web**: `InstanceSettingsPage.tsx` gains one more settings card, following the existing pattern exactly.
- **Docs**: `docs/api.md`, `docs/database.md` gain the new field; note the now-configurable duration wherever the 30-day default was previously stated as fixed.
