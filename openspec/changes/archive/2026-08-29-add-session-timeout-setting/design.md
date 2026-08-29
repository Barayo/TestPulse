## Context

`sessionLifetime` (`apps/api/internal/service/identity.go:19`) is a package-level `const = 30 * 24 * time.Hour`, read at two call sites: `createSession` (session creation, on login and on `SetupFirstAdmin`) and the session-validation path that extends a session's expiry on every authenticated request (the sliding window). `instance_settings` already holds several Tenant-Admin-configurable, instance-wide values (`autoArchiveInactiveDays`, `runRetentionDays`, `publicProjectsEnabled`, ...), each following the same shape: a column, a field on `domain.InstanceSettings`/`InstanceSettingsUpdate`, and a card on `InstanceSettingsPage.tsx`. `s.store.InstanceSettings.Get(ctx)` is already called inline, uncached, from several places in `identity.go` itself (e.g. the `OIDCOnly` check in `Login`) and from both background workers — there is no existing caching layer for instance settings anywhere in the codebase.

## Goals / Non-Goals

**Goals:**
- Session timeout becomes a Tenant-Admin-configurable, bounded value, following the exact existing `autoArchiveInactiveDays` shape.
- No behavior change for already-active sessions when the setting changes.

**Non-Goals:**
- A general instance-settings caching layer — out of scope; see Decisions.
- Per-user or per-role session timeouts — this is a single instance-wide value, like every other instance setting.
- Retroactively shortening/extending already-active sessions when the admin changes the value.

## Decisions

**D1 — Read the setting inline at both call sites, no caching.**
The sliding-window extension path (on every authenticated request) will gain one more `s.store.InstanceSettings.Get(ctx)` call, alongside the `Sessions.Extend` update it already does. `instance_settings` is a true singleton table (one row, checked via existing code elsewhere) — the read is a trivial indexed/full-scan-of-one-row lookup, not a candidate for the kind of aggregate-query cost `add-project-stats-endpoint`-style batching concerns itself with. Caching would need an invalidation story (an admin's change should take effect promptly, not after some TTL) for a cost that doesn't justify it at this project's scale — consistent with there being zero caching anywhere else `InstanceSettings.Get` is already called inline and uncached (`Login`'s `OIDCOnly` check, both background workers, `sso_oidc.go`).

**D2 — Bound to 1–90 days, validated in the service layer.**
The issue's own open question ("no min/max bound") gets resolved here: reject `< 1` or `> 90` with the existing validation-error convention (`invalid(...)`, matching how other instance-settings fields are already validated in `instance_settings.go`). 1 day is the practical floor (anything shorter makes "sliding window" meaningless); 90 days is a generous ceiling matching common enterprise session-length norms, without being unbounded.

**D3 — Changing the value only affects future session create/extend calls.**
No migration/backfill touches `sessions.expires_at` for already-active sessions when the setting changes — mirrors `autoArchiveInactiveDays`'s own behavior (changing the threshold doesn't retroactively archive projects that already exceed it; the auto-archive worker only acts on its next scheduled pass). Simpler to reason about, and avoids surprising an admin by invalidating sessions (including their own) the instant they change the setting.

## Risks / Trade-offs

- **[Risk]** One extra DB read per authenticated request (the sliding-window path). → **Mitigation**: accepted per D1 — a single-row lookup, and the pattern is already established elsewhere in this exact file.
- **[Trade-off]** A shortened timeout doesn't retroactively expire already-active sessions (D3) — an admin tightening security won't see it take effect for currently-logged-in users until their session naturally expires or they re-authenticate. Acceptable: this mirrors every other instance-setting's forward-only semantics in this codebase, and a true "kill all sessions now" capability is a different, larger feature (bulk session revocation) not asked for here.

## Migration Plan

New migration `00009_session_timeout_setting.sql` (next after `00008_project_tags.sql`), additive-only: `instance_settings.session_timeout_days integer DEFAULT 30 NOT NULL`. Existing rows get the same 30-day default the hardcoded constant already enforced, so no behavior changes for any existing deployment until an admin explicitly changes it.
