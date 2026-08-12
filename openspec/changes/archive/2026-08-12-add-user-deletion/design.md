## Context

`add-project-rbac` (merged) established a permission-flag catalog for project-scoped destructive actions (role delete, run delete, project delete via the sibling `add-data-retention` change) and a confirmation-dialog pattern (`RolesPage.tsx`'s "Reset to defaults", reused for user deactivation and team-member removal in `apps/web/src/pages/PeoplePage.tsx`). This change extends that same discipline to user accounts, which today can only be deactivated, never removed.

Two things are true about the current codebase, checked directly rather than assumed:

1. **User management is gated by plain Tenant Admin status, not a project-scoped permission flag.** `identity_handlers.go` mounts `POST /users` and `PATCH /users/{userId}` behind `requireTenantAdmin` — a boolean check, not `requirePermission(domain.PermX, ...)` against the ten-flag `roles` catalog. That catalog is inherently project-scoped (every flag answers "can this role do X *on this project*"); a user account isn't scoped to a project, so it was never a fit. User deletion should follow the same existing gate, not invent a new project-scoped flag that doesn't apply to an instance-wide entity.

2. **Self-deactivation is only blocked in the frontend today.** `PeoplePage.tsx` hides the Deactivate button when `u.id === me.id`, but `Service.DeactivateUser` takes no `actor` parameter and performs no self-check — a Tenant Admin could deactivate their own account via a direct API call. This is a pre-existing gap, not introduced by this change, but user *deletion* is strictly more dangerous (irreversible), so this change adds a real, server-side self-guard for deletion specifically. The deactivation gap is noted in Risks as a related, separately-fixable issue — fixing it is not blocking this change, but it shouldn't be forgotten either.

## Goals / Non-Goals

**Goals:**
- Let a Tenant Admin permanently delete a user account, but only once it's already deactivated.
- Make the schema consistent under deletion: today, deleting a user would silently cascade through some references (team/project membership) while hard-blocking on others (sessions, tokens) with a raw FK violation — the same "some things cascade, some don't, and nobody decided that on purpose" shape that caused the accidental role-deletion incident earlier in this project's history, just distributed differently. Fix this deliberately, not accidentally.
- Every deletion is manual and explicitly confirmed, naming the account and what it's connected to.

**Non-Goals:**
- No anonymization, no data-export/GDPR tooling, no self-service deletion (see proposal.md).
- No age-based/automatic deletion.
- No change to `audit_log` or `test_run_results.actor` — both store actor identity as free text already, confirmed against the schema, so they're structurally unaffected by a user row disappearing.
- No async/batched deletion worker (contrast with `add-data-retention` D6's worker for project deletion). A single user's fan-out — a handful of team memberships, project memberships, sessions, and tokens — is small and bounded, nothing like a project's potentially-unbounded run history. A single synchronous `DELETE FROM users WHERE id = $1` relying on cascade is sufficient; introducing async machinery here would be solving a problem this change doesn't have.

## Decisions

### D1: Gate deletion by Tenant Admin status, not a new project-scoped permission flag

`DeleteUser` is gated the same way `CreateUser`/`SetTenantAdmin`/`DeactivateUser` already are: `requireTenantAdmin` middleware, checked directly in `identity_handlers.go` before writing this decision rather than assumed. A project-scoped `roles` flag (the `add-project-rbac` D11 pattern) answers "what can this role do on project X" — a user account isn't project-scoped, so forcing this into that catalog would be a category error, not consistency. No migration column, no `RolesPage.tsx` change, no new `domain.Permission` const.

**Alternative considered**: a new instance-wide (non-project-scoped) permission flag, separate from the `roles` table entirely. Rejected as unnecessary — every existing instance-wide admin action (create user, deactivate, tenant-admin toggle) already uses the same plain boolean gate; introducing a differently-shaped permission primitive for just this one action would be inconsistent with the pattern already established for its siblings.

### D2: Deletion requires the user to already be deactivated — enforced server-side

`DeleteUser` returns a validation error if `user.deactivatedAt == nil`, regardless of what the UI shows — same reasoning as `add-data-retention` D4 (project deletion requires `archived == true`, enforced server-side): never trust client-side hiding alone for anything destructive. This forces the two-step "deactivate, then separately delete" flow — deactivation is the reversible, low-stakes first step (already exists); deletion is the deliberate, irreversible second one.

### D3: Self-deletion is blocked server-side, in the service layer, not just the UI

`Service.DeleteUser(ctx, actor domain.Actor, userID string)` (note: gains an `actor` parameter, unlike the existing `DeactivateUser`/`ReactivateUser`/`SetTenantAdmin`, which don't take one today) rejects `actor.EffectiveUserID == userID` before doing anything else. This is the same class of gap D2 addresses (client-side-only guards aren't real guards) applied to self-targeting rather than the deactivated-first precondition.

### D4: New migration `00014_cascade_user_deletion.sql` adds `ON DELETE CASCADE` to `sessions.user_id` and `api_tokens.created_by`

Both are plain `REFERENCES users (id)` today with no `ON DELETE` clause (checked directly, not assumed) — meaning the default `RESTRICT` applies, and `DELETE FROM users` would fail with a foreign-key violation for any user who has ever logged in (has a session row, even an expired one that hasn't been purged) or created an API token. CLAUDE.md's migration policy requires a real incremental migration, one file per schema change — never editing a migration already on `main` — after a real production outage (2026-07-25) caused by exactly that; this draft originally predates that policy and is corrected here rather than implemented as originally written.

Cascading `api_tokens.created_by` means deleting a user revokes every token they created for agents, as a side effect. This is judged acceptable: the user is already deactivated (their own access is already revoked), and a token that agent-authenticates *as* a now-nonexistent user shouldn't keep working — a live token whose creator no longer exists would be a dangling-identity problem, not a convenience worth preserving.

`team_members.user_id`, `project_members.user_id`, and `project_favorites.user_id` already cascade correctly (checked directly) — no change needed there.

**Alternative considered**: instead of cascading tokens, explicitly revoke them (set `revoked_at`) as part of `DeleteUser` and leave the token rows in place for audit purposes, only cascading `sessions`. Rejected — `api_tokens` isn't referenced by anything else once its creator is gone (unlike `audit_log`, which is free-text and needs no such treatment), so keeping a revoked-but-orphaned token row serves no purpose the audit log doesn't already serve (token creation is itself an audited action, per `s.audit(ctx, "create", "api_token", tok.ID)` in the existing `CreateToken`).

### D5: Confirmation dialog shows real reference counts, not a generic warning

Mirrors `add-data-retention` D5. Before deleting, the dialog states the account being removed and what it's connected to: team count, direct project-membership count, and live (non-revoked) API token count. "Delete demo1@example.com? Removes them from 2 teams, 1 project, and revokes 3 API tokens. This cannot be undone."

**Revised during implementation** (Pepe/design review caught this): the original draft claimed team count and project-membership count were "already available client-side from `PeoplePage.tsx`'s loaded `users`/`teams` state — no new endpoint needed." True for teams (`teams[].memberIds` is already loaded); false for projects — `PeoplePage.tsx` never loads projects or project membership, `User` carries no project-membership field, and there is no reverse lookup (`GET /api/v1/projects/{key}/members` only goes project→users). Computing a project count client-side would mean fetching every project then every project's member list and counting matches — an N+1 fan-out, the exact "aggregate features must be DB-scale, not client-side loops" trap this project has already been burned by once. Fix: one new endpoint, `GET /api/v1/users/{userId}/deletion-preview` (Tenant Admin only, same `requireTenantAdmin` gate as the rest of user management), returning `{teamCount, projectCount, tokenCount}` in a single round trip — team count is recomputed server-side here too rather than trusted from client state, so all three numbers come from the same authoritative source at the moment the dialog opens.

## Risks / Trade-offs

- **[Irreversible by construction]** No undo, no trash state — once confirmed, the row and everything cascading from it are gone. → Mitigation: the deactivated-first precondition (D2) means there's always a reversible step before the irreversible one; the confirmation dialog's real counts (D5) make the blast radius visible before confirming, not after.
- **[Pre-existing gap: self-deactivation has no server-side guard today]** Found while investigating this change, not introduced by it. `DeactivateUser`/`ReactivateUser`/`SetTenantAdmin` all take no `actor` parameter and perform no self-check server-side — only `PeoplePage.tsx` hides the button. A Tenant Admin could deactivate themselves via a direct API call today. → Mitigation: out of scope for this change (deletion gets the real guard via D3; deactivation's gap is milder — reversible via another admin's Reactivate — but worth a small follow-up task to add the same server-side check there too, noted in tasks.md as a fast-follow, not blocking).
- **[The new migration changes session/token cascade behavior for every user, not just deletion]** `sessions`/`api_tokens` gaining `ON DELETE CASCADE` is additive at the constraint level (only takes effect on delete; no change to existing insert/read/update behavior). `add-data-retention`'s equivalent change should be checked for the same now-outdated "amend in place" assumption before it's implemented, too. The standing verification step (full `go test ./...`, plus a clean `docker compose down -v` + rebuild) is exactly the check that would catch a mistake here.
